import { Head, Link } from '@inertiajs/react';
import { Download, Share } from 'lucide-react';
import Heading from '@/components/heading';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { usePushAlerts } from '@/hooks/use-push-alerts';
import type { PushAlertStatus } from '@/hooks/use-push-alerts';
import { useInstallPrompt } from '@/lib/install-prompt';
import { isIos, isStandalone } from '@/lib/push';
import { edit } from '@/routes/alerts';
import { edit as shopSettings } from '@/routes/business';

type Props = {
    /** Devices with alerts on, across the owner's account. */
    deviceCount: number;
    hasMaxWaiting: boolean;
    hasCutoff: boolean;
};

const statusText: Record<PushAlertStatus, string> = {
    checking: 'Checking this device…',
    on: 'Alerts are on for this device.',
    off: 'Alerts are off for this device.',
    denied: 'Alerts are blocked for this site. Allow notifications in your browser settings, then reload this page.',
    'needs-home-screen':
        'On iPhone, alerts work only from the Home Screen app (iOS 16.4 or later): tap Share, then Add to Home Screen, and open PilaPH from there.',
    insecure:
        "Alerts need a secure (https) connection. They'll work on your live site, and on this computer at localhost.",
    unsupported:
        "This browser can't show alerts. Try Chrome, Edge or Firefox, or Safari on iPhone with iOS 16.4 or later.",
};

export default function Alerts({
    deviceCount,
    hasMaxWaiting,
    hasCutoff,
}: Props) {
    const alerts = usePushAlerts();
    const install = useInstallPrompt();
    const showIosInstall =
        typeof window !== 'undefined' && isIos() && !isStandalone();

    return (
        <>
            <Head title="Alerts" />

            <h1 className="sr-only">Alerts</h1>

            <div className="space-y-6">
                <Heading
                    variant="small"
                    title="Alerts on this device"
                    description="A notification on this phone or computer, even when PilaPH is closed."
                />

                <p className="flex items-center gap-2 text-sm">
                    {alerts.status === 'checking' && <Spinner />}
                    {statusText[alerts.status]}
                </p>

                <div className="flex flex-wrap gap-2">
                    {alerts.status === 'off' && (
                        <Button
                            onClick={() => void alerts.turnOn()}
                            disabled={alerts.busy}
                        >
                            Turn on alerts
                        </Button>
                    )}
                    {alerts.status === 'on' && (
                        <>
                            <Button variant="outline" onClick={alerts.sendTest}>
                                Send a test alert
                            </Button>
                            <Button
                                variant="ghost"
                                onClick={() => void alerts.turnOff()}
                                disabled={alerts.busy}
                            >
                                Turn off
                            </Button>
                        </>
                    )}
                </div>

                {deviceCount > 0 && (
                    <p className="text-sm text-muted-foreground">
                        Alerts are on for {deviceCount}{' '}
                        {deviceCount === 1 ? 'device' : 'devices'} on your
                        account.
                    </p>
                )}
            </div>

            {(install.available || showIosInstall) && (
                <div className="space-y-4">
                    <Heading
                        variant="small"
                        title="Install the app"
                        description="Opens straight to your queue, like any other app."
                    />
                    {install.available ? (
                        <Button
                            variant="outline"
                            onClick={() => void install.install()}
                        >
                            <Download />
                            Install PilaPH
                        </Button>
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            Tap <Share className="inline size-3.5" /> Share,
                            then <strong>Add to Home Screen</strong>.
                        </p>
                    )}
                </div>
            )}

            <div className="space-y-4">
                <Heading variant="small" title="What you'll get" />
                <ul className="grid gap-3 text-sm">
                    <li>
                        <p className="font-medium">A customer joined</p>
                        <p className="text-muted-foreground">
                            &ldquo;A-012 joined: Ana, Haircut. 5 waiting.&rdquo;
                        </p>
                    </li>
                    <li>
                        <p className="font-medium">Queue almost full</p>
                        <p className="text-muted-foreground">
                            A few spots before your maximum.{' '}
                            {!hasMaxWaiting && (
                                <>
                                    Set a maximum in{' '}
                                    <Link
                                        href={shopSettings()}
                                        className="underline"
                                    >
                                        Shop settings
                                    </Link>{' '}
                                    to get this.
                                </>
                            )}
                        </p>
                    </li>
                    <li>
                        <p className="font-medium">Join cutoff in 30 minutes</p>
                        <p className="text-muted-foreground">
                            With how many are still waiting.{' '}
                            {!hasCutoff && (
                                <>
                                    Set a cutoff time in{' '}
                                    <Link
                                        href={shopSettings()}
                                        className="underline"
                                    >
                                        Shop settings
                                    </Link>{' '}
                                    to get this.
                                </>
                            )}
                        </p>
                    </li>
                </ul>
            </div>
        </>
    );
}

Alerts.layout = {
    breadcrumbs: [
        {
            title: 'Alerts',
            href: edit(),
        },
    ],
};
