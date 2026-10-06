import { db } from './index.ts';
import { businesses, users } from './schema.ts';
import { eq, sql } from 'drizzle-orm';

export function getManilaDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export async function getOrCreateUserWithBusiness(
  uid: string,
  email: string,
  displayName?: string
) {
  try {
    const existingUsers = await db
      .select()
      .from(users)
      .where(eq(users.uid, uid));

    if (existingUsers.length > 0 && existingUsers[0].businessId) {
      return existingUsers[0];
    }

    // Every new owner gets their own shop. It starts empty: the owner adds
    // services and chairs in Services & Chairs before customers can join.
    return await db.transaction(async (tx) => {
      // The dashboard fires several requests at once on first sign-in; lock
      // per user so only one of them creates the shop.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${uid}))`);

      const lockedUsers = await tx
        .select()
        .from(users)
        .where(eq(users.uid, uid));
      if (lockedUsers.length > 0 && lockedUsers[0].businessId) {
        return lockedUsers[0];
      }

      const slugBase = (email.split('@')[0] || 'shop')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const uniqueSlug = `${slugBase}-${Math.floor(1000 + Math.random() * 9000)}`;
      const todayStr = getManilaDateString();

      const insertedBiz = await tx
        .insert(businesses)
        .values({
          name: displayName ? `${displayName}'s Shop` : 'Manila Queue Hub',
          slug: uniqueSlug,
          isOpen: true,
          nearThreshold: 3,
          maxWaiting: 30,
          joinCutoffTime: '21:00',
          qrToken: `qr-${Math.random().toString(36).substring(2, 10)}`,
          rotateQrDaily: false,
          qrTokenDate: todayStr,
          timezone: 'Asia/Manila',
        })
        .returning();

      const targetBusinessId = insertedBiz[0].id;

      const result = await tx
        .insert(users)
        .values({
          uid,
          email,
          name: displayName || email.split('@')[0] || 'Owner',
          businessId: targetBusinessId,
          role: 'owner',
        })
        .onConflictDoUpdate({
          target: users.uid,
          set: {
            email,
            businessId: targetBusinessId,
          },
        })
        .returning();

      return result[0];
    });
  } catch (error) {
    console.error('Database query failed in getOrCreateUserWithBusiness:', error);
    throw new Error('Failed to synchronize user account with database.', {
      cause: error,
    });
  }
}
