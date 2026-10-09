import { Head, Link, usePage } from '@inertiajs/react';
import {
    BarChart3,
    BellRing,
    MessageSquareText,
    QrCode,
    Smartphone,
    Tv,
} from 'lucide-react';
import PricingTable, { everyPlanIncludes } from '@/components/pricing-table';
import SiteHeader, { SiteFooter } from '@/components/site-header';
import TryDemoButton from '@/components/try-demo-button';
import { Button } from '@/components/ui/button';
import { pricing, register } from '@/routes';
import type { PlanOffer, TrialOffer } from '@/types';

const features = [
    {
        icon: QrCode,
        title: 'Scan to join',
        text: 'Customers scan a QR code at your door, pick a service and get a number like A-024. No app to download.',
    },
    {
        icon: Smartphone,
        title: 'Their place in line, live',
        text: 'Their phone shows how many are ahead and about how long to wait, so they can step out and come back.',
    },
    {
        icon: MessageSquareText,
        title: 'A text when it’s almost their turn',
        needsTexts: true,
        text: 'An SMS when they’re near the front, and another when it’s their turn (Basic and Pro plans).',
    },
    {
        icon: BellRing,
        title: 'Call next from your phone',
        text: 'One tap calls the next customer. Get an alert whenever someone joins.',
    },
    {
        icon: Tv,
        title: 'Now serving, on your TV',
        text: 'A big-screen display of who’s being served, who’s next, and the QR code to join.',
    },
    {
        icon: BarChart3,
        title: 'Know your busy hours',
        text: 'Customers served, average wait, no-shows and your busiest hours, by day.',
    },
];

const customerSteps = [
    {
        image: '/images/landing/phone-join.webp',
        alt: 'The join page: choose a service and enter your name',
        title: 'Scan and join',
    },
    {
        image: '/images/landing/phone-ticket.webp',
        alt: 'A ticket showing the place in line and the estimated wait',
        title: 'Watch their place in line',
    },
    {
        image: '/images/landing/phone-called.webp',
        alt: "The ticket page saying it's your turn, please proceed to Chair 3",
        title: 'Get called when it’s their turn',
    },
];

export default function Welcome({
    plans,
    trial,
    online,
}: {
    plans: PlanOffer[];
    trial: TrialOffer;
    /** Owners pay by QR Ph in the app (else by sending GCash or Maya). */
    online: boolean;
}) {
    const { auth, textsAvailable } = usePage().props;

    return (
        <>
            <Head title="Virtual queue for Philippine businesses" />

            <div className="min-h-svh bg-background text-foreground">
                <SiteHeader />

                <main className="mx-auto grid max-w-6xl gap-20 px-4 pt-10 pb-20 md:pt-16">
                    <section className="grid items-center gap-14 lg:grid-cols-[1fr_1.15fr]">
                        <div className="grid gap-6">
                            <h1 className="text-4xl leading-tight font-bold tracking-tight text-balance md:text-5xl">
                                No more crowded waiting areas.
                            </h1>
                            <p className="text-lg text-muted-foreground">
                                PilaPH is a virtual queue. Customers scan a QR
                                code, get their number on their phone, and come
                                back when it&apos;s their turn. You call the
                                next one with a tap.
                            </p>
                            {!auth.user && (
                                <div className="flex flex-wrap gap-3">
                                    <Button asChild size="lg">
                                        <Link href={register()}>
                                            Set up your shop — free
                                        </Link>
                                    </Button>
                                    <TryDemoButton />
                                </div>
                            )}
                        </div>

                        <HeroShot />
                    </section>

                    <section className="grid gap-8">
                        <div className="grid max-w-2xl gap-2">
                            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
                                Your customers wait anywhere they like
                            </h2>
                            <p className="text-muted-foreground">
                                No app and no account: just the phone camera.
                            </p>
                        </div>
                        <div className="grid grid-cols-3 gap-3 sm:gap-8">
                            {customerSteps.map((step, index) => (
                                <figure
                                    key={step.image}
                                    className="grid content-start justify-items-center gap-3 text-center"
                                >
                                    <PhoneFrame
                                        src={step.image}
                                        alt={step.alt}
                                        className="w-full max-w-[220px]"
                                        lazy
                                    />
                                    <figcaption className="grid gap-0.5">
                                        <span className="text-xs font-semibold text-emerald-600 sm:text-sm dark:text-emerald-400">
                                            Step {index + 1}
                                        </span>
                                        <span className="text-sm font-medium sm:text-base">
                                            {step.title}
                                        </span>
                                    </figcaption>
                                </figure>
                            ))}
                        </div>
                    </section>

                    <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                        {features
                            .filter(
                                (feature) =>
                                    textsAvailable ||
                                    !('needsTexts' in feature),
                            )
                            .map((feature) => (
                                <div
                                    key={feature.title}
                                    className="grid content-start gap-2 rounded-xl border p-5"
                                >
                                    <feature.icon className="size-5 text-emerald-600 dark:text-emerald-400" />
                                    <h2 className="font-semibold">
                                        {feature.title}
                                    </h2>
                                    <p className="text-sm text-muted-foreground">
                                        {feature.text}
                                    </p>
                                </div>
                            ))}
                    </section>

                    <section className="grid items-center gap-10 lg:grid-cols-[1.2fr_1fr]">
                        <TvFrame />
                        <div className="grid gap-3">
                            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
                                Put the queue on your TV
                            </h2>
                            <p className="text-muted-foreground">
                                Everyone waiting sees who&apos;s being served
                                and who&apos;s next. A new number lights up with
                                a chime, and new customers scan the QR code
                                right on the screen.
                            </p>
                        </div>
                    </section>

                    <section id="pricing" className="grid gap-6">
                        <div className="flex flex-wrap items-end justify-between gap-3">
                            <div className="grid max-w-2xl gap-2">
                                <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
                                    Start free, upgrade when you&apos;re busy
                                </h2>
                                <p className="text-muted-foreground">
                                    Every new shop gets {trial.days} days of{' '}
                                    {trial.plan} free (with {trial.texts}{' '}
                                    texts), no card needed. After that, stay on
                                    Free or pick a plan.
                                </p>
                            </div>
                            <Button asChild variant="outline">
                                <Link href={pricing()}>Pricing details</Link>
                            </Button>
                        </div>
                        <PricingTable plans={plans} />
                        <p className="text-sm text-muted-foreground">
                            {everyPlanIncludes}{' '}
                            {online
                                ? 'Pay by QR Ph with GCash, Maya or your bank app.'
                                : 'Pay monthly by GCash or Maya.'}
                        </p>
                    </section>

                    <section className="grid gap-6 rounded-2xl bg-slate-900 p-6 text-slate-100 md:grid-cols-3 md:p-10">
                        <h2 className="text-2xl font-semibold md:col-span-3">
                            Ready in minutes
                        </h2>
                        {[
                            'Sign up and name your shop.',
                            'Add your services and counters.',
                            'Print your QR poster or open the TV display.',
                        ].map((step, index) => (
                            <div key={step} className="grid gap-1">
                                <span className="text-sm font-semibold text-emerald-400">
                                    Step {index + 1}
                                </span>
                                <p>{step}</p>
                            </div>
                        ))}
                    </section>
                </main>

                <SiteFooter />
            </div>
        </>
    );
}

/** The owner's dashboard in a browser window, with a customer's phone in front. */
function HeroShot() {
    return (
        <div className="relative pb-14 pl-10 sm:pb-20 sm:pl-16">
            <div className="overflow-hidden rounded-xl border bg-background shadow-2xl shadow-slate-900/15">
                <div className="flex items-center gap-1.5 border-b bg-muted/60 px-3 py-2">
                    <span className="size-2.5 rounded-full bg-red-400" />
                    <span className="size-2.5 rounded-full bg-amber-400" />
                    <span className="size-2.5 rounded-full bg-emerald-400" />
                </div>
                <img
                    src="/images/landing/dashboard.webp"
                    alt="The owner dashboard: who's being served, Call next, and the waiting list"
                    width={1600}
                    height={1000}
                    fetchPriority="high"
                    className="aspect-[16/10] w-full object-cover object-top"
                />
            </div>
            <PhoneFrame
                src="/images/landing/phone-ticket.webp"
                alt="A customer's ticket with their place in line"
                className="absolute bottom-0 left-0 w-[22%] min-w-[90px]"
            />
        </div>
    );
}

function PhoneFrame({
    src,
    alt,
    className = '',
    lazy = false,
}: {
    src: string;
    alt: string;
    className?: string;
    lazy?: boolean;
}) {
    return (
        <div
            className={`overflow-hidden rounded-[1.6rem] border-[5px] border-slate-900 bg-white shadow-xl shadow-slate-900/20 dark:border-slate-700 ${className}`}
        >
            <img
                src={src}
                alt={alt}
                width={520}
                height={1126}
                loading={lazy ? 'lazy' : undefined}
                decoding="async"
                // The bottom of these screens is empty: show the top.
                className="aspect-[9/16] w-full object-cover object-top"
            />
        </div>
    );
}

function TvFrame() {
    return (
        <div className="grid justify-items-center">
            <div className="w-full rounded-xl bg-slate-900 p-2 shadow-2xl shadow-slate-900/25 sm:p-3">
                <img
                    src="/images/landing/tv.webp"
                    alt="The TV display: now serving, who's next, and a QR code to join"
                    width={1440}
                    height={810}
                    loading="lazy"
                    decoding="async"
                    className="aspect-video w-full rounded-md"
                />
            </div>
            <div className="h-6 w-16 bg-slate-800" />
            <div className="h-1.5 w-40 rounded-full bg-slate-800" />
        </div>
    );
}
