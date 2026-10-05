import { db } from './index.ts';
import { businesses, counters, services, users } from './schema.ts';
import { eq } from 'drizzle-orm';

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

    // Check if our default demo business exists
    let targetBusinessId: number;
    const defaultBiz = await db
      .select()
      .from(businesses)
      .where(eq(businesses.slug, 'juans-barbershop'));

    if (defaultBiz.length > 0 && (uid === 'demo-owner-juan-barbershop' || existingUsers.length === 0)) {
      // If logging in as demo owner or first owner on the instance, link to Juan's Barbershop if unclaimed or demo
      targetBusinessId = defaultBiz[0].id;
    } else {
      const slugBase = (email.split('@')[0] || 'shop')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const uniqueSlug = `${slugBase}-${Math.floor(1000 + Math.random() * 9000)}`;
      const todayStr = getManilaDateString();

      const insertedBiz = await db
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

      targetBusinessId = insertedBiz[0].id;

      await db.insert(services).values([
        {
          businessId: targetBusinessId,
          name: 'Classic Haircut & Styling',
          prefix: 'A',
          defaultMinutes: 20,
          isActive: true,
        },
        {
          businessId: targetBusinessId,
          name: 'Beard Sculpt & Hot Towel',
          prefix: 'B',
          defaultMinutes: 15,
          isActive: true,
        },
      ]);

      await db.insert(counters).values([
        {
          businessId: targetBusinessId,
          name: 'Chair 1',
          isActive: true,
        },
        {
          businessId: targetBusinessId,
          name: 'Chair 2',
          isActive: true,
        },
      ]);
    }

    const result = await db
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
  } catch (error) {
    console.error('Database query failed in getOrCreateUserWithBusiness:', error);
    throw new Error('Failed to synchronize user account with database.', {
      cause: error,
    });
  }
}
