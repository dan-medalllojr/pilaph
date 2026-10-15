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

/** The trial: its plan, its length, and its texts (fewer than the plan's). */
export type TrialOffer = { plan: string; days: number; texts: number };

/** A banner about the shop's plan (PlanUsage::notice). */
export type PlanNotice = {
    tone: 'info' | 'warning';
    message: string;
    /** The banner's button: "Pay now" or "See plans". */
    action: 'pay' | 'plans';
};

/** A plan and number of months the owner can pay for online. */
export type PaymentOption = {
    plan: PlanKey;
    months: number;
    /** Pesos. */
    amount: number;
    /** When the plan would end if paid now. */
    ends_at: string;
    /** Why it can't be bought now (e.g. a dearer plan is running). */
    refusal: string | null;
};

/** A payment the owner started but hasn't finished (last 24 hours). */
export type PendingPayment = {
    plan: string;
    months: number;
    amount: string;
    /** HitPay's checkout page, to finish paying. */
    checkout_url: string;
    /** Asks HitPay whether it was paid. */
    check_url: string;
};

export type PaidPayment = {
    id: string;
    plan: string;
    months: number;
    amount: string;
    paid_at: string | null;
    plan_ends_at: string | null;
};

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
