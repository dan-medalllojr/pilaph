/**
 * Owner push alerts, browser side: the service worker (public/sw.js) and
 * the push subscription the server sends alerts to.
 */

export type PushSupport =
    | 'supported'
    /** iPhone/iPad: only from the Home Screen app, on iOS 16.4 or later. */
    | 'needs-home-screen'
    /** Push needs https (or localhost), e.g. not http://192.168.x.x. */
    | 'insecure'
    | 'unsupported';

export function isIos(): boolean {
    return (
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        // iPadOS reports itself as a Mac.
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );
}

export function isStandalone(): boolean {
    return (
        window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as { standalone?: boolean }).standalone === true
    );
}

export function pushSupport(): PushSupport {
    if (!window.isSecureContext) {
        return 'insecure';
    }

    if (
        'serviceWorker' in navigator &&
        'PushManager' in window &&
        'Notification' in window
    ) {
        return 'supported';
    }

    return isIos() && !isStandalone() ? 'needs-home-screen' : 'unsupported';
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) {
        return null;
    }

    try {
        return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    } catch {
        return null;
    }
}

export async function currentSubscription(): Promise<PushSubscription | null> {
    const registration = await registerServiceWorker();

    return registration ? registration.pushManager.getSubscription() : null;
}

export async function subscribe(publicKey: string): Promise<PushSubscription> {
    const registration = await registerServiceWorker();

    if (!registration) {
        throw new Error('Service worker unavailable');
    }

    await navigator.serviceWorker.ready;

    return registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(publicKey),
    });
}

/** The encoding the server should use; newer browsers prefer aes128gcm. */
export function contentEncoding(): 'aes128gcm' | 'aesgcm' {
    const supported = (
        PushManager as unknown as { supportedContentEncodings?: string[] }
    ).supportedContentEncodings;

    return supported?.includes('aes128gcm') ? 'aes128gcm' : 'aesgcm';
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
    const base64 = (value + '='.repeat((4 - (value.length % 4)) % 4))
        .replace(/-/g, '+')
        .replace(/_/g, '/');
    const raw = window.atob(base64);
    const bytes = new Uint8Array(new ArrayBuffer(raw.length));

    for (let i = 0; i < raw.length; i++) {
        bytes[i] = raw.charCodeAt(i);
    }

    return bytes;
}
