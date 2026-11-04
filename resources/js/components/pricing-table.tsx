import { Check, Minus } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { PlanKey, PlanLimits, PlanOffer } from '@/types';

const peso = new Intl.NumberFormat('en-PH');

/** 30 -> "30 days", 183 -> "6 months", 365 -> "12 months". */
export function historyLabel(days: number): string {
    return days < 60 ? `${days} days` : `${Math.round(days / 30.4)} months`;
}

/** What each plan includes, as short lines; false means not included. */
function features(limits: PlanLimits): { text: string; included: boolean }[] {
    return [
        {
            text:
                limits.counters === null
                    ? 'Any number of counters'
                    : limits.counters === 1
                      ? '1 counter'
                      : `Up to ${limits.counters} counters`,
            included: true,
        },
        {
            text:
                limits.monthly_customers === null
                    ? 'No limit on customers'
                    : `${peso.format(limits.monthly_customers)} customers a month`,
            included: true,
        },
        {
            text:
                limits.monthly_sms > 0
                    ? `${peso.format(limits.monthly_sms)} SMS a month to customers`
                    : 'No SMS to customers',
            included: limits.monthly_sms > 0,
        },
        {
            text: `${historyLabel(limits.history_days)} of stats`,
            included: true,
        },
        {
            text: limits.photo
                ? 'Your shop photo on the join page'
                : 'No shop photo',
            included: limits.photo,
        },
        {
            text: limits.branding
                ? '“Queue by PilaPH” on your pages'
                : 'No “PilaPH” name on your pages',
            included: !limits.branding,
        },
    ];
}

/** Included on every plan, listed under the table. */
export const everyPlanIncludes =
    'Every plan includes the QR poster, the live ticket page, the TV display, Call next from your phone and push alerts.';

export default function PricingTable({
    plans,
    current,
    highlight = 'basic',
    action,
}: {
    plans: PlanOffer[];
    /** Marks the shop's plan (Plan & billing). */
    current?: PlanKey;
    /** Marked as the one most shops need. */
    highlight?: PlanKey;
    /** A button under each plan, e.g. "Get started". */
    action?: (plan: PlanOffer) => ReactNode;
}) {
    return (
        <div className="grid gap-4 md:grid-cols-3">
            {plans.map((plan) => {
                const isCurrent = plan.key === current;
                const isHighlighted = !current && plan.key === highlight;

                return (
                    <article
                        key={plan.key}
                        className={cn(
                            'flex flex-col gap-4 rounded-xl border p-5',
                            (isCurrent || isHighlighted) &&
                                'border-emerald-600 ring-1 ring-emerald-600 dark:border-emerald-500 dark:ring-emerald-500',
                        )}
                    >
                        <div className="flex items-center justify-between gap-2">
                            <h3 className="text-lg font-semibold">
                                {plan.name}
                            </h3>
                            {isCurrent && <Badge>Your plan</Badge>}
                            {isHighlighted && (
                                <Badge variant="secondary">
                                    Most shops pick this
                                </Badge>
                            )}
                        </div>

                        <p className="flex items-baseline gap-1">
                            <span className="text-3xl font-bold tracking-tight">
                                {plan.price === 0
                                    ? '₱0'
                                    : `₱${peso.format(plan.price)}`}
                            </span>
                            <span className="text-sm text-muted-foreground">
                                {plan.price === 0 ? 'forever' : 'a month'}
                            </span>
                        </p>

                        <ul className="grid gap-2 text-sm">
                            {features(plan.limits).map((feature) => (
                                <li
                                    key={feature.text}
                                    className={cn(
                                        'flex items-start gap-2',
                                        !feature.included &&
                                            'text-muted-foreground',
                                    )}
                                >
                                    {feature.included ? (
                                        <Check className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                                    ) : (
                                        <Minus className="mt-0.5 size-4 shrink-0" />
                                    )}
                                    <span>{feature.text}</span>
                                </li>
                            ))}
                        </ul>

                        {action && (
                            <div className="mt-auto">{action(plan)}</div>
                        )}
                    </article>
                );
            })}
        </div>
    );
}
