// src/engine.PlayheadClock.ts
//
// Tracks where a deck is in its audio, even while its playback rate changes.
// We store an "anchor" each time the rate changes and calculate forward from it.
// Rate changes can ramp smoothly; the math below stays exact during the ramp.

export interface RateAnchor {
    contextTime: number; // AudioContext time when this anchor was set
    sourcePosition: number; // position in the source audio at the moment (seconds)
    rate: number; // the rate we're ramping to
    fromRate: number; // the rate at the start of the ramp
    rampSec: number; // how long the ramp takes (0 = instant)
}

export class PlayheadClock {
    readonly bpm: number; // the source audio's original BPM
    private anchor: RateAnchor = {
        contextTime: 0, 
        sourcePosition: 0, 
        rate: 1,
        fromRate: 1,
        rampSec: 0
    };

    constructor(bpm: number) {
        this.bpm = bpm;
    }

    /** Called when the deck starts playing.  */
    reset(contextTime: number, sourcePosition: number, rate: number): void {
        this.anchor = { contextTime, sourcePosition, rate, fromRate: rate, rampSec: 0 };
    }

    /** Called whenever that rate changes: freeze the current position as a new anchor */
    setRate(contextTime: number, rate: number, rampSec = 0): void {
        this.anchor = {
            contextTime,
            sourcePosition: this.positionAt(contextTime),
            rate,
            fromRate: this.rateAt(contextTime),
            rampSec,
        };
    }

    /** Playback rate at time t (partway between fromRate and rate during a ramp). */
    rateAt(t: number): number {
        const { contextTime, rate, fromRate, rampSec } = this.anchor;
        const dt = Math.max(0, t - contextTime);
        if (dt >= rampSec) return rate;
        return fromRate + (rate - fromRate) * (dt / rampSec);
    }

    /** Position in the source audio (seconds) at audio-clock time t. */
    positionAt(t: number): number {
        const { contextTime, sourcePosition, rate } = this.anchor;
        // Math.max: if playback is scheduled to start in the future, don't count backward
        return sourcePosition + Math.max(0, t - contextTime) * rate;
    }

    /** Position in beats at time t */
    beatsAt(t: number): number {
        return (this.positionAt(t) * this.bpm) / 60;
    }
}