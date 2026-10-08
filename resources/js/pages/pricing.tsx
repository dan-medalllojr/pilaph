import { Head, Link, usePage } from '@inertiajs/react';
import PricingTable, { everyPlanIncludes } from '@/components/pricing-table';
import SiteHeader, { SiteFooter } from '@/components/site-header';
import TryDemoButton from '@/components/try-demo-button';
import { Button } from '@/components/ui/button';
import { dashboard, register } from '@/routes';
import type { PlanOffer, TrialOffer } from '@/types';

function questions(plans: PlanOffer[]) {
    const freeLimit = plans.find((plan) => plan.key === 'free')?.limits
        .monthly_customers;

    return [
        {
            question: 'What happens when the trial ends?',
            answer: 'Your shop moves to the Free plan by itself. Nothing is charged and nothing is deleted. Choose a plan any time to get the rest back.',
        },
        {
            question: 'How do I pay?',
            answer: 'By GCash or Maya, a month at a time. The steps are on the Plan & billing page once you sign up. Paying before your plan ends adds the month after it, so you never lose days.',
        },
        freeLimit != null && {
            question: `What if a Free shop gets more than ${freeLimit} customers in a month?`,
            answer: 'Your queue is never cut off in the middle of a day. From the next day, customers can’t join online until the 1st of the next month, unless you upgrade.',
        },
        {
            question: 'What do you keep about my customers?',
            answer: 'The name they type and, if they give it, their mobile number, only for the queue. Both are erased a week later; the counts and times stay for your stats.',
        },
    ].filter((item) => item !== false);
}

export default function Pricing({
    plans,
    trial,
}: {
    plans: PlanOffer[];
    trial: TrialOffer;
}) {
    const { auth } = usePage().props;

    return (
        <>
            <Head title="Pricing" />

            <div className="min-h-svh bg-background text-foreground">
                <SiteHeader />

                <main className="mx-auto grid max-w-5xl gap-14 px-4 pt-10 pb-20 md:pt-14">
                    <section className="grid max-w-2xl gap-3">
                        <h1 className="text-3xl font-bold tracking-tight text-balance md:text-4xl">
                            Simple prices for small shops
                        </h1>
                        <p className="text-lg text-muted-foreground">
                            Start free. Every new shop gets {trial.days} days of{' '}
                            {trial.plan} to try everything, with no card needed.
                        </p>
                    </section>

                    <section className="grid gap-4">
                        <PricingTable
                            plans={plans}
                            action={(plan) =>
                                auth.user ? (
                                    <Button
                                        asChild
                                        className="w-full"
                                        variant={
                                            plan.key === 'basic'
                                                ? 'default'
                                                : 'outline'
                                        }
                                    >
                                        <Link href={dashboard()}>
                                            Go to your dashboard
                                        </Link>
                                    </Button>
                                ) : (
                                    <Button
                                        asChild
                                        className="w-full"
                                        variant={
                                            plan.key === 'basic'
                                                ? 'default'
                                                : 'outline'
                                        }
                                    >
                                        <Link href={register()}>
                                            {plan.price === 0
                                                ? 'Start free'
                                                : `Try ${trial.plan} free for ${trial.days} days`}
                                        </Link>
                                    </Button>
                                )
                            }
                        />
                        <p className="text-sm text-muted-foreground">
                            {everyPlanIncludes} Prices in Philippine pesos.
                        </p>
                    </section>

                    <section className="grid gap-6">
                        <h2 className="text-2xl font-semibold tracking-tight">
                            Questions
                        </h2>
                        <dl className="grid gap-6 md:grid-cols-2">
                            {questions(plans).map((item) => (
                                <div key={item.question} className="grid gap-1">
                                    <dt className="font-medium">
                                        {item.question}
                                    </dt>
                                    <dd className="text-sm text-muted-foreground">
                                        {item.answer}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    </section>

                    {!auth.user && (
                        <section className="flex flex-wrap items-center gap-3">
                            <Button asChild size="lg">
                                <Link href={register()}>
                                    Set up your shop — free
                                </Link>
                            </Button>
                            <TryDemoButton />
                        </section>
                    )}
                </main>

                <SiteFooter />
            </div>
        </>
    );
}
