import type { JoinClosedReason } from './queue';

/** The TV display's state, from /tv/{token}/state. No names or phone numbers. */
export type DisplayState = {
    business: {
        id: number;
        name: string;
        closed_reason: JoinClosedReason | null;
    };
    /** Active counters (and any switched-off one still serving someone). */
    counters: { name: string; code: string | null }[];
    next_codes: string[];
    waiting_count: number;
    /** The QR code to join; null while new customers can't join. */
    join: JoinQrCode | null;
};

export type JoinQrCode = {
    /** The join page with the shop's current QR token. */
    url: string;
    /** SVG data URI of the QR code. */
    image: string;
};
