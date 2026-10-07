import { Form, Head, Link } from '@inertiajs/react';
import { Clock, QrCode, Ticket, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import JoinController from '@/actions/App/Http/Controllers/Customer/JoinController';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { useLiveState } from '@/hooks/use-live-state';
import { formatWait, rememberedTicket, uuid } from '@/lib/queue';
import { state as queueStateRoute } from '@/routes/queue';
import { show as showTicket, state as ticketState } from '@/routes/tickets';
import type { JoinClosedReason, PublicQueue, TicketState } from '@/types';

type Props = {
    queue: PublicQueue;
    /** The scanned QR token, or null when missing or no longer valid. */
    qrToken: string | null;
    existingTicket: { id: string; code: string } | null;
};

const closedMessages: Record<
    JoinClosedReason,
    (cutoff: string | null) => string
> = {
    paused: () =>
        'The queue is paused right now. Please check again in a little while.',
    after_cutoff: (cutoff) =>
        cutoff
            ? `The queue closed for today at ${cutoff}.`
            : 'The queue is closed for today.',
    full: () =>
        'The queue is full right now. Please try again in a little while.',
};

export default function Join({
    queue: initialQueue,
    qrToken,
    existingTicket,
}: Props) {
    // On each change, refetch the (cached) public snapshot rather than trusting
    // the broadcast: anyone can send to a public channel.
    const { state: queue } = useLiveState({
        initial: initialQueue,
        url: queueStateRoute.url(initialQueue.business.slug),
        topics: (q) => [`queue:${q.business.id}`],
    });
    const { business } = queue;
    const yourTicket = useYourTicket(business.slug, existingTicket);
    // Generated once: a double tap or slow-network resubmit returns the same ticket.
    const [idempotencyKey] = useState(uuid);

    return (
        <>
            <Head title={`Join the queue at ${business.name}`} />

            <header className="grid gap-1">
                <p className="text-sm text-muted-foreground">Virtual queue</p>
                <h1 className="text-2xl font-semibold tracking-tight">
                    {business.name}
                </h1>
            </header>

            <QueueSummary queue={queue} />

            {yourTicket && (
                <Link
                    href={showTicket(yourTicket.id)}
                    className="flex items-center gap-3 rounded-lg border border-emerald-600/40 bg-emerald-600/10 p-4"
                >
                    <Ticket className="size-5 shrink-0 text-emerald-600" />
                    <span className="flex-1 text-sm">
                        You already have ticket{' '}
                        <strong className="font-mono">{yourTicket.code}</strong>
                    </span>
                    <span className="text-sm font-medium underline underline-offset-4">
                        View
                    </span>
                </Link>
            )}

            {!qrToken ? (
                <Notice icon={QrCode} title="Scan the QR code at the shop">
                    To join, scan the QR code posted inside {business.name}.
                    This keeps the line fair for the people who are there.
                </Notice>
            ) : business.closed_reason ? (
                <Notice icon={Clock} title="Not taking new customers">
                    {closedMessages[business.closed_reason](
                        business.join_cutoff_time,
                    )}
                </Notice>
            ) : !yourTicket ? (
                <JoinForm
                    queue={queue}
                    qrToken={qrToken}
                    idempotencyKey={idempotencyKey}
                />
            ) : null}
        </>
    );
}

function QueueSummary({ queue }: { queue: PublicQueue }) {
    return (
        <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border p-4">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Users className="size-3.5" /> Waiting now
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                    {queue.waiting_count}
                </p>
                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="size-3.5" />
                    Wait if you join: {formatWait(queue.wait_if_joining_now)}
                </p>
            </div>
            <div className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground">Now serving</p>
                {queue.now_serving.length === 0 ? (
                    <p className="mt-1 text-sm text-muted-foreground">—</p>
                ) : (
                    <ul className="mt-1 grid gap-0.5">
                        {queue.now_serving.map((item) => (
                            <li
                                key={item.counter}
                                className="flex justify-between gap-2 text-sm"
                            >
                                <span className="truncate text-muted-foreground">
                                    {item.counter}
                                </span>
                                <span className="font-mono font-semibold">
                                    {item.code}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

function JoinForm({
    queue,
    qrToken,
    idempotencyKey,
}: {
    queue: PublicQueue;
    qrToken: string;
    idempotencyKey: string;
}) {
    if (queue.services.length === 0) {
        return (
            <Notice icon={Clock} title="Not taking new customers">
                This shop hasn&apos;t set up its services yet.
            </Notice>
        );
    }

    return (
        <Form
            {...JoinController.store.form(queue.business.slug)}
            disableWhileProcessing
            className="grid gap-6"
        >
            {({ processing, errors }) => (
                <>
                    <InputError message={errors.queue ?? errors.k} />

                    <fieldset className="grid gap-2">
                        <legend className="mb-2 text-sm font-medium">
                            What do you need today?
                        </legend>
                        {queue.services.map((service) => (
                            <label
                                key={service.id}
                                className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 has-checked:border-emerald-600 has-checked:bg-emerald-600/10"
                            >
                                <input
                                    type="radio"
                                    name="service_id"
                                    value={service.id}
                                    required
                                    defaultChecked={queue.services.length === 1}
                                    className="size-4 accent-emerald-600"
                                />
                                <span className="flex-1 font-medium">
                                    {service.name}
                                </span>
                            </label>
                        ))}
                        <InputError message={errors.service_id} />
                    </fieldset>

                    <div className="grid gap-2">
                        <Label htmlFor="customer_name">Your name</Label>
                        <Input
                            id="customer_name"
                            name="customer_name"
                            required
                            minLength={2}
                            maxLength={60}
                            autoComplete="given-name"
                            placeholder="So staff can call you"
                        />
                        <InputError message={errors.customer_name} />
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="phone">
                            Mobile number{' '}
                            <span className="font-normal text-muted-foreground">
                                (optional)
                            </span>
                        </Label>
                        <Input
                            id="phone"
                            name="phone"
                            type="tel"
                            inputMode="tel"
                            autoComplete="tel"
                            placeholder="0917 123 4567"
                        />
                        <p className="text-xs text-muted-foreground">
                            We&apos;ll text you when your turn is near and when
                            you&apos;re called, so you can wait nearby.
                        </p>
                        <InputError message={errors.phone} />
                    </div>

                    <input
                        type="hidden"
                        name="idempotency_key"
                        value={idempotencyKey}
                    />
                    <input type="hidden" name="k" value={qrToken} />
                    {/* Honeypot: hidden from people, so only bots fill it in. */}
                    <div aria-hidden="true" className="hidden">
                        <label>
                            Website
                            <input
                                type="text"
                                name="website"
                                tabIndex={-1}
                                autoComplete="off"
                            />
                        </label>
                    </div>

                    <Button type="submit" size="lg" className="w-full">
                        {processing && <Spinner />}
                        Get my ticket
                    </Button>
                </>
            )}
        </Form>
    );
}

function Notice({
    icon: Icon,
    title,
    children,
}: {
    icon: typeof QrCode;
    title: string;
    children: React.ReactNode;
}) {
    return (
        <div className="grid gap-2 rounded-lg border p-5 text-center">
            <Icon className="mx-auto size-8 text-muted-foreground" />
            <p className="font-medium">{title}</p>
            <p className="text-sm text-muted-foreground">{children}</p>
        </div>
    );
}

/**
 * The customer's active ticket at this shop: found by the server (device
 * cookie) or, failing that, remembered on this phone.
 */
function useYourTicket(
    slug: string,
    fromServer: Props['existingTicket'],
): Props['existingTicket'] {
    const [ticket, setTicket] = useState(fromServer);

    useEffect(() => {
        if (fromServer) {
            return;
        }

        const id = rememberedTicket(slug);
        if (!id) {
            return;
        }

        let ignore = false;
        fetch(ticketState.url(id), { headers: { Accept: 'application/json' } })
            .then((response) => (response.ok ? response.json() : null))
            .then((state: TicketState | null) => {
                const active =
                    state?.status === 'waiting' || state?.status === 'called';
                if (
                    !ignore &&
                    state &&
                    active &&
                    state.business.slug === slug
                ) {
                    setTicket({ id: state.id, code: state.code });
                }
            })
            .catch(() => {});

        return () => {
            ignore = true;
        };
    }, [slug, fromServer]);

    return ticket;
}
