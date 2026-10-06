import { randomUUID } from 'crypto';
import { db } from '../db/index.ts';
import { businesses, services, tickets } from '../db/schema.ts';
import { and, desc, eq, inArray, or } from 'drizzle-orm';
import {
  getManilaDateAndTime,
  getPublicQueueStateBySlug,
  getPublicTicketState,
  invalidatePublicQueueCache,
  isPastCutoffTime,
} from './QueueCalculations.ts';
import {
  isValidPhilippinePhone,
  normalizePhilippinePhone,
} from './PhoneNormalizer.ts';
import { RealtimeBroadcaster } from './RealtimeBroadcaster.ts';
import { OwnerAlerts } from './OwnerAlerts.ts';
import { SemaphoreSmsService } from './SemaphoreSmsService.ts';

// Per-service in-process mutex to serialize ticket numbering alongside DB unique constraint
const serviceJoinLocks = new Map<number, Promise<void>>();

async function withServiceLock<T>(
  serviceId: number,
  fn: () => Promise<T>
): Promise<T> {
  const prev = serviceJoinLocks.get(serviceId) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((res) => {
    release = res;
  });
  serviceJoinLocks.set(
    serviceId,
    prev.then(() => current)
  );
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

export interface CreateTicketInput {
  slug: string;
  qrToken: string;
  serviceId: number;
  customerName: string;
  phone?: string | null;
  idempotencyKey: string;
  deviceId: string;
  honeypot?: string;
  appUrl: string;
}

export interface CreateTicketResult {
  ok: boolean;
  status: number;
  error?: string;
  alreadyActive?: boolean;
  idempotentReplay?: boolean;
  ticket?: Awaited<ReturnType<typeof getPublicTicketState>>;
}

export class CreateTicket {
  public static async execute(
    input: CreateTicketInput
  ): Promise<CreateTicketResult> {
    try {
      // 0. Honeypot spam protection
      if (input.honeypot && input.honeypot.trim() !== '') {
        return {
          ok: false,
          status: 400,
          error: 'Spam submission rejected.',
        };
      }

      const cleanIdempotencyKey = (input.idempotencyKey || '').trim();
      if (!cleanIdempotencyKey) {
        return {
          ok: false,
          status: 422,
          error: 'Missing idempotency key.',
        };
      }

      // 1. Check idempotency key first (handles double-taps and slow-network resubmits)
      const existingByIdempotency = await db
        .select()
        .from(tickets)
        .where(eq(tickets.idempotencyKey, cleanIdempotencyKey));

      if (existingByIdempotency.length > 0) {
        const ticketState = await getPublicTicketState(
          existingByIdempotency[0].id
        );
        return {
          ok: true,
          status: 200,
          idempotentReplay: true,
          ticket: ticketState,
        };
      }

      // 2. Validate business, QR token, open state, cutoff time, and service
      const bizRows = await db
        .select()
        .from(businesses)
        .where(eq(businesses.slug, input.slug));

      if (bizRows.length === 0) {
        return { ok: false, status: 404, error: 'Business not found.' };
      }
      const biz = bizRows[0];

      if (!input.qrToken || input.qrToken.trim() !== biz.qrToken) {
        return {
          ok: false,
          status: 403,
          error:
            'Invalid or expired QR token. Please scan the current QR code at the shop.',
        };
      }

      if (!biz.isOpen) {
        return {
          ok: false,
          status: 403,
          error:
            'The queue is currently paused by the owner. Please wait for it to reopen.',
        };
      }

      const { manilaDate, manilaTime } = getManilaDateAndTime();
      if (isPastCutoffTime(biz.joinCutoffTime, manilaTime)) {
        return {
          ok: false,
          status: 403,
          error: `Queue joins have closed for today (cutoff time: ${biz.joinCutoffTime}).`,
        };
      }

      const customerName = (input.customerName || '').trim();
      if (customerName.length < 2 || customerName.length > 60) {
        return {
          ok: false,
          status: 422,
          error: 'Please enter your name (2–60 characters).',
        };
      }

      if (!isValidPhilippinePhone(input.phone)) {
        return {
          ok: false,
          status: 422,
          error:
            'Please enter a valid Philippine mobile number (e.g. 0917 123 4567) or leave it blank.',
        };
      }

      const normalizedPhone = normalizePhilippinePhone(input.phone);
      const deviceId = (input.deviceId || '').trim() || randomUUID();

      const svcRows = await db
        .select()
        .from(services)
        .where(
          and(
            eq(services.id, Number(input.serviceId)),
            eq(services.businessId, biz.id)
          )
        );

      if (svcRows.length === 0 || !svcRows[0].isActive) {
        return {
          ok: false,
          status: 422,
          error: 'Selected service is unavailable.',
        };
      }
      const svc = svcRows[0];

      // 3. One-active-ticket check per device_id OR normalized phone for this business today
      const activeCondition = normalizedPhone
        ? or(
            eq(tickets.deviceId, deviceId),
            eq(tickets.phone, normalizedPhone)
          )
        : eq(tickets.deviceId, deviceId);

      const existingActive = await db
        .select()
        .from(tickets)
        .where(
          and(
            eq(tickets.businessId, biz.id),
            eq(tickets.queueDate, manilaDate),
            inArray(tickets.status, ['waiting', 'called']),
            activeCondition
          )
        );

      if (existingActive.length > 0) {
        const activeTicketState = await getPublicTicketState(
          existingActive[0].id
        );
        return {
          ok: true,
          status: 200,
          alreadyActive: true,
          ticket: activeTicketState,
        };
      }

      // 4. Atomic lock on service + capacity recheck + daily ticket numbering
      const createdResult = await withServiceLock(svc.id, async () => {
        const currentWaiting = await db
          .select()
          .from(tickets)
          .where(
            and(
              eq(tickets.businessId, biz.id),
              eq(tickets.queueDate, manilaDate),
              eq(tickets.status, 'waiting')
            )
          );

        if (
          biz.maxWaiting !== null &&
          currentWaiting.length >= biz.maxWaiting
        ) {
          return {
            full: true as const,
            ticketId: null,
          };
        }

        // Compute max(number) + 1 for (service_id, queue_date)
        const latestServiceTickets = await db
          .select()
          .from(tickets)
          .where(
            and(
              eq(tickets.serviceId, svc.id),
              eq(tickets.queueDate, manilaDate)
            )
          )
          .orderBy(desc(tickets.number));

        const nextNumber =
          latestServiceTickets.length > 0
            ? latestServiceTickets[0].number + 1
            : 1;
        const code = `${svc.prefix.toUpperCase()}-${String(nextNumber).padStart(
          3,
          '0'
        )}`;
        const ticketId = randomUUID();

        await db.insert(tickets).values({
          id: ticketId,
          businessId: biz.id,
          serviceId: svc.id,
          counterId: null,
          queueDate: manilaDate,
          number: nextNumber,
          code,
          customerName,
          phone: normalizedPhone,
          status: 'waiting',
          idempotencyKey: cleanIdempotencyKey,
          deviceId,
        });

        return {
          full: false as const,
          ticketId,
          code,
          waitingPosition: currentWaiting.length + 1,
        };
      });

      if (createdResult.full || !createdResult.ticketId) {
        return {
          ok: false,
          status: 409,
          error: 'Queue is full, please try again later.',
        };
      }

      // 5. After commit: invalidate cache, broadcast `ticket.joined`, and check near SMS
      invalidatePublicQueueCache(biz.id);
      const freshPublicState = await getPublicQueueStateBySlug(biz.slug, true);

      if (freshPublicState) {
        await RealtimeBroadcaster.broadcastQueueEvent(biz.id, 'ticket.joined', {
          code: createdResult.code,
          counter: null,
          status: 'waiting',
          waiting_count: freshPublicState.waitingCount,
          waiting_codes: freshPublicState.waitingCodes,
          now_serving: freshPublicState.nowServing,
        });

        // Not awaited: the customer's join shouldn't wait on push services.
        void OwnerAlerts.customerJoined({
          businessId: biz.id,
          code: createdResult.code,
          customerName,
          serviceName: svc.name,
          waitingCount: freshPublicState.waitingCount,
          maxWaiting: biz.maxWaiting,
        });
      }

      // If this customer joined directly at or within `nearThreshold`, send near SMS
      if (
        normalizedPhone &&
        createdResult.waitingPosition <= biz.nearThreshold
      ) {
        await SemaphoreSmsService.sendNearSmsIfEligible({
          ticketId: createdResult.ticketId,
          businessId: biz.id,
          businessName: biz.name,
          code: createdResult.code,
          customerName,
          phone: normalizedPhone,
          aheadCount: Math.max(0, createdResult.waitingPosition - 1),
          appUrl: input.appUrl,
        });
      }

      const finalTicketState = await getPublicTicketState(
        createdResult.ticketId
      );

      return {
        ok: true,
        status: 201,
        ticket: finalTicketState,
      };
    } catch (error) {
      console.error('Database query failed in CreateTicket.execute:', error);
      throw new Error('Failed to create queue ticket.', { cause: error });
    }
  }
}
