// src.engine/Deck.ts
//
// One deck: a looping buffer routed through its own volume (gain) and pan controls.
// Pitch control and the playhead clock get added in Week 2.

export class Deck {
    readonly bpm: number;

    private ctx: AudioContext;
    private buffer: AudioBuffer;
    private gain: GainNode;
    private panner: StereoPannerNode;
    private source: AudioBufferSourceNode | null = null;

    constructor(ctx: AudioContext, buffer: AudioBuffer, bpm: number, output: AudioNode) {
        this.ctx = ctx;
        this.buffer = buffer;
        this.bpm = bpm;

        this.gain = ctx.createGain();
        this.gain.gain.value = 0.5; // two decks at full volume would add up and clip
        this.panner = ctx.createStereoPanner();

        // source (created in play) -> gain -> panner -> output
        this.gain.connect(this.panner).connect(output);
    }

    /**
     *  Starts the loop at an exact time on the audio clock.
     *  @param when      AudioContext time to start (seconds)
     * @param offsetSec where in the loop to start from (seconds)
     */
    play(when: number, offsetSec = 0): void {
        this.stop();

        // Buffer sources are one-shot: nce stopped, they can't restart.
        // So every plat() creates a fresh one that shares the same buffer.
        const source = this.ctx.createBufferSource();
        source.buffer = this.buffer;
        source.loop = true;
        source.connect(this.gain);
        source.start(when, offsetSec % this.buffer.duration);

        this.source = source;
    }

    stop(): void {
        this.source?.stop();
        this.source?.disconnect();
        this.source = null;
    }

    /** 0 = silent, 1 = full volume. Smoothed so changes don't click. */
    setVolume(volume: number): void {
        this.gain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.01);
    }

    /** -1 = full left, 0 = center, 1 = full right. */
    setPan(pan: number): void {
        this.panner.pan.setTargetAtTime(pan, this.ctx.currentTime, 0.01);
    }
}
