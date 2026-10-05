import { db } from '../db/index.ts';
import {
  businesses,
  counters,
  services,
  smsLogs,
  tickets,
} from '../db/schema.ts';
import { and, asc, desc, eq } from 'drizzle-orm';
import {
  AnalyticsStats,
  DashboardState,
  NowServingEntry,
  PublicQueueState,
  PublicTicketState,
  TicketItem,
  TicketStatus,
} from '../types/queue.ts';

// 2.5-second in-memory cache for public state snapshots per business to prevent refetch storms
const publicStateCache = new Map<
  number,
  { expiresAt: number; data: PublicQueueState }
>();

export function invalidatePublicQueueCache(businessId?: number) {
  if (businessId !== undefined) {
    publicStateCache.delete(businessId);
  } else {
    publicStateCache.clear();
  }
}

export function getManilaDateAndTime(now: Date = new Date()): {
  manilaDate: string;
  manilaTime: string;
  manilaHour: number;
  manilaMinute: number;
} {
  const dateFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const timeFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const manilaDate = dateFmt.format(now);
  const manilaTime = timeFmt.format(now);
  const [hStr, mStr] = manilaTime.split(':');
  return {
    manilaDate,
    manilaTime,
    manilaHour: parseInt(hStr || '0', 10),
    manilaMinute: parseInt(mStr || '0', 10),
  };
}

export function isPastCutoffTime(
  cutoffTime: string | null,
  currentManilaTime: string
): boolean {
  if (!cutoffTime || !cutoffTime.trim()) return false;
  return currentManilaTime >= cutoffTime.trim();
}

export function formatEtaRange(etaMinutes: number): string {
  if (etaMinutes <= 3) return '2–5 min';
  const low = Math.max(2, Math.floor((etaMinutes * 0.85) / 5) * 5);
  const high = Math.max(low + 5, Math.ceil((etaMinutes * 1.15) / 5) * 5);
  return `${low}–${high} min`;
}

/**
 * Computes average service time in minutes for a service from its last 10 `done` tickets,
 * falling back to `defaultMinutes`.
 */
export function computeServiceAverageMinutes(
  doneTicketsForService: Array<{
    calledAt: Date | null;
    completedAt: Date | null;
  }>,
  defaultMinutes: number
): number {
  const validDurations: number[] = [];
  for (const t of doneTicketsForService.slice(0, 10)) {
    if (t.calledAt && t.completedAt) {
      const diffMins =
        (t.completedAt.getTime() - t.calledAt.getTime()) / (1000 * 60);
      if (diffMins >= 2 && diffMins <= 120) {
        validDurations.push(diffMins);
      }
    }
  }
  if (validDurations.length === 0) {
    return defaultMinutes;
  }
  const sum = validDurations.reduce((a, b) => a + b, 0);
  return Math.max(3, Math.round(sum / validDurations.length));
}

export async function getPublicQueueStateBySlug(
  slug: string,
  bypassCache = false
): Promise<PublicQueueState | null> {
  try {
    const bizRows = await db
      .select()
      .from(businesses)
      .where(eq(businesses.slug, slug));
    if (bizRows.length === 0) return null;
    const biz = bizRows[0];

    if (!bypassCache) {
      const cached = publicStateCache.get(biz.id);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.data;
      }
    }

    const { manilaDate, manilaTime } = getManilaDateAndTime();

    const [serviceRows, counterRows, todayTickets, recentDoneTickets] =
      await Promise.all([
        db
          .select()
          .from(services)
          .where(eq(services.businessId, biz.id))
          .orderBy(asc(services.prefix)),
        db
          .select()
          .from(counters)
          .where(eq(counters.businessId, biz.id))
          .orderBy(asc(counters.id)),
        db
          .select()
          .from(tickets)
          .where(
            and(
              eq(tickets.businessId, biz.id),
              eq(tickets.queueDate, manilaDate)
            )
          )
          .orderBy(asc(tickets.joinedAt)),
        db
          .select()
          .from(tickets)
          .where(
            and(eq(tickets.businessId, biz.id), eq(tickets.status, 'done'))
          )
          .orderBy(desc(tickets.completedAt)),
      ]);

    const activeCountersCount = Math.max(
      1,
      counterRows.filter((c) => c.isActive).length
    );

    const waitingTickets = todayTickets.filter((t) => t.status === 'waiting');
    const calledTickets = todayTickets.filter((t) => t.status === 'called');

    const serviceMap = new Map(serviceRows.map((s) => [s.id, s]));

    const enrichedServices = serviceRows.map((s) => {
      const doneForSvc = recentDoneTickets.filter((t) => t.serviceId === s.id);
      const avgMinutes = computeServiceAverageMinutes(
        doneForSvc,
        s.defaultMinutes
      );
      const nextPosition = waitingTickets.length + 1;
      const estimatedWaitMinutes = Math.ceil(
        (nextPosition * avgMinutes) / activeCountersCount
      );
      return {
        id: s.id,
        name: s.name,
        prefix: s.prefix,
        defaultMinutes: s.defaultMinutes,
        isActive: s.isActive,
        avgMinutes,
        estimatedWaitMinutes,
        estimatedWaitRange: formatEtaRange(estimatedWaitMinutes),
      };
    });

    const nowServing: NowServingEntry[] = counterRows
      .filter((c) => c.isActive)
      .map((counter) => {
        const current = calledTickets.find((t) => t.counterId === counter.id);
        const svc = current ? serviceMap.get(current.serviceId) : null;
        return {
          counterId: counter.id,
          counterName: counter.name,
          ticketCode: current ? current.code : null,
          serviceName: svc ? svc.name : null,
          calledAt: current?.calledAt ? current.calledAt.toISOString() : null,
        };
      });

    const overallAvgServiceMins =
      enrichedServices.length > 0
        ? Math.round(
            enrichedServices.reduce((acc, s) => acc + s.avgMinutes, 0) /
              enrichedServices.length
          )
        : 15;

    const estimatedNewJoinMinutes = Math.ceil(
      ((waitingTickets.length + 1) * overallAvgServiceMins) /
        activeCountersCount
    );

    const isPastCutoff = isPastCutoffTime(biz.joinCutoffTime, manilaTime);
    const isFull =
      biz.maxWaiting !== null && waitingTickets.length >= biz.maxWaiting;

    const state: PublicQueueState = {
      business: {
        id: biz.id,
        name: biz.name,
        slug: biz.slug,
        isOpen: biz.isOpen,
        nearThreshold: biz.nearThreshold,
        maxWaiting: biz.maxWaiting,
        joinCutoffTime: biz.joinCutoffTime,
        rotateQrDaily: biz.rotateQrDaily,
        // Include qrToken on public state only when rotateQrDaily is on so TV Display shows live daily QR
        qrToken: biz.rotateQrDaily ? biz.qrToken : undefined,
        timezone: biz.timezone,
        isPastCutoff,
        isFull,
        manilaTime,
        manilaDate,
      },
      services: enrichedServices,
      counters: counterRows.map((c) => ({
        id: c.id,
        name: c.name,
        isActive: c.isActive,
      })),
      nowServing,
      waitingCount: waitingTickets.length,
      waitingCodes: waitingTickets.map((t) => t.code),
      estimatedNewJoinMinutes,
      estimatedNewJoinRange: formatEtaRange(estimatedNewJoinMinutes),
    };

    publicStateCache.set(biz.id, {
      expiresAt: Date.now() + 2500,
      data: state,
    });

    return state;
  } catch (error) {
    console.error('Database query failed in getPublicQueueStateBySlug:', error);
    throw new Error('Failed to load queue state.', { cause: error });
  }
}

export async function getPublicTicketState(
  ticketUuid: string
): Promise<PublicTicketState | null> {
  try {
    const ticketRows = await db
      .select()
      .from(tickets)
      .where(eq(tickets.id, ticketUuid));
    if (ticketRows.length === 0) return null;
    const t = ticketRows[0];

    const [bizRows, serviceRows, counterRows, dayTickets, doneForSvc] =
      await Promise.all([
        db.select().from(businesses).where(eq(businesses.id, t.businessId)),
        db.select().from(services).where(eq(services.id, t.serviceId)),
        db
          .select()
          .from(counters)
          .where(eq(counters.businessId, t.businessId))
          .orderBy(asc(counters.id)),
        db
          .select()
          .from(tickets)
          .where(
            and(
              eq(tickets.businessId, t.businessId),
              eq(tickets.queueDate, t.queueDate)
            )
          )
          .orderBy(asc(tickets.joinedAt)),
        db
          .select()
          .from(tickets)
          .where(
            and(
              eq(tickets.serviceId, t.serviceId),
              eq(tickets.status, 'done')
            )
          )
          .orderBy(desc(tickets.completedAt)),
      ]);

    if (bizRows.length === 0) return null;
    const biz = bizRows[0];
    const svc = serviceRows[0];
    const assignedCounter = counterRows.find((c) => c.id === t.counterId);

    const activeCountersCount = Math.max(
      1,
      counterRows.filter((c) => c.isActive).length
    );

    const waitingTickets = dayTickets.filter((w) => w.status === 'waiting');
    const calledTickets = dayTickets.filter((w) => w.status === 'called');

    let position: number | null = null;
    let aheadCount = 0;
    let etaMinutes: number | null = null;
    let etaRange: string | null = null;

    if (t.status === 'waiting') {
      const idx = waitingTickets.findIndex((w) => w.id === t.id);
      position = idx >= 0 ? idx + 1 : 1;
      aheadCount = Math.max(0, position - 1);
      const avgMins = computeServiceAverageMinutes(
        doneForSvc,
        svc ? svc.defaultMinutes : 15
      );
      etaMinutes = Math.ceil((position * avgMins) / activeCountersCount);
      etaRange = formatEtaRange(etaMinutes);
    }

    const nowServing: NowServingEntry[] = counterRows
      .filter((c) => c.isActive)
      .map((c) => {
        const cur = calledTickets.find((ct) => ct.counterId === c.id);
        return {
          counterId: c.id,
          counterName: c.name,
          ticketCode: cur ? cur.code : null,
          serviceName: null,
          calledAt: cur?.calledAt ? cur.calledAt.toISOString() : null,
        };
      });

    return {
      id: t.id,
      code: t.code,
      status: t.status as TicketStatus,
      serviceName: svc ? svc.name : 'Service',
      servicePrefix: svc ? svc.prefix : 'A',
      counterName: assignedCounter ? assignedCounter.name : null,
      joinedAt: t.joinedAt.toISOString(),
      calledAt: t.calledAt ? t.calledAt.toISOString() : null,
      completedAt: t.completedAt ? t.completedAt.toISOString() : null,
      position,
      aheadCount,
      etaMinutes,
      etaRange,
      nearSmsSent: Boolean(t.nearSmsSentAt),
      calledSmsSent: Boolean(t.calledSmsSentAt),
      hasPhone: Boolean(t.phone),
      business: {
        id: biz.id,
        name: biz.name,
        slug: biz.slug,
        isOpen: biz.isOpen,
        nearThreshold: biz.nearThreshold,
      },
      nowServing,
      waitingCodes: waitingTickets.map((w) => w.code),
    };
  } catch (error) {
    console.error('Database query failed in getPublicTicketState:', error);
    throw new Error('Failed to load ticket state.', { cause: error });
  }
}

export async function getOwnerDashboardState(
  businessId: number
): Promise<DashboardState> {
  try {
    const { manilaDate, manilaTime } = getManilaDateAndTime();

    const [bizRows, serviceRows, counterRows, todayTickets, recentSms] =
      await Promise.all([
        db.select().from(businesses).where(eq(businesses.id, businessId)),
        db
          .select()
          .from(services)
          .where(eq(services.businessId, businessId))
          .orderBy(asc(services.prefix)),
        db
          .select()
          .from(counters)
          .where(eq(counters.businessId, businessId))
          .orderBy(asc(counters.id)),
        db
          .select()
          .from(tickets)
          .where(
            and(
              eq(tickets.businessId, businessId),
              eq(tickets.queueDate, manilaDate)
            )
          )
          .orderBy(asc(tickets.joinedAt)),
        db
          .select()
          .from(smsLogs)
          .where(eq(smsLogs.businessId, businessId))
          .orderBy(desc(smsLogs.createdAt)),
      ]);

    const biz = bizRows[0];
    const serviceMap = new Map(serviceRows.map((s) => [s.id, s]));
    const counterMap = new Map(counterRows.map((c) => [c.id, c]));

    const activeCountersCount = Math.max(
      1,
      counterRows.filter((c) => c.isActive).length
    );

    const waitingRaw = todayTickets.filter((t) => t.status === 'waiting');
    const calledRaw = todayTickets.filter((t) => t.status === 'called');
    const doneRaw = todayTickets.filter((t) => t.status === 'done');
    const noShowRaw = todayTickets.filter((t) => t.status === 'no_show');
    const cancelledRaw = todayTickets.filter((t) => t.status === 'cancelled');

    const mapTicketItem = (
      t: typeof todayTickets[number],
      pos?: number
    ): TicketItem => {
      const svc = serviceMap.get(t.serviceId);
      const ctr = t.counterId ? counterMap.get(t.counterId) : null;
      const avgMins = svc ? svc.defaultMinutes : 15;
      const etaMinutes = pos
        ? Math.ceil((pos * avgMins) / activeCountersCount)
        : null;
      return {
        id: t.id,
        businessId: t.businessId,
        serviceId: t.serviceId,
        serviceName: svc ? svc.name : 'Service',
        servicePrefix: svc ? svc.prefix : 'A',
        counterId: t.counterId,
        counterName: ctr ? ctr.name : null,
        queueDate: t.queueDate,
        number: t.number,
        code: t.code,
        customerName: t.customerName,
        phone: t.phone,
        status: t.status as TicketStatus,
        joinedAt: t.joinedAt.toISOString(),
        calledAt: t.calledAt ? t.calledAt.toISOString() : null,
        completedAt: t.completedAt ? t.completedAt.toISOString() : null,
        nearSmsSentAt: t.nearSmsSentAt ? t.nearSmsSentAt.toISOString() : null,
        calledSmsSentAt: t.calledSmsSentAt
          ? t.calledSmsSentAt.toISOString()
          : null,
        position: pos ?? null,
        etaMinutes,
        etaRange: etaMinutes ? formatEtaRange(etaMinutes) : null,
      };
    };

    const waitingTickets = waitingRaw.map((t, index) =>
      mapTicketItem(t, index + 1)
    );
    const calledTickets = calledRaw.map((t) => mapTicketItem(t));
    const recentCompletedTickets = [...doneRaw, ...noShowRaw, ...cancelledRaw]
      .sort(
        (a, b) =>
          (b.completedAt?.getTime() || b.joinedAt.getTime()) -
          (a.completedAt?.getTime() || a.joinedAt.getTime())
      )
      .slice(0, 15)
      .map((t) => mapTicketItem(t));

    // Calculate average wait time and service time today
    const waitMinsList: number[] = [];
    const svcMinsList: number[] = [];
    for (const t of [...doneRaw, ...calledRaw]) {
      if (t.calledAt && t.joinedAt) {
        const w = (t.calledAt.getTime() - t.joinedAt.getTime()) / 60000;
        if (w >= 0 && w <= 300) waitMinsList.push(w);
      }
      if (t.completedAt && t.calledAt) {
        const s = (t.completedAt.getTime() - t.calledAt.getTime()) / 60000;
        if (s >= 1 && s <= 180) svcMinsList.push(s);
      }
    }

    const avgWaitMinutesToday =
      waitMinsList.length > 0
        ? Math.round(
            waitMinsList.reduce((a, b) => a + b, 0) / waitMinsList.length
          )
        : 12;

    const avgServiceMinutesToday =
      svcMinsList.length > 0
        ? Math.round(
            svcMinsList.reduce((a, b) => a + b, 0) / svcMinsList.length
          )
        : 18;

    const ticketCodeById = new Map(todayTickets.map((t) => [t.id, t.code]));

    return {
      business: {
        id: biz.id,
        name: biz.name,
        slug: biz.slug,
        isOpen: biz.isOpen,
        nearThreshold: biz.nearThreshold,
        maxWaiting: biz.maxWaiting,
        joinCutoffTime: biz.joinCutoffTime,
        qrToken: biz.qrToken,
        rotateQrDaily: biz.rotateQrDaily,
        qrTokenDate: biz.qrTokenDate,
        timezone: biz.timezone,
      },
      services: serviceRows.map((s) => ({
        id: s.id,
        businessId: s.businessId,
        name: s.name,
        prefix: s.prefix,
        defaultMinutes: s.defaultMinutes,
        isActive: s.isActive,
        waitingCount: waitingRaw.filter((w) => w.serviceId === s.id).length,
      })),
      counters: counterRows.map((c) => {
        const currentTicket =
          calledTickets.find((ct) => ct.counterId === c.id) || null;
        return {
          id: c.id,
          businessId: c.businessId,
          name: c.name,
          isActive: c.isActive,
          currentTicket,
        };
      }),
      waitingTickets,
      calledTickets,
      recentCompletedTickets,
      smsLogs: recentSms.slice(0, 25).map((log) => ({
        id: log.id,
        businessId: log.businessId,
        ticketId: log.ticketId,
        ticketCode: ticketCodeById.get(log.ticketId) || 'Ticket',
        phone: log.phone,
        type: log.type as 'near' | 'called',
        message: log.message,
        status: log.status,
        driver: log.driver,
        providerResponse: log.providerResponse,
        createdAt: log.createdAt.toISOString(),
      })),
      statsSummary: {
        servedToday: doneRaw.length,
        waitingNow: waitingRaw.length,
        noShowsToday: noShowRaw.length,
        cancelledToday: cancelledRaw.length,
        avgWaitMinutesToday,
        avgServiceMinutesToday,
      },
      manilaTime,
      manilaDate,
    };
  } catch (error) {
    console.error('Database query failed in getOwnerDashboardState:', error);
    throw new Error('Failed to load owner dashboard state.', { cause: error });
  }
}

export async function getBusinessAnalytics(
  businessId: number
): Promise<AnalyticsStats> {
  try {
    const { manilaDate } = getManilaDateAndTime();
    const [allTickets, serviceRows, smsRows] = await Promise.all([
      db
        .select()
        .from(tickets)
        .where(eq(tickets.businessId, businessId))
        .orderBy(desc(tickets.joinedAt)),
      db
        .select()
        .from(services)
        .where(eq(services.businessId, businessId))
        .orderBy(asc(services.prefix)),
      db.select().from(smsLogs).where(eq(smsLogs.businessId, businessId)),
    ]);

    const todayTickets = allTickets.filter((t) => t.queueDate === manilaDate);
    const servedToday = todayTickets.filter((t) => t.status === 'done').length;
    const servedWeek = allTickets.filter((t) => t.status === 'done').length;
    const noShowsToday = todayTickets.filter(
      (t) => t.status === 'no_show'
    ).length;
    const cancelledToday = todayTickets.filter(
      (t) => t.status === 'cancelled'
    ).length;

    const waits: number[] = [];
    const durations: number[] = [];
    for (const t of allTickets) {
      if (t.calledAt && t.joinedAt) {
        const w = (t.calledAt.getTime() - t.joinedAt.getTime()) / 60000;
        if (w >= 0 && w <= 240) waits.push(w);
      }
      if (t.completedAt && t.calledAt) {
        const d = (t.completedAt.getTime() - t.calledAt.getTime()) / 60000;
        if (d >= 1 && d <= 180) durations.push(d);
      }
    }

    const avgWaitMinutes =
      waits.length > 0
        ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length)
        : 12;
    const avgServiceMinutes =
      durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 18;

    // Busiest hours 9 AM to 8 PM Manila time
    const hourCounts = new Map<number, number>();
    for (let h = 9; h <= 20; h++) {
      hourCounts.set(h, 0);
    }

    const hourFmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Manila',
      hour: '2-digit',
      hour12: false,
    });

    for (const t of allTickets) {
      const h = parseInt(hourFmt.format(t.joinedAt), 10);
      if (hourCounts.has(h)) {
        hourCounts.set(h, (hourCounts.get(h) || 0) + 1);
      }
    }

    const hourlyDistribution = Array.from(hourCounts.entries()).map(
      ([hour, count]) => {
        const suffix = hour >= 12 ? 'PM' : 'AM';
        const h12 = hour % 12 === 0 ? 12 : hour % 12;
        return {
          hour,
          hourLabel: `${h12} ${suffix}`,
          count,
        };
      }
    );

    const serviceBreakdown = serviceRows.map((s) => {
      const svcTickets = allTickets.filter((t) => t.serviceId === s.id);
      const doneSvc = svcTickets.filter((t) => t.status === 'done');
      const waitingSvc = todayTickets.filter(
        (t) => t.serviceId === s.id && t.status === 'waiting'
      );
      return {
        serviceId: s.id,
        name: s.name,
        prefix: s.prefix,
        servedCount: doneSvc.length,
        waitingCount: waitingSvc.length,
        avgServiceMinutes: computeServiceAverageMinutes(
          doneSvc,
          s.defaultMinutes
        ),
      };
    });

    return {
      servedToday,
      servedWeek,
      noShowsToday,
      cancelledToday,
      avgWaitMinutes,
      avgServiceMinutes,
      smsSentToday: smsRows.length,
      hourlyDistribution,
      serviceBreakdown,
    };
  } catch (error) {
    console.error('Database query failed in getBusinessAnalytics:', error);
    throw new Error('Failed to compute analytics.', { cause: error });
  }
}
