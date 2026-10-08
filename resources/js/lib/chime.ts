/**
 * Sounds made in the browser (no audio files).
 *
 * Browsers only let a page make sound after the person has tapped it, so
 * `unlockSound()` must run inside a tap. The unlocked sound then lasts while
 * the page stays open, including across page changes in the app (the tap on
 * "Get my ticket" also covers the ticket page).
 */
let context: AudioContext | null = null;

export type Tone = { frequency: number; at: number; length?: number };

/** Call from a tap. Resolves true once the page can make sound. */
export async function unlockSound(): Promise<boolean> {
    try {
        context ??= new AudioContext();

        // iPhones only unlock when a sound starts inside the tap: a silent one.
        const source = context.createBufferSource();
        source.buffer = context.createBuffer(1, 1, 22050);
        source.connect(context.destination);
        source.start(0);

        await context.resume();

        return context.state === 'running';
    } catch {
        return false;
    }
}

export function soundReady(): boolean {
    return context?.state === 'running';
}

export function playTones(
    ctx: AudioContext,
    tones: Tone[],
    volume = 0.5,
): void {
    const start = ctx.currentTime;

    for (const { frequency, at, length = 1.4 } of tones) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, start + at);
        gain.gain.exponentialRampToValueAtTime(volume, start + at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + at + length);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start + at);
        osc.stop(start + at + length + 0.1);
    }
}

/** "It's your turn": a bright rising three-note call, played twice. */
const TURN: Tone[] = [0, 1].flatMap((round) =>
    [523.25, 659.25, 783.99].map((frequency, note) => ({
        frequency,
        at: round * 1.1 + note * 0.18,
        length: 0.6,
    })),
);

/** Plays the "your turn" call. False if sound isn't unlocked yet. */
export function playTurnAlert(): boolean {
    if (!context || context.state !== 'running') {
        return false;
    }

    playTones(context, TURN, 0.6);

    return true;
}
