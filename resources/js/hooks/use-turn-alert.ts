import { useCallback, useEffect, useState } from 'react';
import { playTurnAlert, soundReady, unlockSound } from '@/lib/chime';

function vibrate(pattern: number | number[]): void {
    // Android browsers; iPhones have no vibration for web pages.
    if ('vibrate' in navigator) {
        navigator.vibrate(pattern);
    }
}

/**
 * Sound (and vibration) on the customer's phone when they're called.
 * `ready` is false until the page has been tapped (browsers' rule).
 */
export function useTurnAlert() {
    const [ready, setReady] = useState(false);

    // Already unlocked by the tap on "Get my ticket"?
    useEffect(() => {
        setReady(soundReady());
    }, []);

    const enable = useCallback(async () => {
        const unlocked = await unlockSound();
        setReady(unlocked);

        if (unlocked) {
            // A sample, so they know what to listen for.
            playTurnAlert();
            vibrate(200);
        }
    }, []);

    const alert = useCallback(() => {
        playTurnAlert();
        vibrate([400, 150, 400, 150, 400]);
    }, []);

    return { ready, enable, alert };
}
