import { Head, Link, usePage } from '@inertiajs/react';
import { CheckCircle2, Circle } from 'lucide-react';
import Heading from '@/components/heading';
import { dashboard } from '@/routes';
import { edit as businessSettings } from '@/routes/business';
import { index as counters } from '@/routes/counters';
import { index as services } from '@/routes/services';

type Props = {
    setup: {
        activeServices: number;
        activeCounters: number;
    };
};

// A setup checklist for now; phase 5 turns this page into the live queue.
export default function Dashboard({ setup }: Props) {
    const { business } = usePage().props;

    const steps = [
        {
            done: setup.activeServices > 0,
            title: 'Add your services',
            detail: 'What customers line up for, each with its ticket letter.',
            href: services(),
        },
        {
            done: setup.activeCounters > 0,
            title: 'Add your counters',
            detail: 'Where customers are served, e.g. Chair 1.',
            href: counters(),
        },
        {
            done: false,
            title: 'Review your queue rules',
            detail: 'Queue limit, join cutoff and near-turn texts.',
            href: businessSettings(),
        },
    ];

    return (
        <>
            <Head title="Dashboard" />

            <div className="flex w-full max-w-2xl flex-col gap-6 p-4">
                <Heading
                    title={business?.name ?? 'Dashboard'}
                    description="Get your shop ready for customers"
                />

                <ol className="divide-y rounded-lg border">
                    {steps.map((step) => (
                        <li key={step.title}>
                            <Link
                                href={step.href}
                                className="flex items-start gap-3 p-4 hover:bg-muted/50"
                            >
                                {step.done ? (
                                    <CheckCircle2 className="mt-0.5 size-5 text-emerald-600" />
                                ) : (
                                    <Circle className="mt-0.5 size-5 text-muted-foreground" />
                                )}
                                <span className="grid gap-0.5">
                                    <span className="font-medium">
                                        {step.title}
                                    </span>
                                    <span className="text-sm text-muted-foreground">
                                        {step.detail}
                                    </span>
                                </span>
                            </Link>
                        </li>
                    ))}
                </ol>
            </div>
        </>
    );
}

Dashboard.layout = {
    breadcrumbs: [
        {
            title: 'Dashboard',
            href: dashboard(),
        },
    ],
};
