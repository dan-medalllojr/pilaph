import { randomUUID } from 'crypto';
import { db } from '../db/index.ts';
import {
  businesses,
  counters,
  services,
  smsLogs,
  tickets,
  users,
} from '../db/schema.ts';
import { and, eq, inArray } from 'drizzle-orm';
import {
  getManilaDateAndTime,
  invalidatePublicQueueCache,
} from './QueueCalculations.ts';

export class SeedDemoQueue {
  /**
   * Ensures Juan's Barbershop & Grooming (`juans-barbershop`) has realistic
   * Filipino tickets for today's Manila date so the demo is immediately populated.
   */
  public static async ensureTodayDemoData(forceReset = false) {
    try {
      const { manilaDate } = getManilaDateAndTime();

      let bizRows = await db
        .select()
        .from(businesses)
        .where(eq(businesses.slug, 'juans-barbershop'));

      if (bizRows.length === 0) {
        bizRows = await db
          .insert(businesses)
          .values({
            name: "Juan's Barbershop & Grooming",
            slug: 'juans-barbershop',
            isOpen: true,
            nearThreshold: 3,
            maxWaiting: 25,
            joinCutoffTime: '21:30',
            qrToken: 'juan-makati-2026',
            rotateQrDaily: false,
            qrTokenDate: manilaDate,
            timezone: 'Asia/Manila',
          })
          .returning();
      }

      const biz = bizRows[0];

      // Ensure demo owner user exists
      const demoUserRows = await db
        .select()
        .from(users)
        .where(eq(users.uid, 'demo-owner-juan-barbershop'));
      if (demoUserRows.length === 0) {
        await db.insert(users).values({
          uid: 'demo-owner-juan-barbershop',
          email: 'juan@barbershop.ph',
          name: 'Juan Dela Cruz',
          businessId: biz.id,
          role: 'owner',
        });
      }

      // Ensure services exist
      let svcRows = await db
        .select()
        .from(services)
        .where(eq(services.businessId, biz.id));
      if (svcRows.length === 0) {
        svcRows = await db
          .insert(services)
          .values([
            {
              businessId: biz.id,
              name: 'Classic Gupit & Styling',
              prefix: 'A',
              defaultMinutes: 20,
              isActive: true,
            },
            {
              businessId: biz.id,
              name: 'Beard Sculpt & Hot Towel',
              prefix: 'B',
              defaultMinutes: 15,
              isActive: true,
            },
            {
              businessId: biz.id,
              name: 'Executive Package (Cut + Massage)',
              prefix: 'C',
              defaultMinutes: 30,
              isActive: true,
            },
          ])
          .returning();
      }

      // Ensure counters exist
      let ctrRows = await db
        .select()
        .from(counters)
        .where(eq(counters.businessId, biz.id));
      if (ctrRows.length === 0) {
        ctrRows = await db
          .insert(counters)
          .values([
            {
              businessId: biz.id,
              name: 'Chair 1 — Kuya Jun',
              isActive: true,
            },
            {
              businessId: biz.id,
              name: 'Chair 2 — Marco',
              isActive: true,
            },
            {
              businessId: biz.id,
              name: 'Chair 3 — Alden',
              isActive: true,
            },
          ])
          .returning();
      }

      const existingToday = await db
        .select()
        .from(tickets)
        .where(
          and(
            eq(tickets.businessId, biz.id),
            eq(tickets.queueDate, manilaDate)
          )
        );

      if (existingToday.length > 0 && !forceReset) {
        return;
      }

      if (forceReset && existingToday.length > 0) {
        const ids = existingToday.map((t) => t.id);
        await db.delete(smsLogs).where(inArray(smsLogs.ticketId, ids));
        await db.delete(tickets).where(inArray(tickets.id, ids));
      }

      const svcA = svcRows.find((s) => s.prefix === 'A') || svcRows[0];
      const svcB = svcRows.find((s) => s.prefix === 'B') || svcRows[0];
      const svcC = svcRows.find((s) => s.prefix === 'C') || svcRows[0];

      const chair1 = ctrRows[0];
      const chair2 = ctrRows[1] || ctrRows[0];
      const chair3 = ctrRows[2] || ctrRows[0];

      const now = Date.now();
      const minsAgo = (m: number) => new Date(now - m * 60 * 1000);

      // Seed historical done tickets + currently serving on Chairs 1-3 + live waiting line
      const demoTickets = [
        // Completed earlier today
        {
          id: 'demo-tkt-a021-' + manilaDate,
          businessId: biz.id,
          serviceId: svcA.id,
          counterId: chair1.id,
          queueDate: manilaDate,
          number: 21,
          code: 'A-021',
          customerName: 'Paolo Pascual',
          phone: '639178101122',
          status: 'done',
          joinedAt: minsAgo(95),
          calledAt: minsAgo(80),
          completedAt: minsAgo(61),
          nearSmsSentAt: minsAgo(88),
          calledSmsSentAt: minsAgo(80),
          idempotencyKey: `seed-a021-${manilaDate}-${randomUUID()}`,
          deviceId: 'seed-dev-a021',
        },
        {
          id: 'demo-tkt-a022-' + manilaDate,
          businessId: biz.id,
          serviceId: svcA.id,
          counterId: chair2.id,
          queueDate: manilaDate,
          number: 22,
          code: 'A-022',
          customerName: 'Jericho Rosales',
          phone: '639189203344',
          status: 'done',
          joinedAt: minsAgo(75),
          calledAt: minsAgo(58),
          completedAt: minsAgo(40),
          nearSmsSentAt: minsAgo(65),
          calledSmsSentAt: minsAgo(58),
          idempotencyKey: `seed-a022-${manilaDate}-${randomUUID()}`,
          deviceId: 'seed-dev-a022',
        },
        {
          id: 'demo-tkt-b008-' + manilaDate,
          businessId: biz.id,
          serviceId: svcB.id,
          counterId: chair3.id,
          queueDate: manilaDate,
          number: 8,
          code: 'B-008',
          customerName: 'Enrique Gil',
          phone: null,
          status: 'done',
          joinedAt: minsAgo(60),
          calledAt: minsAgo(45),
          completedAt: minsAgo(31),
          nearSmsSentAt: null,
          calledSmsSentAt: null,
          idempotencyKey: `seed-b008-${manilaDate}-${randomUUID()}`,
          deviceId: 'seed-dev-b008',
        },
        {
          id: 'demo-tkt-a023-' + manilaDate,
          businessId: biz.id,
          serviceId: svcA.id,
          counterId: chair1.id,
          queueDate: manilaDate,
          number: 23,
          code: 'A-023',
          customerName: 'Xian Lim',
          phone: '639175550199',
          status: 'no_show',
          joinedAt: minsAgo(50),
          calledAt: minsAgo(32),
          completedAt: minsAgo(25),
          nearSmsSentAt: minsAgo(42),
          calledSmsSentAt: minsAgo(32),
          idempotencyKey: `seed-a023-${manilaDate}-${randomUUID()}`,
          deviceId: 'seed-dev-a023',
        },
        // Currently Serving (Called across Chairs 1, 2, 3)
        {
          id: 'demo-tkt-a024-' + manilaDate,
          businessId: biz.id,
          serviceId: svcA.id,
          counterId: chair1.id,
          queueDate: manilaDate,
          number: 24,
          code: 'A-024',
          customerName: 'Mateo Reyes',
          phone: '639173014488',
          status: 'called',
          joinedAt: minsAgo(34),
          calledAt: minsAgo(9),
          completedAt: null,
          nearSmsSentAt: minsAgo(22),
          calledSmsSentAt: minsAgo(9),
          idempotencyKey: `seed-a024-${manilaDate}-${randomUUID()}`,
          deviceId: 'seed-dev-a024',
        },
        {
          id: 'demo-tkt-b009-' + manilaDate,
          businessId: biz.id,
          serviceId: svcB.id,
          counterId: chair2.id,
          queueDate: manilaDate,
          number: 9,
          code: 'B-009',
          customerName: 'Carlo Mendoza',
          phone: '639194428810',
          status: 'called',
          joinedAt: minsAgo(29),
          calledAt: minsAgo(6),
          completedAt: null,
          nearSmsSentAt: minsAgo(18),
          calledSmsSentAt: minsAgo(6),
          idempotencyKey: `seed-b009-${manilaDate}-${randomUUID()}`,
          deviceId: 'seed-dev-b009',
        },
        {
          id: 'demo-tkt-c004-' + manilaDate,
          businessId: biz.id,
          serviceId: svcC.id,
          counterId: chair3.id,
          queueDate: manilaDate,
          number: 4,
          code: 'C-004',
          customerName: 'Rafael Bautista',
          phone: '639176129001',
          status: 'called',
          joinedAt: minsAgo(26),
          calledAt: minsAgo(4),
          completedAt: null,
          nearSmsSentAt: minsAgo(15),
          calledSmsSentAt: minsAgo(4),
          idempotencyKey: `seed-c004-${manilaDate}-${randomUUID()}`,
          deviceId: 'seed-dev-c004',
        },
        // Waiting in Queue
        {
          id: 'demo-tkt-a025-' + manilaDate,
          businessId: biz.id,
          serviceId: svcA.id,
          counterId: null,
          queueDate: manilaDate,
          number: 25,
          code: 'A-025',
          customerName: 'Miguel Villanueva',
          phone: '639178892311',
          status: 'waiting',
          joinedAt: minsAgo(19),
          calledAt: null,
          completedAt: null,
          nearSmsSentAt: minsAgo(9),
          calledSmsSentAt: null,
          idempotencyKey: `seed-a025-${manilaDate}-${randomUUID()}`,
          deviceId: 'seed-dev-a025',
        },
        {
          id: 'demo-tkt-a026-' + manilaDate,
          businessId: biz.id,
          serviceId: svcA.id,
          counterId: null,
          queueDate: manilaDate,
          number: 26,
          code: 'A-026',
          customerName: 'Gabriel Santos',
          phone: '639187710492',
          status: 'waiting',
          joinedAt: minsAgo(14),
          calledAt: null,
          completedAt: null,
          nearSmsSentAt: minsAgo(6),
          calledSmsSentAt: null,
          idempotencyKey: `seed-a026-${manilaDate}-${randomUUID()}`,
          deviceId: 'seed-dev-a026',
        },
        {
          id: 'demo-tkt-b010-' + manilaDate,
          businessId: biz.id,
          serviceId: svcB.id,
          counterId: null,
          queueDate: manilaDate,
          number: 10,
          code: 'B-010',
          customerName: 'Andres Aquino',
          phone: '639175043319',
          status: 'waiting',
          joinedAt: minsAgo(11),
          calledAt: null,
          completedAt: null,
          nearSmsSentAt: minsAgo(4),
          calledSmsSentAt: null,
          idempotencyKey: `seed-b010-${manilaDate}-${randomUUID()}`,
          deviceId: 'seed-dev-b010',
        },
        {
          id: 'demo-tkt-c005-' + manilaDate,
          businessId: biz.id,
          serviceId: svcC.id,
          counterId: null,
          queueDate: manilaDate,
          number: 5,
          code: 'C-005',
          customerName: 'Marco Del Rosario',
          phone: '639208116745',
          status: 'waiting',
          joinedAt: minsAgo(7),
          calledAt: null,
          completedAt: null,
          nearSmsSentAt: null,
          calledSmsSentAt: null,
          idempotencyKey: `seed-c005-${manilaDate}-${randomUUID()}`,
          deviceId: 'seed-dev-c005',
        },
        {
          id: 'demo-tkt-a027-' + manilaDate,
          businessId: biz.id,
          serviceId: svcA.id,
          counterId: null,
          queueDate: manilaDate,
          number: 27,
          code: 'A-027',
          customerName: 'Daniel Soriano',
          phone: null,
          status: 'waiting',
          joinedAt: minsAgo(3),
          calledAt: null,
          completedAt: null,
          nearSmsSentAt: null,
          calledSmsSentAt: null,
          idempotencyKey: `seed-a027-${manilaDate}-${randomUUID()}`,
          deviceId: 'seed-dev-a027',
        },
      ];

      await db.insert(tickets).values(demoTickets).onConflictDoNothing();

      await db.insert(smsLogs).values([
        {
          businessId: biz.id,
          ticketId: 'demo-tkt-a024-' + manilaDate,
          phone: '639173014488',
          type: 'called',
          message: `A-024, please proceed to ${chair1.name} at ${biz.name}.`,
          status: 'logged',
          driver: 'log',
          providerResponse: 'Delivered to Semaphore PH Gateway (Simulated)',
          createdAt: minsAgo(9),
        },
        {
          businessId: biz.id,
          ticketId: 'demo-tkt-b009-' + manilaDate,
          phone: '639194428810',
          type: 'called',
          message: `B-009, please proceed to ${chair2.name} at ${biz.name}.`,
          status: 'logged',
          driver: 'log',
          providerResponse: 'Delivered to Semaphore PH Gateway (Simulated)',
          createdAt: minsAgo(6),
        },
        {
          businessId: biz.id,
          ticketId: 'demo-tkt-b010-' + manilaDate,
          phone: '639175043319',
          type: 'near',
          message: `Hi Andres, 2 people ahead of you at ${biz.name} (B-010).`,
          status: 'logged',
          driver: 'log',
          providerResponse: 'Delivered to Semaphore PH Gateway (Simulated)',
          createdAt: minsAgo(4),
        },
      ]);

      invalidatePublicQueueCache(biz.id);
    } catch (error) {
      console.error('Error seeding demo queue:', error);
    }
  }

  /**
   * Nightly scheduled cleanup (`Asia/Manila`):
   * - Marks leftover `waiting` tickets as `cancelled`
   * - Marks leftover `called` tickets as `no_show`
   * - Rotates `qr_token` for businesses with `rotate_qr_daily = true`
   */
  public static async runEndOfDayCleanup(businessId: number) {
    try {
      const { manilaDate } = getManilaDateAndTime();
      const now = new Date();

      const bizRows = await db
        .select()
        .from(businesses)
        .where(eq(businesses.id, businessId));
      if (bizRows.length === 0) return null;
      const biz = bizRows[0];

      const cancelledWaiting = await db
        .update(tickets)
        .set({ status: 'cancelled', completedAt: now })
        .where(
          and(
            eq(tickets.businessId, businessId),
            eq(tickets.status, 'waiting')
          )
        )
        .returning();

      const markedNoShow = await db
        .update(tickets)
        .set({ status: 'no_show', completedAt: now })
        .where(
          and(
            eq(tickets.businessId, businessId),
            eq(tickets.status, 'called')
          )
        )
        .returning();

      let newQrToken = biz.qrToken;
      if (biz.rotateQrDaily) {
        newQrToken = `qr-${manilaDate}-${Math.random()
          .toString(36)
          .substring(2, 8)}`;
        await db
          .update(businesses)
          .set({
            qrToken: newQrToken,
            qrTokenDate: manilaDate,
          })
          .where(eq(businesses.id, businessId));
      }

      invalidatePublicQueueCache(businessId);

      return {
        cancelledWaitingCount: cancelledWaiting.length,
        markedNoShowCount: markedNoShow.length,
        qrRotated: biz.rotateQrDaily,
        newQrToken,
      };
    } catch (error) {
      console.error('Failed to run end of day cleanup:', error);
      throw new Error('Failed to run end-of-day cleanup.', { cause: error });
    }
  }
}
