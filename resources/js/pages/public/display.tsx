import { Head } from '@inertiajs/react';
import { Maximize, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import DemoShopNotice from '@/components/demo-shop-notice';
import { useLiveState, useNow } from '@/hooks/use-live-state';
import { playTones } from '@/lib/chime';
import type {
    DisplayState,
    JoinClosedReason,
    PublicTicketUpdate,
} from '@/types';

/** A screen left on all day also checks in now and then (e.g. the nightly QR change). */
const SAFETY_REFRESH_MS = 5 * 60_000;
/** How long a newly called number stays highlighted. */
const HIGHLIGHT_MS = 12_000;
const SOUND_KEY = 'pilaph.display.sound';

const closedMessages: Record<JoinClosedReason, [string, string]> = {
    paused: ['The queue is paused', 'Please check back in a little while.'],
    after_cutoff: [
        "We're not taking new customers today",
        'Thank you, and see you next time!',
    ],
    full: [
        'The queue is full right now',
        'Please check back in a little while.',
    ],
};

const timeFormat = new Intl.DateTimeFormat('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
});

type Props = {
    display: DisplayState;
    stateUrl: string;
    /** The public demo's sample shop, which anyone can edit. */
    isDemo: boolean;
};

/**
 * The TV at the shop: who each counter is serving, who's next, and the QR
 * code to join. Refetches on every queue event: a public channel can be
 * written by anyone, so nothing from a message is shown without the server.
 */
export default function Display({ display: initial, stateUrl, isDemo }: Props) {
    const [gone, setGone] = useState(false);
    const [highlight, setHighlight] = useState<{
        counters: string[];
        at: number;
    } | null>(null);
    const announced = useRef<PublicTicketUpdate | null>(null);
    const sound = useChime();
    const playChime = sound.play;

    const { state, live } = useLiveState({
        initial,
        url: stateUrl,
        topics: (s) => [`queue:${s.business.id}`],
        refreshMs: SAFETY_REFRESH_MS,
        onGone: () => setGone(true),
        onEvent: ({ event, payload }, { refetch }) => {
            if (event === 'ticket.called') {
                // Checked against the refetched state before it's highlighted.
                announced.current =
                    (payload as { ticket?: PublicTicketUpdate } | null)
                        ?.ticket ?? null;
            }

            refetch();
        },
    });

    // Highlight counters with a new number, or a recalled one, and chime.
    const previous = useRef(state);
    useEffect(() => {
        const before = previous.current;
        previous.current = state;

        if (before === state) {
            return;
        }

        const called = state.counters
            .filter(
                (counter) =>
                    counter.code !== null &&
                    before.counters.find((c) => c.name === counter.name)
                        ?.code !== counter.code,
            )
            .map((counter) => counter.name);

        const recall = announced.current;
        announced.current = null;

        if (
            recall?.counter &&
            state.counters.some(
                (c) => c.name === recall.counter && c.code === recall.code,
            ) &&
            !called.includes(recall.counter)
        ) {
            called.push(recall.counter);
        }

        if (called.length > 0) {
            setHighlight({ counters: called, at: Date.now() });
            playChime();
        }
    }, [state, playChime]);

    useEffect(() => {
        if (!highlight) {
            return;
        }

        const timer = window.setTimeout(() => setHighlight(null), HIGHLIGHT_MS);

        return () => window.clearTimeout(timer);
    }, [highlight]);

    useWakeLock();

    if (gone) {
        return (
            <Screen title="TV display">
                <div className="grid flex-1 place-content-center gap-[2vmin] text-center">
                    <p className="text-[5vmin] font-semibold">
                        This TV link no longer works
                    </p>
                    <p className="text-[3vmin] text-white/60">
                        Open the new link from TV display in your PilaPH
                        dashboard.
                    </p>
                </div>
            </Screen>
        );
    }

    const { business, counters, next_codes, waiting_count, join } = state;
    const codeSize =
        counters.length <= 2
            ? 'text-[16vmin]'
            : counters.length <= 4
              ? 'text-[11vmin]'
              : counters.length <= 6
                ? 'text-[8vmin]'
                : 'text-[6vmin]';
    const columns =
        counters.length <= 1
            ? 'grid-cols-1'
            : counters.length <= 4
              ? 'grid-cols-2'
              : 'grid-cols-3';

    return (
        <Screen title={`${business.name} – Now serving`}>
            <header className="flex items-center justify-between gap-[2vmin]">
                <h1 className="truncate text-[5vmin] font-semibold">
                    {business.name}
                </h1>
                <div className="flex shrink-0 items-center gap-[2vmin] text-[3vmin] text-white/70">
                    <Clock />
                    <SoundButton sound={sound} />
                    <FullscreenButton />
                </div>
            </header>

            {isDemo && <DemoShopNotice tv />}

            <main className="grid min-h-0 flex-1 gap-[2.5vmin] portrait:grid-rows-[1fr_auto] landscape:grid-cols-[1fr_minmax(0,32%)]">
                <section className="flex min-h-0 flex-col gap-[2vmin]">
                    <Label>Now serving</Label>
                    {counters.length === 0 ? (
                        <div className="grid flex-1 place-content-center rounded-[2vmin] bg-white/5 text-[3.5vmin] text-white/60">
                            No counters set up yet
                        </div>
                    ) : (
                        <div
                            className={`grid flex-1 auto-rows-fr gap-[2vmin] ${columns}`}
                        >
                            {counters.map((counter) => {
                                const isNew =
                                    highlight?.counters.includes(
                                        counter.name,
                                    ) ?? false;

                                return (
                                    <div
                                        key={`${counter.name}-${isNew ? highlight?.at : ''}`}
                                        className={`flex min-h-0 flex-col items-center justify-center rounded-[2vmin] px-[2vmin] text-center transition-colors ${
                                            isNew
                                                ? 'animate-[called_1.2s_ease-in-out_3] bg-amber-400 text-neutral-950'
                                                : 'bg-white/8'
                                        }`}
                                    >
                                        <p
                                            className={`max-w-full truncate text-[3.5vmin] font-medium ${isNew ? 'text-neutral-950/80' : 'text-white/70'}`}
                                        >
                                            {counter.name}
                                        </p>
                                        <p
                                            className={`font-bold tracking-tight tabular-nums ${codeSize} ${counter.code ? '' : 'text-white/25'}`}
                                        >
                                            {counter.code ?? '—'}
                                        </p>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>

                <aside className="grid min-h-0 gap-[2.5vmin] portrait:grid-cols-2 landscape:grid-rows-[auto_1fr]">
                    <JoinPanel
                        join={join}
                        closedReason={business.closed_reason}
                    />

                    <section className="flex min-h-0 flex-col gap-[1.5vmin] overflow-hidden rounded-[2vmin] bg-white/5 p-[2.5vmin]">
                        <Label>Next</Label>
                        {next_codes.length === 0 ? (
                            <p className="text-[3vmin] text-white/50">
                                No one waiting
                            </p>
                        ) : (
                            <ol className="grid grid-cols-3 gap-x-[2.5vmin] gap-y-[1vmin] text-[4.4vmin] font-semibold tabular-nums">
                                {next_codes.map((code) => (
                                    <li key={code}>{code}</li>
                                ))}
                            </ol>
                        )}
                        {waiting_count > 0 && (
                            <p className="mt-auto text-[2.6vmin] text-white/60">
                                {waiting_count} waiting
                            </p>
                        )}
                    </section>
                </aside>
            </main>

            <footer className="flex items-center justify-between text-[2vmin] text-white/40">
                <span className="inline-flex items-center gap-[1vmin]">
                    <span
                        className={`size-[1vmin] rounded-full ${live ? 'bg-emerald-400' : 'bg-white/40'}`}
                    />
                    {live ? 'Live' : 'Reconnecting… checking every 20 s'}
                </span>
                <span>PilaPH</span>
            </footer>
        </Screen>
    );
}

function Screen({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    return (
        <>
            <Head title={title}>
                <meta name="robots" content="noindex" />
            </Head>
            <div className="dark flex h-dvh flex-col gap-[2.5vmin] overflow-hidden bg-neutral-950 p-[3vmin] text-white">
                {children}
            </div>
        </>
    );
}

function Label({ children }: { children: React.ReactNode }) {
    return (
        <h2 className="text-[2.6vmin] font-semibold tracking-[0.2em] text-white/50 uppercase">
            {children}
        </h2>
    );
}

function JoinPanel({
    join,
    closedReason,
}: {
    join: DisplayState['join'];
    closedReason: JoinClosedReason | null;
}) {
    if (!join) {
        const [title, detail] = closedMessages[closedReason ?? 'paused'];

        return (
            <section className="grid content-center gap-[1.5vmin] rounded-[2vmin] bg-white/5 p-[3vmin] text-center">
                <p className="text-[3.6vmin] font-semibold">{title}</p>
                <p className="text-[2.6vmin] text-white/60">{detail}</p>
            </section>
        );
    }

    return (
        <section className="grid justify-items-center gap-[1.5vmin] rounded-[2vmin] bg-white p-[2.5vmin] text-center text-neutral-950">
            <img
                src={join.image}
                alt="QR code to join the queue"
                className="aspect-square w-full max-w-[28vmin]"
            />
            <p className="text-[3.2vmin] leading-tight font-semibold">
                Scan to join the queue
            </p>
        </section>
    );
}

function Clock() {
    const now = useNow(10_000);

    // The server's render may be a minute off from the TV's clock.
    return (
        <span className="tabular-nums" suppressHydrationWarning>
            {timeFormat.format(now)}
        </span>
    );
}

function FullscreenButton() {
    // Hidden until the browser says full screen is possible (and not active).
    const [available, setAvailable] = useState(false);

    useEffect(() => {
        const update = () =>
            setAvailable(
                document.fullscreenEnabled &&
                    document.fullscreenElement === null,
            );
        update();
        document.addEventListener('fullscreenchange', update);

        return () => document.removeEventListener('fullscreenchange', update);
    }, []);

    if (!available) {
        return null;
    }

    return (
        <button
            type="button"
            onClick={() => void document.documentElement.requestFullscreen()}
            className="inline-flex items-center gap-[1vmin] rounded-full bg-white/10 px-[2vmin] py-[1vmin] text-[2.2vmin] hover:bg-white/20"
        >
            <Maximize className="size-[2.6vmin]" />
            Full screen
        </button>
    );
}

type Chime = {
    enabled: boolean;
    /** Browsers only allow sound after someone taps the page. */
    blocked: boolean;
    toggle: () => void;
    play: () => void;
};

function SoundButton({ sound }: { sound: Chime }) {
    const Icon = sound.enabled && !sound.blocked ? Volume2 : VolumeX;

    return (
        <button
            type="button"
            onClick={sound.toggle}
            className="inline-flex items-center gap-[1vmin] rounded-full bg-white/10 px-[2vmin] py-[1vmin] text-[2.2vmin] hover:bg-white/20"
        >
            <Icon className="size-[2.6vmin]" />
            {sound.blocked
                ? 'Tap to turn sound on'
                : sound.enabled
                  ? 'Sound on'
                  : 'Sound off'}
        </button>
    );
}

/** A soft two-tone chime when a number is called, made in the browser. */
function useChime(): Chime {
    const [enabled, setEnabled] = useState(false);
    const [blocked, setBlocked] = useState(false);
    const context = useRef<AudioContext | null>(null);

    const ring = useCallback(() => {
        const ctx = context.current;

        if (!ctx || ctx.state !== 'running') {
            return;
        }

        playTones(ctx, [
            { frequency: 880, at: 0 },
            { frequency: 660, at: 0.3 },
        ]);
    }, []);

    // Remembered from last time on this screen (read after the first render,
    // which may happen on the server).
    useEffect(() => {
        try {
            setEnabled(window.localStorage.getItem(SOUND_KEY) === 'on');
        } catch {
            // Storage blocked: sound starts off.
        }
    }, []);

    // Sound was turned on before: try again; a tap may be needed first.
    useEffect(() => {
        if (!enabled) {
            return;
        }

        context.current ??= new AudioContext();

        if (context.current.state === 'running') {
            setBlocked(false);

            return;
        }

        setBlocked(true);
        const unlock = () =>
            void context.current
                ?.resume()
                .then(() => setBlocked(context.current?.state !== 'running'));
        document.addEventListener('pointerdown', unlock, { once: true });

        return () => document.removeEventListener('pointerdown', unlock);
    }, [enabled]);

    const toggle = useCallback(() => {
        const next = blocked ? true : !enabled;

        try {
            window.localStorage.setItem(SOUND_KEY, next ? 'on' : 'off');
        } catch {
            // Private mode: the choice lasts until the page is reloaded.
        }

        if (next) {
            context.current ??= new AudioContext();
            void context.current.resume().then(() => {
                setBlocked(false);
                ring();
            });
        }

        setEnabled(next);
    }, [blocked, enabled, ring]);

    const play = useCallback(() => {
        if (enabled) {
            ring();
        }
    }, [enabled, ring]);

    return { enabled, blocked: enabled && blocked, toggle, play };
}

/** Keeps a tablet or laptop used as the display from going to sleep. */
function useWakeLock() {
    useEffect(() => {
        let lock: WakeLockSentinel | null = null;
        let cancelled = false;

        const request = async () => {
            try {
                lock = (await navigator.wakeLock?.request('screen')) ?? null;
            } catch {
                // Not allowed here (e.g. battery saver): the screen may sleep.
            }

            if (cancelled) {
                void lock?.release();
            }
        };

        const onVisible = () => {
            if (!document.hidden) {
                void request();
            }
        };

        void request();
        document.addEventListener('visibilitychange', onVisible);

        return () => {
            cancelled = true;
            document.removeEventListener('visibilitychange', onVisible);
            void lock?.release();
        };
    }, []);
}
