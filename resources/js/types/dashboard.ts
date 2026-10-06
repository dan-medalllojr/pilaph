import type { JoinClosedReason } from './queue';

/** A ticket as the owner sees it: name yes, phone number never. */
export type OwnerTicket = {
    id: string;
    code: string;
    customer_name: string;
    service: string;
    has_phone: boolean;
    /** ISO 8601 */
    joined_at: string;
    called_at: string | null;
};

/** The owner dashboard's view of today's queue. */
export type OwnerQueue = {
    business: {
        name: string;
        slug: string;
        is_open: boolean;
        closed_reason: JoinClosedReason | null;
        join_cutoff_time: string | null;
    };
    counters: { id: number; name: string; current: OwnerTicket | null }[];
    /** In line order. */
    waiting: OwnerTicket[];
    stats: {
        waiting: number;
        served: number;
        no_shows: number;
        average_wait_minutes: number | null;
    };
    setup: { active_services: number; active_counters: number };
};
