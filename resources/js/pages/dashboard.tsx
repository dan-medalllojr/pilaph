import { Form, Head, Link } from '@inertiajs/react';
import { ChevronRight, Megaphone, Smartphone, UserX } from 'lucide-react';
import { useState } from 'react';
import QueueController from '@/actions/App/Http/Controllers/Owner/QueueController';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { useNow, usePolledState } from '@/hooks/use-polled-state';
import { dashboard } from '@/routes';
import { state as dashboardState } from '@/routes/dashboard';
import { index as counterIndex } from '@/routes/counters';
import { index as serviceIndex } from '@/routes/services';
import type { OwnerQueue, OwnerTicket } from '@/types';

export default function Dashboard({ queue: initial }: { queue: OwnerQueue }) {
    const queue = usePolledState(initial, dashboardState.url());
    const now = useNow();
    const needsSetup =
        queue.setup.active_services === 0 || queue.setup.active_counters === 0;

    return (
        <>
            <Head title="Queue" />

            <div className="flex w-full max-w-6xl flex-col gap-6 p-4">
                <QueueHeader queue={queue} />

                {needsSetup && <SetupNotice queue={queue} />}

                <Stats queue={queue} />

                {queue.counters.length > 0 && (
                    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {queue.counters.map((counter) => (
                            <CounterCard
                                key={counter.id}
                                counter={counter}
                                waitingCount={queue.waiting.length}
                                now={now}
                            />
                        ))}
                    </section>
                )}

                <WaitingList waiting={queue.waiting} now={now} />
            </div>
        </>
    );
}

function QueueHeader({ queue }: { queue: OwnerQueue }) {
    const { business } = queue;
    const status = !business.is_open
        ? 'Paused: new customers can’t join'
        : business.closed_reason === 'after_cutoff'
          ? `Closed for today (cutoff ${business.join_cutoff_time})`
          : business.closed_reason === 'full'
            ? 'Full: new customers can’t join right now'
            : business.join_cutoff_time
              ? `Open: customers can join until ${business.join_cutoff_time}`
              : 'Open: customers can join';

    return (
        <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid gap-0.5">
                <h1 className="text-xl font-semibold tracking-tight">
                    {business.name}
                </h1>
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span
                        className={`size-2 rounded-full ${
                            business.is_open && !business.closed_reason
                                ? 'bg-emerald-500'
                                : 'bg-amber-500'
                        }`}
                    />
                    {status}
                </p>
            </div>

            <Form {...QueueController.toggle.form()}>
                {({ processing }) => (
                    <>
                        <input
                            type="hidden"
                            name="is_open"
                            value={business.is_open ? '0' : '1'}
                        />
                        <Button
                            type="submit"
                            variant={business.is_open ? 'outline' : 'default'}
                            disabled={processing}
                        >
                            {business.is_open ? 'Pause queue' : 'Open queue'}
                        </Button>
                    </>
                )}
            </Form>
        </header>
    );
}

function SetupNotice({ queue }: { queue: OwnerQueue }) {
    const missing = [
        queue.setup.active_services === 0 && {
            label: 'Add a service',
            href: serviceIndex(),
        },
        queue.setup.active_counters === 0 && {
            label: 'Add a counter',
            href: counterIndex(),
        },
    ].filter((item) => item !== false);

    return (
        <div className="grid gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
            <p className="font-medium">
                Finish setting up before customers arrive
            </p>
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
                {missing.map((item) => (
                    <li key={item.label}>
                        <Link
                            href={item.href}
                            className="inline-flex items-center gap-1 underline underline-offset-4"
                        >
                            {item.label} <ChevronRight className="size-3.5" />
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function Stats({ queue }: { queue: OwnerQueue }) {
    const items = [
        { label: 'Waiting', value: queue.stats.waiting },
        { label: 'Served today', value: queue.stats.served },
        { label: 'No-shows today', value: queue.stats.no_shows },
        {
            label: 'Average wait',
            value:
                queue.stats.average_wait_minutes === null
                    ? '—'
                    : `${queue.stats.average_wait_minutes} min`,
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
                </div>
            ))}
        </section>
    );
}

function CounterCard({
    counter,
    waitingCount,
    now,
}: {
    counter: OwnerQueue['counters'][number];
    waitingCount: number;
    now: number;
}) {
    const current = counter.current;

    return (
        <article className="flex flex-col gap-4 rounded-xl border p-4">
            <div className="flex items-center justify-between gap-2">
                <h2 className="font-medium">{counter.name}</h2>
                {current ? (
                    <Badge>Serving</Badge>
                ) : (
                    <Badge variant="outline">Free</Badge>
                )}
            </div>

            {current ? (
                <div className="grid gap-0.5">
                    <p className="font-mono text-4xl font-bold tracking-tight">
                        {current.code}
                    </p>
                    <p className="truncate">{current.customer_name}</p>
                    <p className="text-xs text-muted-foreground">
                        {current.service} · called{' '}
                        {minutesAgo(current.called_at, now)}
                    </p>
                </div>
            ) : (
                <p className="py-3 text-sm text-muted-foreground">
                    Nobody at this counter.
                </p>
            )}

            <Form {...QueueController.callNext.form(counter.id)}>
                {({ processing }) => (
                    <>
                        <input
                            type="hidden"
                            name="expected_current_ticket_id"
                            value={current?.id ?? ''}
                        />
                        <Button
                            type="submit"
                            className="h-12 w-full text-base"
                            disabled={
                                processing || (waitingCount === 0 && !current)
                            }
                        >
                            {processing && <Spinner />}
                            {waitingCount === 0
                                ? current
                                    ? 'Done, nobody waiting'
                                    : 'Nobody waiting'
                                : 'Call next'}
                        </Button>
                    </>
                )}
            </Form>

            {current && (
                <div className="grid grid-cols-3 gap-2">
                    <TicketAction
                        form={QueueController.recall.form(current.id)}
                        icon={Megaphone}
                        label="Recall"
                    />
                    <TicketAction
                        form={QueueController.noShow.form(current.id)}
                        icon={UserX}
                        label="No-show"
                    />
                    <TicketAction
                        form={QueueController.done.form(current.id)}
                        label="Done"
                    />
                </div>
            )}
        </article>
    );
}

function TicketAction({
    form,
    icon: Icon,
    label,
}: {
    form: ReturnType<typeof QueueController.done.form>;
    icon?: typeof Megaphone;
    label: string;
}) {
    return (
        <Form {...form}>
            {({ processing }) => (
                <Button
                    type="submit"
                    variant="outline"
                    className="h-11 w-full"
                    disabled={processing}
                >
                    {Icon && <Icon />}
                    {label}
                </Button>
            )}
        </Form>
    );
}

function WaitingList({
    waiting,
    now,
}: {
    waiting: OwnerTicket[];
    now: number;
}) {
    const [selected, setSelected] = useState<Set<string>>(new Set());
    // Tickets called or removed since they were ticked drop out of the selection.
    const selectedIds = waiting
        .map((ticket) => ticket.id)
        .filter((id) => selected.has(id));

    const toggle = (id: string, checked: boolean) =>
        setSelected((previous) => {
            const next = new Set(previous);
            if (checked) {
                next.add(id);
            } else {
                next.delete(id);
            }

            return next;
        });

    return (
        <section className="rounded-xl border">
            <header className="flex items-center justify-between gap-3 border-b p-4">
                <h2 className="font-medium">
                    Waiting{' '}
                    <span className="text-muted-foreground">
                        ({waiting.length})
                    </span>
                </h2>
                {selectedIds.length > 0 && (
                    <RemoveSelected
                        ids={selectedIds}
                        onDone={() => setSelected(new Set())}
                    />
                )}
            </header>

            {waiting.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                    Nobody is waiting right now.
                </p>
            ) : (
                <ol className="divide-y">
                    {waiting.map((ticket, index) => (
                        <li key={ticket.id}>
                            <label className="flex cursor-pointer items-center gap-3 p-4 hover:bg-muted/40">
                                <Checkbox
                                    checked={selected.has(ticket.id)}
                                    onCheckedChange={(checked) =>
                                        toggle(ticket.id, checked === true)
                                    }
                                    aria-label={`Select ${ticket.code}`}
                                />
                                <span className="w-6 text-right text-xs text-muted-foreground tabular-nums">
                                    {index + 1}
                                </span>
                                <span className="w-16 font-mono font-semibold">
                                    {ticket.code}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate">
                                        {ticket.customer_name}
                                    </span>
                                    <span className="block text-xs text-muted-foreground">
                                        {ticket.service} · waiting{' '}
                                        {minutesAgo(ticket.joined_at, now)}
                                    </span>
                                </span>
                                {ticket.has_phone && (
                                    <Smartphone
                                        className="size-4 text-muted-foreground"
                                        aria-label="Gets SMS updates"
                                    />
                                )}
                            </label>
                        </li>
                    ))}
                </ol>
            )}
        </section>
    );
}

function RemoveSelected({
    ids,
    onDone,
}: {
    ids: string[];
    onDone: () => void;
}) {
    const [open, setOpen] = useState(false);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="destructive" size="sm">
                    Remove {ids.length}
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogTitle>
                    Remove {ids.length}{' '}
                    {ids.length === 1 ? 'ticket' : 'tickets'}?
                </DialogTitle>
                <DialogDescription>
                    Use this for fake or spam tickets. They&apos;re cancelled
                    and leave the line; the customer&apos;s page will show it.
                </DialogDescription>
                <Form
                    {...QueueController.bulkRemove.form()}
                    onSuccess={() => {
                        setOpen(false);
                        onDone();
                    }}
                >
                    {({ processing }) => (
                        <>
                            {ids.map((id) => (
                                <input
                                    key={id}
                                    type="hidden"
                                    name="ticket_ids[]"
                                    value={id}
                                />
                            ))}
                            <DialogFooter className="gap-2">
                                <DialogClose asChild>
                                    <Button variant="secondary" type="button">
                                        Cancel
                                    </Button>
                                </DialogClose>
                                <Button
                                    variant="destructive"
                                    type="submit"
                                    disabled={processing}
                                >
                                    Remove
                                </Button>
                            </DialogFooter>
                        </>
                    )}
                </Form>
            </DialogContent>
        </Dialog>
    );
}

/** "just now", "5 min ago", "1 h 20 min ago" */
function minutesAgo(iso: string | null, now: number): string {
    if (!iso) {
        return '';
    }

    const minutes = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));

    if (minutes < 1) {
        return 'just now';
    }

    if (minutes < 60) {
        return `${minutes} min ago`;
    }

    return `${Math.floor(minutes / 60)} h ${minutes % 60} min ago`;
}

Dashboard.layout = {
    breadcrumbs: [
        {
            title: 'Queue',
            href: dashboard(),
        },
    ],
};
