import webpush from 'web-push';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { pushSubscriptions } from '../db/schema.ts';

export interface OwnerPushMessage {
  title: string;
  body: string;
  // Page opened when the owner taps the notification.
  url?: string;
  // Notifications with the same tag replace each other instead of piling up.
  tag?: string;
}

let configured: boolean | null = null;

// VAPID keys identify this server to browser push services. Without all three
// settings, owner alerts are switched off and nothing is sent.
export function isPushConfigured(): boolean {
  if (configured === null) {
    const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
    configured = false;
    if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT) {
      try {
        webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
        configured = true;
      } catch (error) {
        console.warn('Owner push alerts are off: invalid VAPID settings.', error);
      }
    } else {
      console.warn(
        'Owner push alerts are off: set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT in .env.'
      );
    }
  }
  return configured;
}

export function getVapidPublicKey(): string | null {
  return isPushConfigured() ? process.env.VAPID_PUBLIC_KEY! : null;
}

// Sends to every device that turned on alerts for this shop. Never throws, so
// a push failure can't break the action that triggered it.
export async function sendOwnerPush(
  businessId: number,
  message: OwnerPushMessage
): Promise<void> {
  if (!isPushConfigured()) return;
  try {
    const subs = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.businessId, businessId));
    const payload = JSON.stringify(message);

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
            { TTL: 30 * 60, urgency: 'high' }
          );
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode;
          // 404/410: the browser dropped this subscription (permission revoked,
          // app uninstalled), so stop sending to it.
          if (statusCode === 404 || statusCode === 410) {
            await db
              .delete(pushSubscriptions)
              .where(eq(pushSubscriptions.id, sub.id));
          } else {
            console.error('Owner push failed:', statusCode ?? error);
          }
        }
      })
    );
  } catch (error) {
    console.error('Owner push failed:', error);
  }
}
