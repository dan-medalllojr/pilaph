import { router, usePage } from '@inertiajs/react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
    contentEncoding,
    currentSubscription,
    pushSupport,
    subscribe,
} from '@/lib/push';
import type { PushSupport } from '@/lib/push';
import { destroy, store, test } from '@/routes/push-subscriptions';

export type PushAlertStatus =
    | 'checking'
    | Exclude<PushSupport, 'supported'>
    | 'denied'
    | 'off'
    | 'on';

/**
 * Whether this device gets the owner's push alerts, and turning them on or off.
 */
export function usePushAlerts() {
    const publicKey = usePage().props.webPushKey;
    const [status, setStatus] = useState<PushAlertStatus>('checking');
    const [busy, setBusy] = useState(false);

    const check = useCallback(async () => {
        const support = pushSupport();

        if (!publicKey) {
            setStatus('unsupported');
        } else if (support !== 'supported') {
            setStatus(support);
        } else if (Notification.permission === 'denied') {
            setStatus('denied');
        } else {
            setStatus((await currentSubscription()) ? 'on' : 'off');
        }
    }, [publicKey]);

    useEffect(() => {
        void check();
    }, [check]);

    const turnOn = async () => {
        if (!publicKey) {
            return;
        }

        setBusy(true);

        try {
            // Must come straight from the tap (iPhone requires it).
            const permission = await Notification.requestPermission();

            if (permission !== 'granted') {
                setStatus(permission === 'denied' ? 'denied' : 'off');
                setBusy(false);

                return;
            }

            const subscription = await subscribe(publicKey);
            const { endpoint, keys } = subscription.toJSON();

            router.post(
                store.url(),
                { endpoint, keys, content_encoding: contentEncoding() },
                {
                    preserveScroll: true,
                    onSuccess: () => setStatus('on'),
                    onError: () => {
                        void subscription.unsubscribe();
                        setStatus('off');
                    },
                    onFinish: () => setBusy(false),
                },
            );
        } catch {
            toast.error("Couldn't turn on alerts on this device.");
            setBusy(false);
        }
    };

    const turnOff = async () => {
        setBusy(true);
        const subscription = await currentSubscription();

        if (!subscription) {
            setStatus('off');
            setBusy(false);

            return;
        }

        const { endpoint } = subscription;
        await subscription.unsubscribe();

        router.delete(destroy.url(), {
            data: { endpoint },
            preserveScroll: true,
            onFinish: () => {
                setStatus('off');
                setBusy(false);
            },
        });
    };

    const sendTest = () =>
        router.post(test.url(), {}, { preserveScroll: true });

    return { status, busy, turnOn, turnOff, sendTest };
}
