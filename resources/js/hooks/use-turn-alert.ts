import { useCallback, useEffect, useState } from 'react';
import { enableSound, playTurnAlert, soundReady } from '@/lib/chime';

function vibrate(pattern: number | number[]): void {
    // Android browsers; iPhones have no vibration for web pages.
    if ('vibrate' in navigator) {
        navigator.vibrate(pattern);
    }
}

/**
 * - `on`: the page may play sound (it was tapped).
 * - `off`: not yet; browsers only allow sound after a tap.
 * - `blocked`: the browser refused even after a tap (site sound blocked).
 */
export type SoundStatus = 'on' | 'off' | 'blocked';

/**
 * Sound (and vibration) on the customer's phone when they're called.
 */
export function useTurnAlert() {
    const [status, setStatus] = useState<SoundStatus>('off');

    // Already unlocked by the tap on "Get my ticket"?
    useEffect(() => {
        if (soundReady()) {
            setStatus('on');
        }
    }, []);

    // From a tap: plays the chime once as a sample.
    const enable = useCallback(async () => {
        const unlocked = await enableSound();
        setStatus(unlocked ? 'on' : 'blocked');

        if (unlocked) {
            vibrate(200);
        }
    }, []);

    const alert = useCallback(() => {
        playTurnAlert();
        vibrate([400, 150, 400, 150, 400]);
    }, []);

    return { status, enable, alert };
}
