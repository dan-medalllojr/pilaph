import { Form, Head } from '@inertiajs/react';
import {
    BellRing,
    CalendarX,
    CheckCircle2,
    CircleSlash,
    Clock,
    UserX,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import TicketController from '@/actions/App/Http/Controllers/Customer/TicketController';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import LiveIndicator from '@/components/live-indicator';
import { useLiveState } from '@/hooks/use-live-state';
import {
    estimateWait,
    forgetTicket,
    formatWait,
    rememberTicket,
} from '@/lib/queue';
import { state as ticketStateRoute } from '@/routes/tickets';
import type { QueueBroadcast, TicketState } from '@/types';

const isActive = (ticket: TicketState) =>
    !ticket.past_day &&
    (ticket.status === 'waiting' || ticket.status === 'called');

export default function TicketPage({
    ticket: initial,
}: {
    ticket: TicketState;
}) {
    // When the owner taps Recall, show that they're calling again.
    const [recalledAt, setRecalledAt] = useState<number | null>(null);

    const { state: ticket, live } = useLiveState({
        initial,
        url: ticketStateRoute.url(initial.id),
        active: isActive,
        topics: (t) => [`queue:${t.business.id}`, `ticket:${t.id}`],
        onEvent: ({ topic, payload }, { state, setState, refetch }) => {
            // Anyone can send to a public channel, so news about this ticket
            // itself is confirmed with the server before it's shown.
            if (topic.startsWith('ticket:')) {
                if ((payload as { recalled?: boolean } | null)?.recalled) {
                    setRecalledAt(Date.now());
                }

                refetch();

                return;
            }

            // Queue updates: work out the new place in line locally, so a
            // single "Call next" doesn't make every waiting phone refetch.
            const queue = (payload as QueueBroadcast | null)?.queue;
            if (
                state.status !== 'waiting' ||
                !Array.isArray(queue?.waiting_codes)
            ) {
                return;
            }

            const index = queue.waiting_codes.indexOf(state.code);
            if (index === -1) {
                // No longer waiting (called or removed): confirm with the server.
                refetch();

                return;
            }

            setState({
                ...state,
                position: index + 1,
                wait: estimateWait(
                    queue.waiting_codes.slice(0, index),
                    queue.average_minutes,
                    queue.active_counters,
                ),
            });
        },
    });
    const active = isActive(ticket);

    // Remember the ticket on this phone while it's active, so the join page
    // can link back to it.
    useEffect(() => {
        if (active) {
            rememberTicket(ticket.business.slug, ticket.id);
        } else {
            forgetTicket(ticket.business.slug);
        }
    }, [active, ticket.business.slug, ticket.id]);

    return (
        <>
            <Head title={`${ticket.code} · ${ticket.business.name}`} />

            <header className="grid gap-1 text-center">
                <p className="text-sm text-muted-foreground">
                    {ticket.business.name} · {ticket.service}
                </p>
                <p className="font-mono text-6xl font-bold tracking-tight">
                    {ticket.code}
                </p>
                <p className="text-xs text-muted-foreground">
                    Your ticket number
                </p>
            </header>

            <StatusCard
                ticket={ticket}
                recalled={recalledAt !== null && ticket.status === 'called'}
            />

            {isActive(ticket) && ticket.status === 'waiting' && (
                <>
                    <p className="grid justify-items-center gap-1 text-center text-xs text-muted-foreground">
                        <LiveIndicator live={live} />
                        Keep this page open or bookmark it. It updates by
                        itself.
                    </p>
                    <CancelTicket ticket={ticket} />
                </>
            )}
        </>
    );
}

function StatusCard({
    ticket,
    recalled,
}: {
    ticket: TicketState;
    recalled: boolean;
}) {
    // Still waiting or called when the day ended (the owner may just have
    // forgotten to press Done), so don't say they left or missed their turn.
    if (ticket.past_day && ticket.status !== 'done') {
        return (
            <Message icon={CalendarX} title="The queue has closed for the day">
                Thanks for visiting {ticket.business.name}. Scan the QR code at
                the shop to join again another day.
            </Message>
        );
    }

    switch (ticket.status) {
        case 'waiting':
            return (
                <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border p-4 text-center">
                        <p className="text-xs text-muted-foreground">
                            Your place in line
                        </p>
                        <p className="mt-1 text-3xl font-semibold tabular-nums">
                            {ticket.position === 1
                                ? 'Next'
                                : `#${ticket.position}`}
                        </p>
                    </div>
                    <div className="rounded-lg border p-4 text-center">
                        <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                            <Clock className="size-3.5" /> Estimated wait
                        </p>
                        <p className="mt-1 text-xl font-semibold">
                            {ticket.wait ? formatWait(ticket.wait) : '—'}
                        </p>
                    </div>
                </div>
            );
        case 'called':
            return (
                <div
                    className={`grid gap-2 rounded-lg border-2 border-emerald-600 bg-emerald-600/10 p-6 text-center ${recalled ? 'animate-pulse' : ''}`}
                >
                    <BellRing className="mx-auto size-8 text-emerald-600" />
                    <p className="text-xl font-semibold">
                        {recalled
                            ? 'They’re calling you again!'
                            : 'It’s your turn!'}
                    </p>
                    <p className="text-base">
                        Please proceed to{' '}
                        <strong>{ticket.counter ?? 'the counter'}</strong>.
                    </p>
                </div>
            );
        case 'done':
            return (
                <Message icon={CheckCircle2} title="All done">
                    Thanks for visiting {ticket.business.name}!
                </Message>
            );
        case 'no_show':
            return (
                <Message icon={UserX} title="You missed your turn">
                    Your number was called but you weren&apos;t there. Scan the
                    QR code at the shop to join again.
                </Message>
            );
        case 'cancelled':
            return (
                <Message icon={CircleSlash} title="You left the queue">
                    Scan the QR code at the shop if you want to join again.
                </Message>
            );
    }
}

function Message({
    icon: Icon,
    title,
    children,
}: {
    icon: typeof Clock;
    title: string;
    children: React.ReactNode;
}) {
    return (
        <div className="grid gap-2 rounded-lg border p-6 text-center">
            <Icon className="mx-auto size-8 text-muted-foreground" />
            <p className="font-medium">{title}</p>
            <p className="text-sm text-muted-foreground">{children}</p>
        </div>
    );
}

function CancelTicket({ ticket }: { ticket: TicketState }) {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="ghost" className="mx-auto">
                    Leave the queue
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogTitle>Leave the queue?</DialogTitle>
                <DialogDescription>
                    Ticket {ticket.code} will be cancelled and you&apos;ll lose
                    your place in line.
                </DialogDescription>
                <Form {...TicketController.cancel.form(ticket.id)}>
                    {({ processing }) => (
                        <DialogFooter className="gap-2">
                            <DialogClose asChild>
                                <Button variant="secondary" type="button">
                                    Stay in line
                                </Button>
                            </DialogClose>
                            <Button
                                variant="destructive"
                                type="submit"
                                disabled={processing}
                            >
                                Leave the queue
                            </Button>
                        </DialogFooter>
                    )}
                </Form>
            </DialogContent>
        </Dialog>
    );
}
