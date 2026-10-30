// src/engine/loops.ts
//
// Synthesizes a drum loop (kick + hi-hat) into an AudioBuffer.
// Because we generate the audio ourselves, we know the exact BPM and
// exactly where every beat falls: perfect "ground truth" for scoring later.

const BEATS_PER_BAR = 4;

// Options for renderloop. The "?" means the property is optional.
export interface LoopOptions {
    bpm: number; // beats per minute
    bars?: number; // number of bars to generate (default: 4)
    sampleRate?: number; // pass your AudioContext's sampleRate to avoid resampling
}

/**
 *  Renders a looping drum pattern and returns it as an AudioBuffer.
 * 
 * Pattern per bar (4 beats):
 *  kick on every beat (beat 1 of each bar slightly louder, so you can find the "one")
 *  closed hi-hat on every offbeat (the "and" between kicks)
 */
export async function renderLoop({
    bpm,
    bars = 4,
    sampleRate = 44100,
}: LoopOptions): Promise<AudioBuffer> {
    const secondsPerBeat = 60 / bpm;
    const totalBeats = bars * BEATS_PER_BAR;
    const duration = totalBeats * secondsPerBeat;

    // Buffer length must be a whole number of samples. Rounding adds well under
    // 1 sample (~0.02 ms) of error per loop, far below what anyone can hear.
    const length = Math.round(duration * sampleRate);

    // An OfflineAudioContext works like a normal AudioContext, but instead of
    // playing through your speakers it renders as fast as possible into a buffer.
    const ctx = new OfflineAudioContext(2, length, sampleRate);

    // One short burst of white noise, reused for every hi-hat hit.
    const noise = createNoiseBuffer(ctx, 0.1);

    for (let beat = 0; beat < totalBeats; beat++) {
        const time = beat * secondsPerBeat;
        const isDownBeat = beat % BEATS_PER_BAR === 0;

        scheduleKick(ctx, time, isDownBeat ? 1.0 : 0.8);
        scheduleHat(ctx, noise, time + secondsPerBeat / 2, 0.25);
    }

    // startRendering() returns a Promise that resolves with the finished AudioBuffer.
    return ctx.startRendering();
}

/**
 * A synthetic kick drum: a sine wave whose pitch drops quickly from 150Hz to 45 Hz
 * (the "thump"), with a volume that fades out over ~0.35 s.
 */
function scheduleKick(ctx: BaseAudioContext, time: number, level: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(45, time + 0.12);

    // Exponential ramps can't reach exactly 0, so we fade to 0.001 (inaudible).
    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);

    // connect() returns the node you connected to, so calls can be chained:
    // oscillator -> gain -> output
    osc.connect(gain).connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.4);
}

/**
 *  A synthetic closed hi-hat: white noise through a high-pass filter
 *  (keeps only the bright "tss"), with a very short fade.
 */
function scheduleHat(
    ctx: BaseAudioContext,
    noise: AudioBuffer,
    time: number,
    level: number,
): void {
    const source = ctx.createBufferSource();
    source.buffer = noise;

    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 7000;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

    // noise -> filter -> gain -> output
    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start(time);
    source.stop(time + 0.06);
}

/** Created a mono buffer of random values between -1 and 1 (white noise) */
function createNoiseBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
    const buffer = ctx.createBuffer(1, Math.ceil(seconds * ctx.sampleRate), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    return buffer;
}