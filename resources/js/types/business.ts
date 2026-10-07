/** The signed-in owner's shop, shared with every page (null before setup). */
export type CurrentBusiness = {
    id: number;
    name: string;
    slug: string;
};

export type BusinessSettings = {
    name: string;
    slug: string;
    near_threshold: number;
    max_waiting: number | null;
    /** "HH:MM", or null for no cutoff. */
    join_cutoff_time: string | null;
    rotate_qr_daily: boolean;
    timezone: string;
};

export type ServiceItem = {
    id: number;
    name: string;
    prefix: string;
    default_minutes: number;
    is_active: boolean;
    /** Services with ticket history can only be switched off, not deleted. */
    has_tickets: boolean;
};

export type CounterItem = {
    id: number;
    name: string;
    is_active: boolean;
    /** Counters that served tickets can only be switched off, not deleted. */
    has_tickets: boolean;
};
