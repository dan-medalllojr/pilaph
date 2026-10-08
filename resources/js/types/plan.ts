/** What a plan allows (config/plans.php). null means no limit. */
export type PlanLimits = {
    counters: number | null;
    monthly_customers: number | null;
    /** 0: no texts, and no phone field on the join page. */
    monthly_sms: number;
    /** Days of history kept; also the longest stats period. */
    history_days: number;
    photo: boolean;
    /** "Queue by PilaPH" on customer pages, the TV and the poster. */
    branding: boolean;
};

export type PlanKey = 'free' | 'basic' | 'pro';

/** One plan on the pricing pages. */
export type PlanOffer = {
    key: PlanKey;
    name: string;
    /** Pesos a month. */
    price: number;
    limits: PlanLimits;
};

export type TrialOffer = { plan: string; days: number };

/** A banner about the shop's plan (PlanUsage::notice). */
export type PlanNotice = { tone: 'info' | 'warning'; message: string };

/** The Plan & billing page (PlanUsage::summary). */
export type PlanSummary = {
    /** The plan in effect now (the trial's plan during the trial). */
    plan: { key: PlanKey; name: string; price: number };
    status: 'demo' | 'trial' | 'paid' | 'lapsed' | 'free';
    /** When the trial or paid plan ends (or ended, when lapsed). */
    ends_at: string | null;
    /** The paid plan that ended, when lapsed. */
    lapsed_plan: string | null;
    limits: PlanLimits;
    usage: { customers: number; texts: number; active_counters: number };
    /** The 1st of next month, when monthly limits reset. */
    resets_on: string;
    notice: PlanNotice | null;
};

export type PaymentDetails = {
    gcash: string | null;
    maya: string | null;
    account_name: string | null;
    /** An email address or a link for the payment screenshot. */
    contact: string | null;
    /** The shop's link name, to put in the payment message. */
    reference: string;
};
