import { Head } from '@inertiajs/react';
import Heading from '@/components/heading';
import PricingTable, {
    everyPlanIncludes,
    historyLabel,
} from '@/components/pricing-table';
import { cn } from '@/lib/utils';
import { show } from '@/routes/plan';
import type {
    PaymentDetails,
    PlanOffer,
    PlanSummary,
    TrialOffer,
} from '@/types';

const longDate = new Intl.DateTimeFormat('en-PH', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
});

/** "2026-11-01" as a local date (not UTC midnight). */
const toDate = (date: string) =>
    new Date(date.length === 10 ? `${date}T00:00:00` : date);

const peso = new Intl.NumberFormat('en-PH');

type Props = {
    summary: PlanSummary;
    plans: PlanOffer[];
    trial: TrialOffer;
    payment: PaymentDetails;
};

export default function PlanPage({ summary, plans, trial, payment }: Props) {
    return (
        <>
            <Head title="Plan & billing" />

            <div className="flex w-full max-w-5xl flex-col gap-8 p-4">
                <Heading
                    title="Plan & billing"
                    description="Your plan, this month’s usage, and how to pay"
                />

                {summary.notice && (
                    <p
                        role="status"
                        className={cn(
                            'rounded-lg border p-4 text-sm',
                            summary.notice.tone === 'warning'
                                ? 'border-amber-500/40 bg-amber-500/10'
                                : 'border-sky-500/40 bg-sky-500/10',
                        )}
                    >
                        {summary.notice.message}
                    </p>
                )}

                <CurrentPlan summary={summary} />

                <Usage summary={summary} />

                <section className="grid gap-4">
                    <Heading
                        variant="small"
                        title="Plans"
                        description={`New shops get ${trial.days} days of ${trial.plan} free (with ${trial.texts} texts). Monthly limits reset on the 1st.`}
                    />
                    <PricingTable plans={plans} current={summary.plan.key} />
                    <p className="text-sm text-muted-foreground">
                        {everyPlanIncludes}
                    </p>
                </section>

                {summary.status !== 'demo' && (
                    <HowToPay payment={payment} plans={plans} />
                )}
            </div>
        </>
    );
}

function CurrentPlan({ summary }: { summary: PlanSummary }) {
    const endsAt = summary.ends_at
        ? longDate.format(toDate(summary.ends_at))
        : null;

    const [title, detail] = {
        demo: ['Demo shop', 'The demo shows every feature of the Pro plan.'],
        trial: [
            `${summary.plan.name} trial`,
            `Free until ${endsAt}, with ${summary.limits.monthly_sms} texts. After that your shop moves to the Free plan, unless you choose a plan.`,
        ],
        paid: [
            `${summary.plan.name} plan`,
            endsAt
                ? `Paid until ${endsAt}. Pay again before then to add the next month.`
                : 'No end date.',
        ],
        lapsed: [
            'Free plan',
            `Your ${summary.lapsed_plan} plan ended on ${endsAt}. Pay to switch it back on.`,
        ],
        free: [
            'Free plan',
            'Upgrade any time for more counters, no customer limit and texts to customers.',
        ],
    }[summary.status];

    return (
        <section className="grid gap-1 rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Your plan</p>
            <p className="text-xl font-semibold">{title}</p>
            <p className="text-sm text-muted-foreground">{detail}</p>
        </section>
    );
}

function Usage({ summary }: { summary: PlanSummary }) {
    const { limits, usage } = summary;

    const meters = [
        {
            label: 'Customers this month',
            used: usage.customers,
            limit: limits.monthly_customers,
        },
        {
            label: 'Texts this month',
            used: usage.texts,
            limit: limits.monthly_sms,
            // No texts at all on this plan.
            off: limits.monthly_sms === 0,
        },
        {
            label: 'Counters switched on',
            used: usage.active_counters,
            limit: limits.counters,
        },
    ];

    return (
        <section className="grid gap-3">
            <Heading
                variant="small"
                title="This month"
                description={`Monthly limits reset on ${longDate.format(toDate(summary.resets_on))}.`}
            />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {meters.map((meter) => {
                    const share =
                        meter.limit !== null && meter.limit > 0
                            ? Math.min(1, meter.used / meter.limit)
                            : 0;

                    return (
                        <div
                            key={meter.label}
                            className="grid content-start gap-2 rounded-lg border p-3"
                        >
                            <p className="text-xs text-muted-foreground">
                                {meter.label}
                            </p>
                            <p className="text-2xl font-semibold tabular-nums">
                                {meter.off ? (
                                    'Not included'
                                ) : (
                                    <>
                                        {peso.format(meter.used)}
                                        <span className="text-sm font-normal text-muted-foreground">
                                            {meter.limit !== null
                                                ? ` of ${peso.format(meter.limit)}`
                                                : ' · no limit'}
                                        </span>
                                    </>
                                )}
                            </p>
                            {meter.limit !== null && !meter.off && (
                                <div className="h-2 rounded-full bg-muted">
                                    <div
                                        className={cn(
                                            'h-2 rounded-full',
                                            share >= 1
                                                ? 'bg-amber-500'
                                                : 'bg-emerald-500',
                                        )}
                                        style={{ width: `${share * 100}%` }}
                                    />
                                </div>
                            )}
                        </div>
                    );
                })}
                <div className="grid content-start gap-2 rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">
                        Stats history
                    </p>
                    <p className="text-2xl font-semibold">
                        {historyLabel(limits.history_days)}
                    </p>
                </div>
            </div>
        </section>
    );
}

function HowToPay({
    payment,
    plans,
}: {
    payment: PaymentDetails;
    plans: PlanOffer[];
}) {
    const wallets = [
        { name: 'GCash', number: payment.gcash },
        { name: 'Maya', number: payment.maya },
    ].filter((wallet) => wallet.number);

    const prices = plans
        .filter((plan) => plan.price > 0)
        .map((plan) => `₱${peso.format(plan.price)} for ${plan.name}`)
        .join(' or ');

    if (wallets.length === 0) {
        return (
            <section className="grid gap-2 rounded-lg border p-4">
                <Heading variant="small" title="How to upgrade" />
                <p className="text-sm text-muted-foreground">
                    {payment.contact ? (
                        <>
                            To upgrade, contact us at{' '}
                            <Contact contact={payment.contact} />.
                        </>
                    ) : (
                        'Paid plans open soon. Your shop stays on its current plan until then.'
                    )}
                </p>
            </section>
        );
    }

    return (
        <section className="grid gap-4 rounded-lg border p-4">
            <Heading
                variant="small"
                title="How to pay"
                description="By GCash or Maya, a month at a time"
            />
            <ol className="grid list-decimal gap-3 pl-5 text-sm">
                <li>
                    Send {prices} for each month to:
                    <ul className="mt-2 grid gap-1">
                        {wallets.map((wallet) => (
                            <li key={wallet.name}>
                                <span className="font-medium">
                                    {wallet.name}:
                                </span>{' '}
                                <span className="font-mono">
                                    {wallet.number}
                                </span>
                                {payment.account_name &&
                                    ` (${payment.account_name})`}
                            </li>
                        ))}
                    </ul>
                </li>
                <li>
                    In the message, write your shop&apos;s link name:{' '}
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono">
                        {payment.reference}
                    </span>
                </li>
                {payment.contact && (
                    <li>
                        Send the receipt screenshot to{' '}
                        <Contact contact={payment.contact} />.
                    </li>
                )}
            </ol>
            <p className="text-sm text-muted-foreground">
                Your plan is switched on within a day. Paying before your plan
                ends adds the month after it, so you never lose days.
            </p>
        </section>
    );
}

/** An email address, a link, or plain text such as a phone number. */
function Contact({ contact }: { contact: string }) {
    const isLink = /^https?:\/\//.test(contact);
    const isEmail = !isLink && contact.includes('@');

    if (!isLink && !isEmail) {
        return <span className="font-medium">{contact}</span>;
    }

    return (
        <a
            href={isEmail ? `mailto:${contact}` : contact}
            target={isLink ? '_blank' : undefined}
            rel={isLink ? 'noreferrer' : undefined}
            className="font-medium underline underline-offset-4"
        >
            {contact.replace(/^https?:\/\//, '')}
        </a>
    );
}

PlanPage.layout = {
    breadcrumbs: [
        {
            title: 'Plan & billing',
            href: show(),
        },
    ],
};
