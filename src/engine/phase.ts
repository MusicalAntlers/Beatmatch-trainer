// src/engine/phase.ts

// "import type" because we only use Deck as a type here, not as a value.
import type { Deck } from "./Deck";

/** How far B's tempo is from A's, in percent. Positive = B is faster. */
export function tempoErrorPct(a: Deck, b: Deck): number {
    return ((b.effectiveBpm - a.effectiveBpm) / a.effectiveBpm) * 100;
}

/**
 * How far apart the beats are right now, in milliseconds.
 * Positive = V is early (pull it back). Negative = B is late (push it forward).
 */
export function phaseErrorMs(a: Deck, b: Deck, t: number): number {
    const diffBeats = b.clock.beatsAt(t) - a.clock.beatsAt(t);
    // Only the fractional part matters: being 3.1 beats apart sounds the same as 0.1.
    // Subtracting the nearest whole number gives a value between -0.5 and +0.5.
    const wrapped = diffBeats - Math.round(diffBeats);
    return (wrapped * 60000) / a.effectiveBpm;
}