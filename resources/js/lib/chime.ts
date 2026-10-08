/**
 * Sounds made in the browser (no audio files to download).
 *
 * Browsers only let a page make sound after the person has tapped it, so
 * `unlockSound()` / `enableSound()` must run inside a tap. The unlocked sound
 * lasts while the page stays open, including page changes in the app (the
 * tap on "Get my ticket" also covers the ticket page).
 *
 * The customer's chime plays as an audio file (an <audio> element), not Web
 * Audio: iPhones mute Web Audio whenever the silent switch is on, but play
 * audio files like video, so the "your turn" chime is still heard.
 */
export type Tone = { frequency: number; at: number; length?: number };

/** Web Audio tones, for screens like the TV display. */
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

let turnAudio: HTMLAudioElement | null = null;
let unlocked = false;

function turnAudioElement(): HTMLAudioElement {
    if (!turnAudio) {
        turnAudio = new Audio(URL.createObjectURL(renderWav(TURN)));
        turnAudio.preload = 'auto';
    }

    return turnAudio;
}

/**
 * From a tap, silently (e.g. "Get my ticket"): lets the page ring later.
 * Resolves true once it may.
 */
export async function unlockSound(): Promise<boolean> {
    try {
        const audio = turnAudioElement();
        audio.muted = true;
        await audio.play();
        audio.pause();
        audio.currentTime = 0;
        audio.muted = false;
        unlocked = true;
    } catch {
        // Not allowed here; "Turn on sound" asks again.
    }

    return unlocked;
}

/** From a tap: plays the chime once, so they know what to listen for. */
export async function enableSound(): Promise<boolean> {
    try {
        const audio = turnAudioElement();
        audio.muted = false;
        audio.currentTime = 0;
        await audio.play();
        unlocked = true;
    } catch {
        unlocked = false;
    }

    return unlocked;
}

export function soundReady(): boolean {
    return unlocked;
}

/** Plays the "your turn" call. False if sound isn't on yet. */
export function playTurnAlert(): boolean {
    if (!unlocked || !turnAudio) {
        return false;
    }

    turnAudio.currentTime = 0;
    void turnAudio.play().catch(() => undefined);

    return true;
}

/** The tones as a mono 16-bit WAV file. */
function renderWav(tones: Tone[], rate = 22050): Blob {
    const end = Math.max(...tones.map((t) => t.at + (t.length ?? 1.4))) + 0.1;
    const samples = new Float32Array(Math.ceil(end * rate));

    for (const { frequency, at, length = 1.4 } of tones) {
        const first = Math.floor(at * rate);
        const count = Math.floor(length * rate);

        for (let i = 0; i < count && first + i < samples.length; i++) {
            const t = i / rate;
            // Quick attack, gentle bell-like decay.
            const envelope = Math.min(1, t / 0.02) * Math.exp(-t * 5);
            samples[first + i] +=
                Math.sin(2 * Math.PI * frequency * t) * envelope * 0.3;
        }
    }

    const view = new DataView(new ArrayBuffer(44 + samples.length * 2));
    // The WAV header's four-letter ASCII tags.
    const text = (offset: number, value: string) => {
        for (let i = 0; i < value.length; i++) {
            view.setUint8(offset + i, value.charCodeAt(i));
        }
    };

    text(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    text(8, 'WAVE');
    text(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    text(36, 'data');
    view.setUint32(40, samples.length * 2, true);
    samples.forEach((sample, i) =>
        view.setInt16(
            44 + i * 2,
            Math.max(-1, Math.min(1, sample)) * 0x7fff,
            true,
        ),
    );

    return new Blob([view.buffer], { type: 'audio/wav' });
}
