import { db } from '../db/index.ts';
import { businesses, counters, tickets } from '../db/schema.ts';
import { and, asc, eq } from 'drizzle-orm';
import {
  getManilaDateAndTime,
  getOwnerDashboardState,
  getPublicQueueStateBySlug,
  invalidatePublicQueueCache,
} from './QueueCalculations.ts';
import { RealtimeBroadcaster } from './RealtimeBroadcaster.ts';
import { SemaphoreSmsService } from './SemaphoreSmsService.ts';

// Atomic per-counter lock + global queue pop lock so two counters never grab the same waiting ticket
const activeCounterLocks = new Set<number>();
let queuePopMutex: Promise<void> = Promise.resolve();

async function withQueuePopMutex<T>(fn: () => Promise<T>): Promise<T> {
  const prev = queuePopMutex;
  let release!: () => void;
  queuePopMutex = new Promise<void>((res) => {
    release = res;
  });
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

export interface CallNextInput {
  businessId: number;
  counterId: number;
  expectedCurrentTicketId: string | null;
  appUrl: string;
}

export class CallNextTicket {
  public static async execute(input: CallNextInput) {
    // 1. Per-counter atomic lock
    if (activeCounterLocks.has(input.counterId)) {
      return {
        ok: false,
        status: 429,
        message: 'Still processing, please wait.',
      };
    }

    activeCounterLocks.add(input.counterId);
    try {
      const result = await withQueuePopMutex(async () => {
        const { manilaDate } = getManilaDateAndTime();

        const [bizRows, counterRows, todayTickets] = await Promise.all([
          db
            .select()
            .from(businesses)
            .where(eq(businesses.id, input.businessId)),
          db
            .select()
            .from(counters)
            .where(
              and(
                eq(counters.id, input.counterId),
                eq(counters.businessId, input.businessId)
              )
            ),
          db
            .select()
            .from(tickets)
            .where(
              and(
                eq(tickets.businessId, input.businessId),
                eq(tickets.queueDate, manilaDate)
              )
            )
            .orderBy(asc(tickets.joinedAt)),
        ]);

        if (bizRows.length === 0 || counterRows.length === 0) {
          return {
            ok: false as const,
            status: 404,
            message: 'Counter or business not found.',
          };
        }

        const biz = bizRows[0];
        const counter = counterRows[0];

        // 2. Compare expected_current_ticket_id with the counter's actual current `called` ticket
        const currentCalledForCounter =
          todayTickets.find(
            (t) => t.status === 'called' && t.counterId === counter.id
          ) || null;

        const actualCurrentId = currentCalledForCounter
          ? currentCalledForCounter.id
          : null;
        const expectedId = input.expectedCurrentTicketId || null;

        if (actualCurrentId !== expectedId) {
          const freshDashboard = await getOwnerDashboardState(biz.id);
          return {
            ok: false as const,
            status: 409,
            message: currentCalledForCounter
              ? `Already called ${currentCalledForCounter.code}`
              : 'Counter state changed in another tab.',
            dashboard: freshDashboard,
          };
        }

        const now = new Date();

        // 3. Mark the counter's current `called` ticket as `done` (if any)
        if (currentCalledForCounter) {
          await db
            .update(tickets)
            .set({
              status: 'done',
              completedAt: now,
            })
            .where(
              and(
                eq(tickets.id, currentCalledForCounter.id),
                eq(tickets.status, 'called')
              )
            );
        }

        // 4. Select the oldest `waiting` ticket for today
        const waitingTickets = todayTickets.filter(
          (t) => t.status === 'waiting'
        );

        if (waitingTickets.length === 0) {
          invalidatePublicQueueCache(biz.id);
          const freshPublic = await getPublicQueueStateBySlug(biz.slug, true);
          if (freshPublic) {
            await RealtimeBroadcaster.broadcastQueueEvent(
              biz.id,
              'ticket.updated',
              {
                code: currentCalledForCounter
                  ? currentCalledForCounter.code
                  : null,
                counter: counter.name,
                status: 'done',
                waiting_count: freshPublic.waitingCount,
                waiting_codes: freshPublic.waitingCodes,
                now_serving: freshPublic.nowServing,
              }
            );
          }
          const freshDashboard = await getOwnerDashboardState(biz.id);
          return {
            ok: true as const,
            status: 200,
            emptyQueue: true,
            message: currentCalledForCounter
              ? `Completed ${currentCalledForCounter.code}. Queue is now empty.`
              : 'Queue is empty — no waiting customers.',
            calledTicket: null,
            dashboard: freshDashboard,
          };
        }

        const nextTicket = waitingTickets[0];

        // 5. Set status = called, counter_id, called_at
        await db
          .update(tickets)
          .set({
            status: 'called',
            counterId: counter.id,
            calledAt: now,
          })
          .where(
            and(eq(tickets.id, nextTicket.id), eq(tickets.status, 'waiting'))
          );

        return {
          ok: true as const,
          status: 200,
          emptyQueue: false,
          biz,
          counter,
          calledTicket: nextTicket,
          remainingWaiting: waitingTickets.slice(1),
        };
      });

      if (!result.ok || result.emptyQueue || !result.calledTicket) {
        return result;
      }

      const { biz, counter, calledTicket, remainingWaiting } = result;

      // 6. After commit: Broadcast `ticket.called` on `queue:{business_id}` and `ticket:{uuid}`
      invalidatePublicQueueCache(biz.id);
      const freshPublic = await getPublicQueueStateBySlug(biz.slug, true);

      if (freshPublic) {
        await RealtimeBroadcaster.broadcastQueueEvent(biz.id, 'ticket.called', {
          code: calledTicket.code,
          counter: counter.name,
          status: 'called',
          waiting_count: freshPublic.waitingCount,
          waiting_codes: freshPublic.waitingCodes,
          now_serving: freshPublic.nowServing,
        });
      }

      await RealtimeBroadcaster.broadcastTicketEvent(
        calledTicket.id,
        'ticket.called',
        {
          code: calledTicket.code,
          counter: counter.name,
          status: 'called',
        }
      );

      // Queue "called" SMS if ticket has a phone and `called_sms_sent_at` is null
      if (calledTicket.phone && !calledTicket.calledSmsSentAt) {
        await SemaphoreSmsService.sendCalledSmsIfEligible({
          ticketId: calledTicket.id,
          businessId: biz.id,
          businessName: biz.name,
          code: calledTicket.code,
          counterName: counter.name,
          phone: calledTicket.phone,
          appUrl: input.appUrl,
        });
      }

      // Find waiting ticket(s) now at or within position `near_threshold` and queue "near" SMS if `near_sms_sent_at` is null
      for (let i = 0; i < remainingWaiting.length; i++) {
        const position = i + 1;
        const wt = remainingWaiting[i];
        if (
          position <= biz.nearThreshold &&
          wt.phone &&
          !wt.nearSmsSentAt
        ) {
          await SemaphoreSmsService.sendNearSmsIfEligible({
            ticketId: wt.id,
            businessId: biz.id,
            businessName: biz.name,
            code: wt.code,
            customerName: wt.customerName,
            phone: wt.phone,
            aheadCount: position - 1,
            appUrl: input.appUrl,
          });
        }
      }

      const freshDashboard = await getOwnerDashboardState(biz.id);
      return {
        ok: true,
        status: 200,
        emptyQueue: false,
        message: `Now serving ${calledTicket.code} at ${counter.name}`,
        calledTicket: {
          id: calledTicket.id,
          code: calledTicket.code,
          customerName: calledTicket.customerName,
          counterName: counter.name,
        },
        dashboard: freshDashboard,
      };
    } catch (error) {
      console.error('Database query failed in CallNextTicket.execute:', error);
      throw new Error('Failed to call next customer.', { cause: error });
    } finally {
      activeCounterLocks.delete(input.counterId);
    }
  }
}
