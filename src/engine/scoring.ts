// src/engine/scoring.ts
//
// Turns a round's measurements into a 0-100 score

export interface RoundMeasurements {
    level: number;
    timeToLockSec: number;  // from round start to pressing Lock
    phaseErrorMs: number;   // how far apart the kicks were at Lock
    tempoErrorPct: number;  // how far apart the tempos were at Lock
    driftMs: number;        // how much the beats slid apart during the hands-off test
}

export interface RoundResult extends RoundMeasurements {
    locked: boolean;
    score: number;
    playedAt: string;
}

export const LOCK_THRESHOLDS = { tempoPct: 0.1, phaseMs: 20 };

/**
 * Returns 1 when value is at of below 'perfect', 0 at or above 'zero',
 * and a straight line in between.
 */
function scale(value: number, perfect: number, zero: number): number {
    const t = (zero - value) / (zero - perfect);
    return Math.min(1, Math.max(0, t));
}

export function scoreRound(m: RoundMeasurements): RoundResult {
    // 40 points: phase at Lock. Pefect within 5 ms, nothing past 60 ms.
    const phasePoints = 40 * scale(Math.abs(m.phaseErrorMs), 5, 60);
    // 40 points: drift over the hands-off test. Perfect within 10 ms, nothing past 120
    const driftPoints = 40 * scale(Math.abs(m.driftMs), 10, 120);
    // 20 points: speed. Full marks within 10 s, nothing after 60 s.
    const timePoints = 20 * scale(m.timeToLockSec, 10, 60)

    const locked =
        Math.abs(m.tempoErrorPct) < LOCK_THRESHOLDS.tempoPct &&
        Math.abs(m.phaseErrorMs) < LOCK_THRESHOLDS.phaseMs;

    return {
        ...m,   // copy every measurement into the result
        locked,
        score: Math.round(phasePoints + driftPoints + timePoints),
        playedAt: new Date().toISOString(),
    };
}