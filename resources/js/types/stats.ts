/** The owner's stats page (ShopStats). Counts and times only, no names. */
export type ShopStats = {
    /** 1 = today, else the last days including today (7, 30, 90, 180, 365). */
    days: number;
    from: string;
    to: string;
    joined: number;
    served: number;
    no_shows: number;
    cancelled: number;
    average_wait_minutes: number | null;
    average_service_minutes: number | null;
    /** Joins per hour of the day (shop's local time), first to last busy hour. */
    busiest_hours: { hour: number; joined: number }[];
    /** Per day up to a month, then per week (Mondays) or month; dates are each one's first day. */
    served_over_time: {
        bucket: 'day' | 'week' | 'month';
        points: { date: string; served: number }[];
    };
    by_service: {
        name: string;
        prefix: string;
        served: number;
        average_service_minutes: number | null;
    }[];
    by_counter: { name: string; served: number }[];
};

/** A period on the stats page; longer than the plan keeps: not allowed. */
export type StatsPeriod = { days: number; allowed: boolean };
