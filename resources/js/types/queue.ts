/** Minutes, shown to customers as a range like "10–15 min". */
export type WaitRange = { min: number; max: number };

export type JoinClosedReason = 'paused' | 'after_cutoff' | 'full';

/** Public queue snapshot: no names or phone numbers, only codes and counts. */
export type PublicQueue = {
    business: {
        name: string;
        slug: string;
        closed_reason: JoinClosedReason | null;
        /** "HH:MM", or null when there is no daily cutoff. */
        join_cutoff_time: string | null;
    };
    waiting_count: number;
    /** Waiting tickets in line order. */
    waiting_codes: string[];
    now_serving: { counter: string; code: string }[];
    active_counters: number;
    /** Average minutes per customer, keyed by ticket letter ("A" for A-003). */
    average_minutes: Record<string, number>;
    /** Behind everyone currently waiting, whatever the service. */
    wait_if_joining_now: WaitRange;
    /** Services customers can pick right now. */
    services: {
        id: number;
        name: string;
        prefix: string;
    }[];
};

export type TicketStatus =
    | 'waiting'
    | 'called'
    | 'done'
    | 'no_show'
    | 'cancelled';

/** A customer's own ticket, as shown on /t/{id}. */
export type TicketState = {
    id: string;
    code: string;
    status: TicketStatus;
    service: string;
    /** Set while called: where to go. */
    counter: string | null;
    /** 1 = next in line; null unless waiting. */
    position: number | null;
    wait: WaitRange | null;
    business: { name: string; slug: string };
};
