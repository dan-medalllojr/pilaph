import { db } from '../db/index.ts';
import { businesses, tickets } from '../db/schema.ts';
import { and, eq } from 'drizzle-orm';
import {
  getManilaDateAndTime,
  invalidatePublicQueueCache,
} from './QueueCalculations.ts';

export class EndOfDayCleanup {
  /**
   * Nightly scheduled cleanup (`Asia/Manila`):
   * - Marks leftover `waiting` tickets as `cancelled`
   * - Marks leftover `called` tickets as `no_show`
   * - Rotates `qr_token` for businesses with `rotate_qr_daily = true`
   */
  public static async execute(businessId: number) {
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
