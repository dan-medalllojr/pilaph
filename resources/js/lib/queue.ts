import type { WaitRange } from '@/types';

/**
 * Estimated wait for someone behind `codesAhead`. Mirrors
 * App\Services\QueueEstimator: the service times of the people ahead (each
 * for their own service, by ticket letter) / active counters, rounded up and
 * shown as a 5-minute range.
 */
export function estimateWait(
    codesAhead: string[],
    averageMinutes: Record<string, number>,
    activeCounters: number,
): WaitRange {
    const work = codesAhead.reduce(
        (sum, code) => sum + (averageMinutes[code.split('-')[0]] ?? 0),
        0,
    );
    const minutes = Math.ceil(work / Math.max(1, activeCounters));
    const min = Math.floor(minutes / 5) * 5;

    return { min, max: min + 5 };
}

/** "Under 5 min", "10–15 min". */
export function formatWait(wait: WaitRange): string {
    return wait.min === 0
        ? `Under ${wait.max} min`
        : `${wait.min}–${wait.max} min`;
}

/**
 * Random UUID v4. crypto.randomUUID only exists on HTTPS/localhost, so fall
 * back to getRandomValues (e.g. testing on a phone over the local network).
 */
export function uuid(): string {
    if (typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0'));

    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}

/*
 * The customer's ticket per shop is also kept on the phone, so the join page
 * can link back to it even if the device cookie was cleared.
 */
const ticketKey = (slug: string) => `pilaph:ticket:${slug}`;

export function rememberTicket(slug: string, ticketId: string): void {
    try {
        localStorage.setItem(ticketKey(slug), ticketId);
    } catch {
        // Private mode or storage disabled: the device cookie still works.
    }
}

export function forgetTicket(slug: string): void {
    try {
        localStorage.removeItem(ticketKey(slug));
    } catch {
        // Ignore, as above.
    }
}

export function rememberedTicket(slug: string): string | null {
    try {
        return localStorage.getItem(ticketKey(slug));
    } catch {
        return null;
    }
}
