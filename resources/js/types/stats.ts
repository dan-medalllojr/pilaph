/** The owner's stats page (ShopStats). Counts and times only, no names. */
export type ShopStats = {
    /** 1 = today, 7 or 30 = the last days including today. */
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
    served_per_day: { date: string; served: number }[];
    by_service: {
        name: string;
        prefix: string;
        served: number;
        average_service_minutes: number | null;
    }[];
    by_counter: { name: string; served: number }[];
};
