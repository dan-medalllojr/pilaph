import { Head, Link } from '@inertiajs/react';
import { ExternalLink, Printer, TriangleAlert } from 'lucide-react';
import Heading from '@/components/heading';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { edit as businessSettings } from '@/routes/business';
import { edit as displaySettings } from '@/routes/display';
import { show } from '@/routes/qr';
import type { JoinQrCode } from '@/types';

type Props = {
    business: { name: string; rotate_qr_daily: boolean };
    join: JoinQrCode;
    /** False on paid plans: no PilaPH name on the poster. */
    branding: boolean;
};

export default function QrPoster({ business, join, branding }: Props) {
    return (
        <>
            <Head title="QR poster" />

            <div className="flex w-full max-w-2xl flex-col gap-6 p-4">
                <Heading
                    title="QR poster"
                    description="Print this and put it where customers can see it. They scan it to join the queue."
                />

                {business.rotate_qr_daily && (
                    <Alert>
                        <TriangleAlert />
                        <AlertTitle>
                            Your QR code changes every night
                        </AlertTitle>
                        <AlertDescription>
                            <p>
                                A printed poster stops working tomorrow. Show
                                the QR code on your{' '}
                                <Link
                                    href={displaySettings()}
                                    className="underline"
                                >
                                    TV display
                                </Link>{' '}
                                instead, or turn off the nightly change in{' '}
                                <Link
                                    href={businessSettings()}
                                    className="underline"
                                >
                                    Shop settings
                                </Link>
                                .
                            </p>
                        </AlertDescription>
                    </Alert>
                )}

                <div className="flex flex-wrap gap-2">
                    <Button onClick={() => window.print()}>
                        <Printer />
                        Print poster
                    </Button>
                    <Button variant="outline" asChild>
                        <a href={join.url} target="_blank" rel="noreferrer">
                            <ExternalLink />
                            Try the link
                        </a>
                    </Button>
                </div>

                <div
                    id="qr-poster"
                    className="mx-auto flex aspect-[1/1.414] w-full max-w-md flex-col items-center justify-between rounded-xl border bg-white p-8 text-center text-neutral-900 shadow-sm"
                >
                    <div className="grid gap-1">
                        <p className="text-xs font-semibold tracking-[0.25em] text-neutral-500 uppercase">
                            Skip the line
                        </p>
                        <h2 className="text-3xl font-bold text-balance">
                            {business.name}
                        </h2>
                    </div>

                    <img
                        src={join.image}
                        alt="QR code to join the queue"
                        className="aspect-square w-3/4"
                    />

                    <div className="grid gap-3">
                        <p className="text-2xl font-semibold">
                            Scan to join the queue
                        </p>
                        <ol className="grid gap-1 text-sm text-neutral-600">
                            <li>1. Scan this with your phone camera</li>
                            <li>2. Pick a service and enter your name</li>
                            <li>3. Watch your place in line on your phone</li>
                        </ol>
                    </div>

                    {branding && (
                        <p className="text-xs text-neutral-400">PilaPH</p>
                    )}
                </div>
            </div>
        </>
    );
}

QrPoster.layout = {
    breadcrumbs: [
        {
            title: 'QR poster',
            href: show(),
        },
    ],
};
