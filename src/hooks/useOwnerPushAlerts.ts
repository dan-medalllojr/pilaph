import { useCallback, useEffect, useRef, useState } from 'react';

export type OwnerPushStatus =
  | 'checking'
  // No Push API here, e.g. iPhone Safari before "Add to Home Screen".
  | 'unsupported'
  // The server has no VAPID keys, so alerts can't be sent.
  | 'unavailable'
  // Notifications are denied in the browser's site settings.
  | 'blocked'
  | 'off'
  | 'on';

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function isPushSupported(): boolean {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

// The active service worker, or null if none registers within 5 seconds.
function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
  ]);
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false;
  const bytes = new Uint8Array(a);
  return bytes.length === b.length && bytes.every((v, i) => v === b[i]);
}

export function useOwnerPushAlerts(token: string | null) {
  const [status, setStatus] = useState<OwnerPushStatus>('checking');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const publicKeyRef = useRef<string | null>(null);
  const checkedRef = useRef(false);

  const api = useCallback(
    (method: string, path: string, body?: unknown) =>
      fetch(path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    [token]
  );

  // On load: work out what this device supports, and re-save an existing
  // subscription so the server stays in sync (e.g. after a database reset).
  useEffect(() => {
    if (!token || checkedRef.current) return;
    checkedRef.current = true;
    (async () => {
      if (!isPushSupported()) return setStatus('unsupported');
      const keyRes = await api('GET', '/api/dashboard/push/public-key');
      if (!keyRes.ok) return setStatus('unavailable');
      const publicKey: string = (await keyRes.json()).publicKey;
      publicKeyRef.current = publicKey;
      if (Notification.permission === 'denied') return setStatus('blocked');

      const reg = await getRegistration();
      if (!reg) return setStatus('unsupported');
      const sub = await reg.pushManager.getSubscription();
      if (!sub || Notification.permission !== 'granted') return setStatus('off');

      // A subscription made with old VAPID keys can no longer receive alerts.
      if (!sameKey(sub.options.applicationServerKey, urlBase64ToUint8Array(publicKey))) {
        await sub.unsubscribe();
        return setStatus('off');
      }
      const res = await api('POST', '/api/dashboard/push-subscriptions', sub.toJSON());
      setStatus(res.ok ? 'on' : 'off');
    })().catch(() => setStatus('off'));
  }, [token, api]);

  const enable = useCallback(async () => {
    if (busy || !publicKeyRef.current) return;
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus(permission === 'denied' ? 'blocked' : 'off');
        return;
      }
      const reg = await getRegistration();
      if (!reg) {
        setStatus('unsupported');
        return;
      }
      const existing = await reg.pushManager.getSubscription();
      if (existing) await existing.unsubscribe();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKeyRef.current),
      });
      const res = await api('POST', '/api/dashboard/push-subscriptions', sub.toJSON());
      if (!res.ok) {
        await sub.unsubscribe();
        throw new Error('Saving the subscription failed.');
      }
      setStatus('on');
    } catch {
      setError('Could not turn on alerts. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [busy, api]);

  const disable = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const reg = await getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await api('DELETE', '/api/dashboard/push-subscriptions', {
          endpoint: sub.endpoint,
        });
        await sub.unsubscribe();
      }
      setStatus('off');
    } catch {
      setError('Could not turn off alerts. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [busy, api]);

  return { status, busy, error, enable, disable };
}
