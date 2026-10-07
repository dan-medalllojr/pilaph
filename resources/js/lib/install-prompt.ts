import { useSyncExternalStore } from 'react';

/**
 * Chrome, Edge and Samsung Internet offer to install the app with a
 * `beforeinstallprompt` event. It fires once, soon after the page loads,
 * so this module is imported early (app.tsx) and keeps it for our own
 * "Install app" button. Safari has no such event: iPhone users use
 * Share > Add to Home Screen.
 */
type InstallPromptEvent = Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

if (typeof window !== 'undefined') {
    window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        deferred = event as InstallPromptEvent;
        notify();
    });
    window.addEventListener('appinstalled', () => {
        deferred = null;
        notify();
    });
}

const subscribe = (listener: () => void) => {
    listeners.add(listener);

    return () => listeners.delete(listener);
};

export function useInstallPrompt(): {
    available: boolean;
    install: () => Promise<void>;
} {
    const available = useSyncExternalStore(
        subscribe,
        () => deferred !== null,
        () => false,
    );

    const install = async () => {
        const event = deferred;

        if (!event) {
            return;
        }

        await event.prompt();
        await event.userChoice;
        deferred = null;
        notify();
    };

    return { available, install };
}
