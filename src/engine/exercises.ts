// src/engine/exercises.ts
//
// Generates a random beatmatching exercise for a difficulty level.

/** Where the phase meter is visible: always, only after Lock, or never. */
export type MeterMode = "live" | "after-lock" | "hidden";

export interface Exercise {
    level: number;
    bpmA: number;
    bpmB: number;
    phaseOffsetBeats: number;   // how far B starts ahead of A, as a fraction of a beat (0 < 1)
    meter: MeterMode;
}

interface LevelConfig {
    minGapPct: number;  // smallest pitch-fader move needed to match
    maxGapPct: number;  // largest pitch-fader move needed to match
    maxPhaseBeats: number;  // how far off the beats can start
    meter: MeterMode;
}

// Level 4 tops out at 7.5% (not 8%) so the answer is always reachable on a ±8% fader
const LEVELS: Record<number, LevelConfig> = {
    1: { minGapPct: 1, maxGapPct: 2, maxPhaseBeats: 0.25, meter: "live" },
    2: { minGapPct: 2, maxGapPct: 4, maxPhaseBeats: 0.5, meter: "live" },
    3: { minGapPct: 3, maxGapPct: 6, maxPhaseBeats: 0.5, meter: "after-lock" },
    4: { minGapPct: 4, maxGapPct: 7.5, maxPhaseBeats: 0.5, meter: "hidden" },
};

const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);
const randomSign = () => (Math.random() < 0.5 ? -1 : 1);

export function generateExercise(level: number): Exercise {
    const config = LEVELS[level];

    // Deck A: a typical house/pop tempo
    const bpmA = Math.round(randomBetween(118, 128));

    // Pick how far the fader must move, then work backward to Deck B's BPM.
    // B could be faster or slower than A, so the gap gets a random sign.
    const gapPct = randomSign() * randomBetween(config.minGapPct, config.maxGapPct);
    const bpmB = Math.round((bpmA / (1 + gapPct / 100)) * 100) / 100;

    // Start B somewhat off the beat in either direction, then convert to 0..1
    // B could be faster or slower than A, so the gap gets a random sign.
    const signedOffset = randomSign() * randomBetween(0.05, config.maxPhaseBeats);
    const phaseOffsetBeats = ((signedOffset % 1) + 1) % 1;

    return { level, bpmA, bpmB, phaseOffsetBeats, meter: config.meter };
}