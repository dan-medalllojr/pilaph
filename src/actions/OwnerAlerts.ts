import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { businesses } from '../db/schema.ts';
import { isPushConfigured, sendOwnerPush } from '../lib/owner-push.ts';
import {
  getManilaDateAndTime,
  getPublicQueueStateBySlug,
} from './QueueCalculations.ts';

export const CUTOFF_REMINDER_MINUTES = 30;

// The "almost full" alert fires when the waiting line reaches this size:
// max 30 -> at 27 waiting (3 spots left), max 10 -> at 9 (1 spot left).
export function almostFullAt(maxWaiting: number): number {
  return maxWaiting - Math.max(1, Math.ceil(maxWaiting * 0.1));
}

// businessId -> Manila date the cutoff reminder was last sent.
const cutoffRemindersSent = new Map<number, string>();

export class OwnerAlerts {
  /**
   * After a customer joins: always a "new customer" alert, plus an
   * "almost full" alert when this join is the one that crossed the threshold.
   */
  public static async customerJoined(params: {
    businessId: number;
    code: string;
    customerName: string;
    serviceName: string;
    waitingCount: number;
    maxWaiting: number | null;
  }) {
    const { businessId, code, customerName, serviceName, waitingCount, maxWaiting } =
      params;

    await sendOwnerPush(businessId, {
      title: `New customer: ${code}`,
      body: `${customerName} joined for ${serviceName}. ${waitingCount} waiting now.`,
      url: '/dashboard',
      tag: 'customer-joined',
    });

    if (maxWaiting !== null && waitingCount === almostFullAt(maxWaiting)) {
      const spotsLeft = maxWaiting - waitingCount;
      await sendOwnerPush(businessId, {
        title: 'Queue almost full',
        body: `Only ${spotsLeft} ${spotsLeft === 1 ? 'spot' : 'spots'} left (${waitingCount} of ${maxWaiting} waiting).`,
        url: '/dashboard',
        tag: 'almost-full',
      });
    }
  }

  /**
   * Run every ~30s. Reminds owners of open shops that new customers can only
   * join for CUTOFF_REMINDER_MINUTES more minutes. Sent once per shop per day.
   */
  public static async remindUpcomingCutoffs(now: Date = new Date()) {
    if (!isPushConfigured()) return;
    try {
      const { manilaDate } = getManilaDateAndTime(now);
      const reminderFor = getManilaDateAndTime(
        new Date(now.getTime() + CUTOFF_REMINDER_MINUTES * 60 * 1000)
      ).manilaTime;

      const openShops = await db
        .select()
        .from(businesses)
        .where(and(eq(businesses.isOpen, true), isNotNull(businesses.joinCutoffTime)));

      for (const biz of openShops) {
        const cutoff = (biz.joinCutoffTime || '').slice(0, 5);
        if (cutoff !== reminderFor) continue;
        if (cutoffRemindersSent.get(biz.id) === manilaDate) continue;
        cutoffRemindersSent.set(biz.id, manilaDate);

        const state = await getPublicQueueStateBySlug(biz.slug);
        await sendOwnerPush(biz.id, {
          title: `Join cutoff in ${CUTOFF_REMINDER_MINUTES} minutes`,
          body: `New customers can join until ${cutoff}. ${state?.waitingCount ?? 0} waiting now.`,
          url: '/dashboard',
          tag: 'cutoff-reminder',
        });
      }
    } catch (error) {
      console.error('Cutoff reminder check failed:', error);
    }
  }
}
