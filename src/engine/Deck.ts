// src.engine/Deck.ts
//
// One deck: a looping buffer with volume, pan, pitch (playback rate), and a playhead clock.

import { PlayheadClock } from "./PlayheadClock";

const NUDGE_AMOUNT = 0.04; // nudge bends the speed by  ±4% while held
const RAMP_SEC = 0.03; // rate changes glide over 30 ms instead of jumping
export class Deck {
    readonly bpm: number;
    readonly clock: PlayheadClock;

    private ctx: AudioContext;
    private buffer: AudioBuffer;
    private gain: GainNode;
    private panner: StereoPannerNode;
    private source: AudioBufferSourceNode | null = null;
    private startTime = 0;

    private pitchRate = 1; // set by the pitch fader
    private nudgeDirection = 0; // -1 = slowing, 0 = none, 1 = speeding up

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
        return this.bpm * this.pitchRate;
    }

    private get playbackRate(): number {
        return this.pitchRate * (1 + this.nudgeDirection * NUDGE_AMOUNT);
    }

    play(when: number, offsetSec = 0): void {
        this.stop();
        const offset = offsetSec % this.buffer.duration;

        const source = this.ctx.createBufferSource();
        source.buffer = this.buffer;
        source.loop = true;
        source.playbackRate.value = this.playbackRate;
        source.connect(this.gain);
        source.start(when, offset);

        this.source = source;
        this.startTime = when;
        this.clock.reset(when, offset, this.playbackRate);
    }

    stop(): void {
        this.source?.stop();
        this.source?.disconnect();
        this.source = null;
    }

    /** 1 = original speed, 1.04  = 4% faster. */
    setRate(rate: number): void {
        this.pitchRate = rate;
        this.applyRate();
    }

    /** Nudge: call with -1 or 1 when pressed, 0 when released. */
    nudge(direction: number): void {
        if (direction === this.nudgeDirection) return; // ignore repeats
        this.nudgeDirection = direction;
        this.applyRate();
    }

    /** 0 = silent, 1 = full volume. Smoothed so changes don't click. */
    setVolume(volume: number): void {
        this.gain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.01);
    }

    /** -1 = full left, 0 = center, 1 = full right. */
    setPan(pan: number): void {
        this.panner.pan.setTargetAtTime(pan, this.ctx.currentTime, 0.01);
    }

    /** Glides the audio to the new rate and tells the clock about the same glide. */
    private applyRate(): void {
        if (!this.source) return; // not playing: the new rate is used on the next play()

        const at = Math.max(this.ctx.currentTime, this.startTime);
        const from = this.clock.rateAt(at);
        const to = this.playbackRate;
        const param = this.source.playbackRate;

        // Cancel any ramp still in progress, pin the current rate, them ramp to the new one.
        param.cancelScheduledValues(at);
        param.setValueAtTime(from, at);
        param.linearRampToValueAtTime(to, at + RAMP_SEC);

        // The clock follows the exact same ramp, so it stays in step with the audio.
        this.clock.setRate(at, to, RAMP_SEC);
    }
}
