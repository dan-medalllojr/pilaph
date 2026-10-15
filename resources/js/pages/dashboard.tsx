import { Form, Head, Link } from '@inertiajs/react';
import {
    ChevronRight,
    Megaphone,
    Smartphone,
    UserPlus,
    UserX,
} from 'lucide-react';
import { useState } from 'react';
import QueueController from '@/actions/App/Http/Controllers/Owner/QueueController';
import InputError from '@/components/input-error';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import AlertsBanner from '@/components/alerts-banner';
import LiveIndicator from '@/components/live-indicator';
import { useLiveState, useNow } from '@/hooks/use-live-state';
import { uuid } from '@/lib/queue';
import { dashboard } from '@/routes';
import { state as dashboardState } from '@/routes/dashboard';
import { index as counterIndex } from '@/routes/counters';
import { index as serviceIndex } from '@/routes/services';
import type { OwnerQueue, OwnerTicket } from '@/types';

export default function Dashboard({ queue: initial }: { queue: OwnerQueue }) {
    // Any queue change: refetch the full state (with names) from the server.
    const { state: queue, live } = useLiveState({
        initial,
        url: dashboardState.url(),
        topics: (q) => [`queue:${q.business.id}`],
    });
    const now = useNow();
    const needsSetup =
        queue.setup.active_services === 0 || queue.setup.active_counters === 0;

    return (
        <>
            <Head title="Queue" />

            <div className="flex w-full max-w-6xl flex-col gap-6 p-4">
                <QueueHeader queue={queue} live={live} />

                {needsSetup && <SetupNotice queue={queue} />}

                <AlertsBanner />

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

function QueueHeader({ queue, live }: { queue: OwnerQueue; live: boolean }) {
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
                <LiveIndicator live={live} />
            </div>

            <div className="flex flex-wrap gap-2">
                <AddWalkIn services={queue.services} />

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
                                variant={
                                    business.is_open ? 'outline' : 'default'
                                }
                                disabled={processing}
                            >
                                {business.is_open
                                    ? 'Pause queue'
                                    : 'Open queue'}
                            </Button>
                        </>
                    )}
                </Form>
            </div>
        </header>
    );
}

type WalkInAdded = { code: string; service: string };

/**
 * For a customer without a phone or internet: staff pick the service, add
 * them, and tell them the number shown.
 */
function AddWalkIn({ services }: { services: OwnerQueue['services'] }) {
    const [open, setOpen] = useState(false);
    const [added, setAdded] = useState<WalkInAdded | null>(null);
    // A new key per walk-in: a double tap still adds them once.
    const [idempotencyKey, setIdempotencyKey] = useState(uuid);

    const startOver = () => {
        setAdded(null);
        setIdempotencyKey(uuid());
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                setOpen(next);

                if (!next && added) {
                    startOver();
                }
            }}
        >
            <DialogTrigger asChild>
                <Button variant="outline" disabled={services.length === 0}>
                    <UserPlus />
                    Add walk-in
                </Button>
            </DialogTrigger>
            <DialogContent>
                {added ? (
                    <>
                        <DialogTitle>Added to the line</DialogTitle>
                        <div className="py-2 text-center">
                            <p className="font-mono text-6xl font-bold tracking-tight">
                                {added.code}
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                                {added.service}
                            </p>
                        </div>
                        <DialogDescription>
                            Tell the customer their number, or write it down for
                            them. It shows on the TV when it&apos;s their turn.
                        </DialogDescription>
                        <DialogFooter className="gap-2">
                            <Button
                                variant="secondary"
                                type="button"
                                onClick={startOver}
                            >
                                Add another
                            </Button>
                            <DialogClose asChild>
                                <Button type="button">Done</Button>
                            </DialogClose>
                        </DialogFooter>
                    </>
                ) : (
                    <>
                        <DialogTitle>Add a walk-in</DialogTitle>
                        <DialogDescription>
                            For a customer without a phone or internet. They
                            join the end of the line, even while the queue is
                            paused or full.
                        </DialogDescription>
                        <Form
                            {...QueueController.addWalkIn.form()}
                            disableWhileProcessing
                            onSuccess={(page) => {
                                const walkIn = page.flash.walkIn as
                                    | WalkInAdded
                                    | undefined;

                                if (walkIn) {
                                    setAdded(walkIn);
                                }
                            }}
                            className="grid gap-5"
                        >
                            {({ processing, errors }) => (
                                <>
                                    <fieldset className="grid gap-2">
                                        <legend className="mb-2 text-sm font-medium">
                                            Service
                                        </legend>
                                        {services.map((service) => (
                                            <label
                                                key={service.id}
                                                className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 has-checked:border-primary has-checked:bg-primary/5"
                                            >
                                                <input
                                                    type="radio"
                                                    name="service_id"
                                                    value={service.id}
                                                    required
                                                    defaultChecked={
                                                        services.length === 1
                                                    }
                                                    className="size-4 accent-primary"
                                                />
                                                <span className="flex-1 font-medium">
                                                    {service.name}
                                                </span>
                                            </label>
                                        ))}
                                        <InputError
                                            message={errors.service_id}
                                        />
                                    </fieldset>

                                    <div className="grid gap-2">
                                        <Label htmlFor="walk_in_name">
                                            Name{' '}
                                            <span className="font-normal text-muted-foreground">
                                                (optional)
                                            </span>
                                        </Label>
                                        <Input
                                            id="walk_in_name"
                                            name="customer_name"
                                            minLength={2}
                                            maxLength={60}
                                            autoComplete="off"
                                            placeholder="So you can call them"
                                        />
                                        <InputError
                                            message={errors.customer_name}
                                        />
                                    </div>

                                    <input
                                        type="hidden"
                                        name="idempotency_key"
                                        value={idempotencyKey}
                                    />

                                    <DialogFooter className="gap-2">
                                        <DialogClose asChild>
                                            <Button
                                                variant="secondary"
                                                type="button"
                                            >
                                                Cancel
                                            </Button>
                                        </DialogClose>
                                        <Button
                                            type="submit"
                                            disabled={processing}
                                        >
                                            {processing && <Spinner />}
                                            Add to the line
                                        </Button>
                                    </DialogFooter>
                                </>
                            )}
                        </Form>
                    </>
                )}
            </DialogContent>
        </Dialog>
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
                        {current.service}
                        {current.walk_in && ' · walk-in'} · called{' '}
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
                            {/* Call next also marks the current customer
                                done; say so, so a no-show gets No-show. */}
                            {waitingCount === 0
                                ? current
                                    ? 'Done, nobody waiting'
                                    : 'Nobody waiting'
                                : current
                                  ? `Done ${current.code} · Call next`
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
                                        {ticket.service}
                                        {ticket.walk_in && ' · walk-in'} ·
                                        waiting{' '}
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
