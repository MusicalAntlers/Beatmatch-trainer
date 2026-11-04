// src.engine/Deck.ts
//
// One deck: a looping buffer with volume, pan, pitch (playback rate), and a playhead clock.

import { PlayheadClock } from "./PlayheadClock";
export class Deck {
    readonly bpm: number;
    readonly clock: PlayheadClock;

    private ctx: AudioContext;
    private buffer: AudioBuffer;
    private gain: GainNode;
    private panner: StereoPannerNode;
    private source: AudioBufferSourceNode | null = null;
    private rate = 1;
    private startTime = 0;

    constructor(ctx: AudioContext, buffer: AudioBuffer, bpm: number, output: AudioNode) {
        this.ctx = ctx;
        this.buffer = buffer;
        this.bpm = bpm;
        this.clock = new PlayheadClock(bpm);

        this.gain = ctx.createGain();
        this.gain.gain.value = 0.5; // two decks at full volume would add up and clip
        this.panner = ctx.createStereoPanner();
        this.gain.connect(this.panner).connect(output);
    }

    /** The tempo you actually hear: oringinal BPM times the pitch fader's rate. */
    get effectiveBpm(): number {
        return this.bpm * this.rate;
    }

    play(when: number, offsetSec = 0): void {
        this.stop();
        const offset = offsetSec % this.buffer.duration;

        const source = this.ctx.createBufferSource();
        source.buffer = this.buffer;
        source.loop = true;
        source.playbackRate.value = this.rate;
        source.connect(this.gain);
        source.start(when, offset);

        this.source = source;
        this.startTime = when;
        this.clock.reset(when, offset, this.rate);
    }

    stop(): void {
        this.source?.stop();
        this.source?.disconnect();
        this.source = null;
    }

    /** 1 = original speed, 1.04  = 4% faster. */
    setRate(rate: number): void {
        this.rate = rate;
        if (!this.source) return; // not playing: the new rate is used on the next play()

        // If play() is scheduled for a moment that hasn't arrived yet, anchor at the start time.
        const at = Math.max(this.ctx.currentTime, this.startTime);
        this.source.playbackRate.setValueAtTime(rate, at);
        this.clock.setRate(at, rate);
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
