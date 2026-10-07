import { Link } from '@inertiajs/react';
import { Bell, BellOff, Download, Share } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { usePushAlerts } from '@/hooks/use-push-alerts';
import { useInstallPrompt } from '@/lib/install-prompt';
import { edit as alertSettings } from '@/routes/alerts';

const DISMISSED_KEY = 'pilaph.alerts-banner-dismissed';

/**
 * On the dashboard until alerts are on for this device (or dismissed):
 * turn them on, or what to do first on iPhone or when blocked.
 */
export default function AlertsBanner() {
    const alerts = usePushAlerts();
    const install = useInstallPrompt();
    const [dismissed, setDismissed] = useState(true);

    useEffect(() => {
        try {
            setDismissed(window.localStorage.getItem(DISMISSED_KEY) === '1');
        } catch {
            setDismissed(false);
        }
    }, []);

    const dismiss = () => {
        try {
            window.localStorage.setItem(DISMISSED_KEY, '1');
        } catch {
            // Storage blocked: hidden until the page reloads.
        }

        setDismissed(true);
    };

    if (
        dismissed ||
        !['off', 'needs-home-screen', 'denied'].includes(alerts.status)
    ) {
        return null;
    }

    const Icon = alerts.status === 'denied' ? BellOff : Bell;

    return (
        <section className="flex flex-col gap-3 rounded-xl border bg-muted/40 p-4 sm:flex-row sm:items-center">
            <Icon className="size-5 shrink-0 text-muted-foreground" />
            <div className="grid flex-1 gap-0.5 text-sm">
                {alerts.status === 'off' && (
                    <>
                        <p className="font-medium">
                            Get an alert when a customer joins
                        </p>
                        <p className="text-muted-foreground">
                            On this phone or computer, even when PilaPH is
                            closed.
                        </p>
                    </>
                )}
                {alerts.status === 'needs-home-screen' && (
                    <>
                        <p className="font-medium">Get alerts on your iPhone</p>
                        <p className="text-muted-foreground">
                            Tap <Share className="inline size-3.5" /> Share,
                            then <strong>Add to Home Screen</strong>, and open
                            PilaPH from there. Needs iOS 16.4 or later.
                        </p>
                    </>
                )}
                {alerts.status === 'denied' && (
                    <>
                        <p className="font-medium">Alerts are blocked</p>
                        <p className="text-muted-foreground">
                            Allow notifications for this site in your browser
                            settings, then turn them on in{' '}
                            <Link href={alertSettings()} className="underline">
                                Alerts
                            </Link>
                            .
                        </p>
                    </>
                )}
            </div>
            <div className="flex flex-wrap gap-2">
                {alerts.status === 'off' && (
                    <Button
                        size="sm"
                        onClick={() => void alerts.turnOn()}
                        disabled={alerts.busy}
                    >
                        Turn on alerts
                    </Button>
                )}
                {install.available && (
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void install.install()}
                    >
                        <Download />
                        Install app
                    </Button>
                )}
                <Button size="sm" variant="ghost" onClick={dismiss}>
                    Not now
                </Button>
            </div>
        </section>
    );
}
