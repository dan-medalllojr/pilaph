import { Head, Link } from '@inertiajs/react';
import Heading from '@/components/heading';
import { cn } from '@/lib/utils';
import { show } from '@/routes/stats';
import type { ShopStats } from '@/types';

const periods = [
    { days: 1, label: 'Today' },
    { days: 7, label: 'Last 7 days' },
    { days: 30, label: 'Last 30 days' },
];

const shortDate = new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
});
const weekday = new Intl.DateTimeFormat('en-PH', { weekday: 'short' });

/** "2026-10-07" as a local date (not UTC midnight). */
const toDate = (date: string) => new Date(`${date}T00:00:00`);

/** 9 -> "9 AM", 13 -> "1 PM". */
const hourLabel = (hour: number) =>
    `${hour % 12 || 12} ${hour < 12 ? 'AM' : 'PM'}`;

export default function Stats({ stats }: { stats: ShopStats }) {
    const range =
        stats.days === 1
            ? `Today, ${shortDate.format(toDate(stats.to))}`
            : `${shortDate.format(toDate(stats.from))} – ${shortDate.format(toDate(stats.to))}`;

    return (
        <>
            <Head title="Stats" />

            <div className="flex w-full max-w-6xl flex-col gap-6 p-4">
                <header className="flex flex-wrap items-end justify-between gap-3">
                    <Heading title="Stats" description={range} />
                    <nav
                        aria-label="Period"
                        className="inline-flex rounded-lg border p-1 text-sm"
                    >
                        {periods.map((period) => (
                            <Link
                                key={period.days}
                                href={show({ query: { days: period.days } })}
                                preserveScroll
                                className={cn(
                                    'rounded-md px-3 py-1.5',
                                    period.days === stats.days
                                        ? 'bg-muted font-medium'
                                        : 'text-muted-foreground hover:text-foreground',
                                )}
                                aria-current={
                                    period.days === stats.days
                                        ? 'page'
                                        : undefined
                                }
                            >
                                {period.label}
                            </Link>
                        ))}
                    </nav>
                </header>

                {stats.joined === 0 ? (
                    <p className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
                        No customers in this period yet.
                    </p>
                ) : (
                    <>
                        <Totals stats={stats} />

                        <section className="grid gap-6 lg:grid-cols-2">
                            <BusiestHours hours={stats.busiest_hours} />
                            {stats.days > 1 && <ServedPerDay stats={stats} />}
                        </section>

                        <section className="grid gap-6 lg:grid-cols-2">
                            <Breakdown
                                title="By service"
                                rows={stats.by_service.map((service) => ({
                                    key: service.prefix,
                                    label: `${service.prefix} · ${service.name}`,
                                    value: service.served,
                                    detail:
                                        service.average_service_minutes !== null
                                            ? `${service.average_service_minutes} min each`
                                            : null,
                                }))}
                            />
                            <Breakdown
                                title="By counter"
                                rows={stats.by_counter.map((counter) => ({
                                    key: counter.name,
                                    label: counter.name,
                                    value: counter.served,
                                    detail: null,
                                }))}
                            />
                        </section>
                    </>
                )}
            </div>
        </>
    );
}

function Totals({ stats }: { stats: ShopStats }) {
    const called = stats.served + stats.no_shows;
    const minutes = (value: number | null) =>
        value === null ? '—' : `${value} min`;

    const items = [
        {
            label: 'Served',
            value: stats.served,
            detail: `of ${stats.joined} who joined`,
        },
        {
            label: 'Average wait',
            value: minutes(stats.average_wait_minutes),
            detail: 'from joining to being called',
        },
        {
            label: 'Average service',
            value: minutes(stats.average_service_minutes),
            detail: 'from being called to done',
        },
        {
            label: 'No-shows',
            value: stats.no_shows,
            detail:
                called > 0
                    ? `${Math.round((stats.no_shows / called) * 100)}% of those called`
                    : null,
        },
    ];

    return (
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {items.map((item) => (
                <div key={item.label} className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">
                        {item.label}
                    </p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums">
                        {item.value}
                    </p>
                    {item.detail && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            {item.detail}
                        </p>
                    )}
                </div>
            ))}
        </section>
    );
}

function BusiestHours({ hours }: { hours: ShopStats['busiest_hours'] }) {
    const peak = hours.reduce(
        (best, hour) => (hour.joined > best.joined ? hour : best),
        hours[0],
    );

    return (
        <Panel
            title="Busiest hours"
            description={
                peak
                    ? `Most customers join around ${hourLabel(peak.hour)}–${hourLabel((peak.hour + 1) % 24)}.`
                    : undefined
            }
        >
            <Bars
                items={hours.map((hour) => ({
                    key: String(hour.hour),
                    label: `${hour.hour % 12 || 12}${hour.hour < 12 ? 'a' : 'p'}`,
                    value: hour.joined,
                    title: `${hourLabel(hour.hour)}: ${hour.joined} joined`,
                }))}
                highlight={peak ? String(peak.hour) : undefined}
            />
        </Panel>
    );
}

function ServedPerDay({ stats }: { stats: ShopStats }) {
    const total = stats.served_per_day.length;

    return (
        <Panel
            title="Served per day"
            description={`${Math.round((stats.served / total) * 10) / 10} a day on average.`}
        >
            <Bars
                items={stats.served_per_day.map((day, index) => {
                    const date = toDate(day.date);
                    // 7 days: every weekday; 30 days: a date every 5 days.
                    const label =
                        total <= 7
                            ? weekday.format(date)
                            : index % 5 === 0 || index === total - 1
                              ? String(date.getDate())
                              : '';

                    return {
                        key: day.date,
                        label,
                        value: day.served,
                        title: `${shortDate.format(date)}: ${day.served} served`,
                    };
                })}
            />
        </Panel>
    );
}

function Breakdown({
    title,
    rows,
}: {
    title: string;
    rows: {
        key: string;
        label: string;
        value: number;
        detail: string | null;
    }[];
}) {
    const max = Math.max(1, ...rows.map((row) => row.value));

    return (
        <Panel title={title}>
            {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    Nobody served yet.
                </p>
            ) : (
                <ul className="grid gap-3">
                    {rows.map((row) => (
                        <li key={row.key} className="grid gap-1 text-sm">
                            <div className="flex items-baseline justify-between gap-3">
                                <span className="truncate">{row.label}</span>
                                <span className="shrink-0 text-muted-foreground tabular-nums">
                                    {row.value} served
                                    {row.detail && ` · ${row.detail}`}
                                </span>
                            </div>
                            <div className="h-2 rounded-full bg-muted">
                                <div
                                    className="h-2 rounded-full bg-primary/70"
                                    style={{
                                        width: `${(row.value / max) * 100}%`,
                                    }}
                                />
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </Panel>
    );
}

function Panel({
    title,
    description,
    children,
}: {
    title: string;
    description?: string;
    children: React.ReactNode;
}) {
    return (
        <section className="grid content-start gap-4 rounded-lg border p-4">
            <Heading variant="small" title={title} description={description} />
            {children}
        </section>
    );
}

/** A simple bar chart; each bar's exact number is in its tooltip. */
function Bars({
    items,
    highlight,
}: {
    items: { key: string; label: string; value: number; title: string }[];
    highlight?: string;
}) {
    const max = Math.max(1, ...items.map((item) => item.value));
    // Numbers over 30 thin bars would run into each other.
    const showValues = items.length <= 14;

    return (
        <div className="flex h-48 gap-1" role="list">
            {items.map((item) => (
                <div
                    key={item.key}
                    role="listitem"
                    aria-label={item.title}
                    title={item.title}
                    className="flex min-w-0 flex-1 flex-col items-center gap-1"
                >
                    {showValues && (
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                            {item.value > 0 ? item.value : ''}
                        </span>
                    )}
                    <div className="flex w-full flex-1 items-end">
                        <div
                            className={cn(
                                'w-full rounded-t-sm',
                                item.key === highlight
                                    ? 'bg-emerald-500'
                                    : 'bg-primary/70',
                            )}
                            style={{
                                height: `${(item.value / max) * 100}%`,
                                minHeight: item.value > 0 ? 2 : 0,
                            }}
                        />
                    </div>
                    <span className="h-3 text-[10px] whitespace-nowrap text-muted-foreground">
                        {item.label}
                    </span>
                </div>
            ))}
        </div>
    );
}

Stats.layout = {
    breadcrumbs: [
        {
            title: 'Stats',
            href: show(),
        },
    ],
};
