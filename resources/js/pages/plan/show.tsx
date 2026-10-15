import { Form, Head, Link } from '@inertiajs/react';
import { QrCode } from 'lucide-react';
import { useState } from 'react';
import PlanPaymentController from '@/actions/App/Http/Controllers/Owner/PlanPaymentController';
import Heading from '@/components/heading';
import InputError from '@/components/input-error';
import PricingTable, {
    everyPlanIncludes,
    historyLabel,
} from '@/components/pricing-table';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { show } from '@/routes/plan';
import type {
    PaidPayment,
    PaymentDetails,
    PaymentOption,
    PendingPayment,
    PlanKey,
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
    /** Paying by QR Ph in the app is set up (HitPay). */
    online: boolean;
    options: PaymentOption[];
    pending: PendingPayment | null;
    history: PaidPayment[];
    /** The manual GCash/Maya steps, when online payments aren't set up. */
    payment: PaymentDetails;
};

export default function PlanPage({
    summary,
    plans,
    trial,
    online,
    options,
    pending,
    history,
    payment,
}: Props) {
    // Nothing to pay for: the demo, or a plan without an end date.
    const canPay =
        summary.status !== 'demo' &&
        !(summary.status === 'paid' && summary.ends_at === null);

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

                {online && pending && <Pending pending={pending} />}

                {online && canPay && (
                    <PayOnline
                        options={options}
                        plans={plans}
                        current={summary.plan.key}
                        onTrial={summary.status === 'trial'}
                    />
                )}

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

                {!online && canPay && (
                    <HowToPay payment={payment} plans={plans} />
                )}

                {history.length > 0 && <History history={history} />}
            </div>
        </>
    );
}

/** Choose a plan and months, then pay on HitPay's page by QR Ph. */
function PayOnline({
    options,
    plans,
    current,
    onTrial,
}: {
    options: PaymentOption[];
    plans: PlanOffer[];
    current: PlanKey;
    /** current is the trial's plan; another plan starts now and ends the trial. */
    onTrial: boolean;
}) {
    const paidPlans = plans.filter((plan) => plan.price > 0);
    const [plan, setPlan] = useState<PlanKey>(
        current === 'free' ? 'basic' : current,
    );
    const [months, setMonths] = useState(1);
    const monthChoices = [
        ...new Set(options.map((option) => option.months)),
    ].sort((a, b) => a - b);
    const chosen = options.find(
        (option) => option.plan === plan && option.months === months,
    );

    return (
        <section className="grid gap-4 rounded-lg border p-4">
            <Heading
                variant="small"
                title="Pay for a plan"
                description="By QR Ph: scan with GCash, Maya or your bank app"
            />

            <Form
                {...PlanPaymentController.store.form()}
                className="grid gap-4"
            >
                {({ processing, errors }) => (
                    <>
                        <fieldset className="grid gap-2">
                            <legend className="mb-2 text-sm font-medium">
                                Plan
                            </legend>
                            <div className="grid gap-2 sm:grid-cols-2">
                                {paidPlans.map((offer) => (
                                    <label
                                        key={offer.key}
                                        className={cn(
                                            'flex cursor-pointer items-center gap-3 rounded-lg border p-3',
                                            plan === offer.key &&
                                                'border-emerald-600 bg-emerald-500/5 dark:border-emerald-500',
                                        )}
                                    >
                                        <input
                                            type="radio"
                                            name="plan"
                                            value={offer.key}
                                            checked={plan === offer.key}
                                            onChange={() => setPlan(offer.key)}
                                            className="size-4 accent-emerald-600"
                                        />
                                        <span className="flex-1 font-medium">
                                            {offer.name}
                                        </span>
                                        <span className="text-sm text-muted-foreground">
                                            ₱{peso.format(offer.price)} a month
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </fieldset>

                        <fieldset className="grid gap-2">
                            <legend className="mb-2 text-sm font-medium">
                                How many months
                            </legend>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                {monthChoices.map((choice) => (
                                    <label
                                        key={choice}
                                        className={cn(
                                            'flex cursor-pointer items-center justify-center rounded-lg border px-2 py-2 text-sm',
                                            months === choice &&
                                                'border-emerald-600 bg-emerald-500/5 font-medium dark:border-emerald-500',
                                            // Can't be paid now (e.g. past 13 months ahead); still choosable, to see why.
                                            options.find(
                                                (option) =>
                                                    option.plan === plan &&
                                                    option.months === choice,
                                            )?.refusal &&
                                                'text-muted-foreground opacity-60',
                                        )}
                                    >
                                        <input
                                            type="radio"
                                            name="months"
                                            value={choice}
                                            checked={months === choice}
                                            onChange={() => setMonths(choice)}
                                            className="sr-only"
                                        />
                                        {choice === 1
                                            ? '1 month'
                                            : `${choice} months`}
                                    </label>
                                ))}
                            </div>
                        </fieldset>

                        {chosen && (
                            <p className="text-sm">
                                <span className="text-lg font-semibold">
                                    ₱{peso.format(chosen.amount)}
                                </span>{' '}
                                <span className="text-muted-foreground">
                                    {chosen.refusal ??
                                        `· ${paidPlans.find((offer) => offer.key === plan)?.name} until ${longDate.format(toDate(chosen.ends_at))}${
                                            onTrial && plan !== current
                                                ? ' (starts now; your trial ends)'
                                                : ''
                                        }`}
                                </span>
                            </p>
                        )}

                        <InputError message={errors.plan ?? errors.months} />

                        <div className="grid gap-2 sm:flex sm:items-center sm:gap-4">
                            <Button
                                type="submit"
                                className="h-11"
                                disabled={
                                    processing || !chosen || !!chosen.refusal
                                }
                            >
                                {processing ? <Spinner /> : <QrCode />}
                                {chosen
                                    ? `Pay ₱${peso.format(chosen.amount)} with QR Ph`
                                    : 'Pay with QR Ph'}
                            </Button>
                            <p className="text-xs text-muted-foreground">
                                You&apos;ll scan the code on HitPay&apos;s
                                secure page. Your plan switches on as soon as
                                it&apos;s paid.
                            </p>
                        </div>
                    </>
                )}
            </Form>
        </section>
    );
}

function Pending({ pending }: { pending: PendingPayment }) {
    const months =
        pending.months === 1 ? '1 month' : `${pending.months} months`;

    return (
        <section className="grid gap-3 rounded-lg border border-sky-500/40 bg-sky-500/10 p-4 text-sm">
            <p>
                You started paying ₱{peso.format(Number(pending.amount))} for{' '}
                {pending.plan}, {months}, but we haven&apos;t received it yet.
            </p>
            <div className="flex flex-wrap gap-2">
                <Button asChild size="sm">
                    <a href={pending.checkout_url}>Continue paying</a>
                </Button>
                <Button asChild size="sm" variant="outline">
                    <Link href={pending.check_url}>I paid, check again</Link>
                </Button>
            </div>
        </section>
    );
}

function History({ history }: { history: PaidPayment[] }) {
    return (
        <section className="grid gap-3">
            <Heading variant="small" title="Payments" />
            <ul className="divide-y rounded-lg border text-sm">
                {history.map((item) => (
                    <li
                        key={item.id}
                        className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-3"
                    >
                        <span className="font-medium">
                            {item.plan},{' '}
                            {item.months === 1
                                ? '1 month'
                                : `${item.months} months`}{' '}
                            · ₱{peso.format(Number(item.amount))}
                        </span>
                        <span className="text-muted-foreground">
                            Paid{' '}
                            {item.paid_at
                                ? longDate.format(toDate(item.paid_at))
                                : ''}
                            {item.plan_ends_at &&
                                ` · until ${longDate.format(toDate(item.plan_ends_at))}`}
                        </span>
                    </li>
                ))}
            </ul>
        </section>
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
