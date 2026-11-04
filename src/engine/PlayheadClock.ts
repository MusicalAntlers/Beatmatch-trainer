// src/engine.PlayheadClock.ts
//
// Tracked where a deck is in its audio, even while its playback rate changes.
// Instead of adding up tiny steps every frame (which drifts), we store an
// "anchor" each time the rate changes and calculate forward from it.

export interface RateAnchor {
    contextTime: number; // AudioContext time when this anchor was set
    sourcePosition: number; // position in the source audio at the moment (seconds)
    rate: number; // playback rate from that moment on
}

export class PlayheadClock {
    readonly bpm: number; // the source audio's original BPM
    private anchor: RateAnchor = { contextTime: 0, sourcePosition: 0, rate: 1 };

    constructor(bpm: number) {
        this.bpm = bpm;
    }

    /** Called when the deck starts playing.  */
    reset(contextTime: number, sourcePosition: number, rate: number): void {
        this.anchor = { contextTime, sourcePosition, rate };
    }

    /** Called whenever that rate changes: freeze the current position as a new anchor */
    setRate(contextTime: number, rate: number): void {
        this.anchor = { contextTime, sourcePosition: this.positionAt(contextTime), rate };
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