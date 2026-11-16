// src/App.tsx
//
// Week 4: training rounds with difficulty levels, Lock, a hands-off drift test, and scoring.

import { useCallback, useEffect, useRef, useState } from "react";
import { renderLoop } from "./engine/loops";
import { Deck } from "./engine/Deck";
import { beatOffset, phaseErrorMs, tempoErrorPct } from "./engine/phase";
import { generateExercise, type Exercise } from "./engine/exercises";
import { scoreRound, type RoundResult } from "./engine/scoring";

const PITCH_STEP = 0.02;
const PITCH_RANGE = 8;
const DRIFT_BARS = 16;    // hands-off test length; lower to 8 for quicker rounds

const LEVEL_LABLES: REcord<number, string> = {
  1: "Level 1 · 1-2% apart · meter on",
  2: "Level 2 · 2-4% apart · meter on",
  3: "Level 3 · 3-6% apart · meter after Lock",
  4: "Level 4 · 4-7.5% apart · ears only",
};

type RoundPhase = "idle" | "playing" | "drift" | "results";
interface Stats {
  bpmA: number;
  bpmB: number;
  tempoErr: number;
  phaseMs: number;
}

/** Timing info for the current round, kept in a ref because the animation loop reads it. */
interface RoundTiming {
  startTime: number;
  lockTime: number;
  lockOffsetBeats: number;
  lockPhaseMs: number;
  lockTempoErr: number;
  driftEnd: number;
  done: boolean;
}

/** Keeps the pitch inside ±8% and snapped to 0.02% steps. */
const clampPitch = (pct: number) =>
  Math.min(PITCH_RANGE, Math.max(-PITCH_RANGE, Math.round(pct / PITCH_STEP) * PITCH_STEP));

const phaseLabel = (ms: number) =>
  Math.abs(ms) < 20 ? "locked" : ms > 0 ? "B early" : "B late";

/** A small horizontal meter: dot in the center = beats aligned. */
function Phasemeter({ phaseMs, bpm }: { phaseMs: number; bpm: number }) {
  const halfBeatMs = 30000 / bpm;
  const dotPct = Math.min(100, Math.max(0, 50 + (phaseMs / halfBeatMs) * 50));
  return (
    <div style={{ position: "relative", height: 14, background: "#ddd", borderRadius: 7, marginTop: 8 }}>
      <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 2, background: "#888" }} />
      <div
        style={{
          position: "absolute",
          left: `${dotPct}%`,
          top: 1,
          width: 12,
          height: 12,
          marginLeft: -6,
          borderRadius: 6,
          background: "#2563eb",
        }}
      />
    </div>
  );
}

export default function App() {
  const ctxRef = useRef<AudioContext | null>(null);
  const decksRef = useRef<{ a: Deck; b: Deck } | null>(null);
  const pitchRef = useRef(0); // mirror of pitchPct that the keyboard handler can read
  const phaseRef = useRef<RoundPhase>("idle");
  const splitRef = useRef(false);
  const timingRef = useRef<RoundTiming | null>(null);
  const exerciseRef = useRef<Exercise | null>(null);

  const [roundPhase, setRoundPhaseState] = useState<RoundPhase>("idle");
  const [level, setLevel] = useState(1);
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [pitchPct, setPitchPct] = useState(0);
  const [splitCue, setSplitCue] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [driftProgress, setDriftProgress] = useState(0);
  const [result, setResult] = useState<RoundResult | null>(null);
  const [history, setHistory] = useState<RoundResult[]>([]);

  // Keep the ref and the state in step: the ref is for event handlers and the
  // animation loop, the state iis for redrawing the screen.
  const setRoundPhase = useCallback((p: RoundPhase) => {
    phaseRef.current = p;
    setRoundPhaseState(p);
  }, []);

  // useCallback keeps the same function between renders, so the keyboard
  // effect below doesn't need to re-subscribe every time.
  const changePitch = useCallback((pct: number) => {
    const next = clampPitch(pct);
    pitchRef.current = next;
    setPitchPct(next);
    decksRef.current?.b.setRate(1 + next / 100);
  }, []);

  const startRound = async () => {
    const ctx = (ctxRef.current ??= new AudioContext());
    await ctx.resume();

    // Throw away last round's decks.
    decksRef.current?.a.dispose();
    decksRef.current?.b.dispose();

    const ex = generateExercise(level);
    const [bufA, bufB] = await Promise.all([
      renderLoop({ bpm: ex.bpmA, sampleRate: ctx.sampleRate }),
      renderLoop({ bpm: ex.bpmB, sampleRate: ctx.sampleRate }),
    ]);

    const a = new Deck(ctx, bufA, ex.bpmA, ctx.destination);
    const b = new Deck(ctx, bufB, ex.bpmB, ctx.destination);
    a.setPan(splitRef.current ? -1 : 0);
    b.setPan(splitRef.current ? 1 : 0);
    decksRef.current = { a, b };
    changePitch(0);   // every round starts with the fader at zero

    const when = ctx.currentTime + 0.1;
    a.play(when);
    b.play(when, (ex.phaseOffsetBeats * 60) / ex.bpmB);

    exerciseRef.current = ex;
    timingRef.current = {
      startTime: when,
      lockTime: 0,
      lockOffsetBeats: 0,
      lockPhaseMs: 0,
      lockTempoErr: 0,
      driftEnd: 0,
      done: false,
    };

    setExercise(ex);
    setResult(null);
    setStats(null);
    setDriftProgress(0);
    setRoundPhase("playing");
  };

  // Creates the AudioContext and both decks the first time, then reuses them.
  const setup = async () => {
    const ctx = (ctxRef.current ??= new AudioContext());
    await ctx.resume();

    if (!decksRef.current) {
      // Render both loops at the same time; Promise.all waits for both
      const [bufA, bufB] = await Promise.all([
        renderLoop({ bpm: BPM_A, sampleRate: ctx.sampleRate }),
        renderLoop({ bpm: BPM_B, sampleRate: ctx.sampleRate }),
      ]);
      decksRef.current = {
        a: new Deck(ctx, bufA, BPM_A, ctx.destination),
        b: new Deck(ctx, bufB, BPM_B, ctx.destination),
      };
      decksRef.current.b.setRate(1 + pitchPct / 100);
    }
    return { ctx, decks: decksRef.current };
  };

  const start = async () => {
    const { ctx, decks } = await setup();
    const when = ctx.currentTime + 0.1;

    // Start B somewhere between 15% and 85% of a beat off, so it never starts aligned
    const offsetBeats = randomStart ? 0.15 + Math.random() * 0.7 : 0;

    decks.a.play(when);
    decks.b.play(when, (offsetBeats * 60) / BPM_B);
    setPlaying(true);
  };

  const stop = () => {
    decksRef.current?.a.stop();
    decksRef.current?.b.stop();
    setPlaying(false);
  };

  const toggleSplitCue = () => {
    const next = !splitCue;
    setSplitCue(next);
    decksRef.current?.a.setPan(next ? -1 : 0); // A in left ear
    decksRef.current?.b.setPan(next ? 1 : 0); // B in right ear
  };

  // Props for a hold-to-nudge button: nudge while the pointer is down, release on up or leave.
  const nudgeProps = (direction: number) => ({
    onPointerDown: () => decksRef.current?.b.nudge(direction),
    onPointerUp: () => decksRef.current?.b.nudge(0),
    onPointerLeave: () => decksRef.current?.b.nudge(0),
  });

  // Keyboard shortcuts:
  // ↑ / ↓        pitch up / down 0.02% (hold Shift for 0.2%)
  // . (comma)    hold to budge B back (slower)
  // . (period)   hold to budge B forward (faster) 
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // If the slide has focus, it already handles arrow keys itself.
      const onSlider = e.target instanceof HTMLInputElement;

      if ((e.key === "ArrowUp" || e.key === "ArrowDown") && !onSlider) {
        e.preventDefault(); // stop the page from scrolling
        const step = (e.shiftKey ? 10 : 1) * PITCH_STEP;
        changePitch(pitchRef.current + (e.key === "ArrowUp" ? step : -step));
      } else if (e.key === "," && !e.repeat) {
        decksRef.current?.b.nudge(-1);
      } else if (e.key === "." && !e.repeat) {
        decksRef.current?.b.nudge(1);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "," || e.key === ".") decksRef.current?.b.nudge(0);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [changePitch]);

  // While playing, read the clocks about 30 times a second.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = 0;

    const tick = (ms: number) => {
      if (ms - last > 33) {
        last = ms;
        const ctx = ctxRef.current;
        const decks = decksRef.current;
        if (ctx && decks) {
          setStats({
            bpmA: decks.a.effectiveBpm,
            bpmB: decks.b.effectiveBpm,
            tempoErr: tempoErrorPct(decks.a, decks.b),
            phaseMs: phaseErrorMs(decks.a, decks.b, ctx.currentTime),
          });
        }
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const halfBeatMs = stats ? 30000 / stats.bpmA : 1;
  const dotPct = stats ? Math.min(100, Math.max(0, 50 + (stats.phaseMs / halfBeatMs) * 50)) : 50;

  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif", maxWidth: 480 }}>
      <h1>Beatmatch Trainer</h1>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {playing ? (
          <button onClick={stop}>Stop</button>
        ) : (
          <button onClick={start}>Play both decks</button>
        )}
        <button onClick={toggleSplitCue} disabled={!playing}>
          Split cue: {splitCue ? "on" : "off"}
        </button>
      </div>

      <label style={{ display: "block", marginTop: 12 }}>
        <input
          type="checkbox"
          checked={randomStart}
          onChange={(e) => setRandomStart(e.target.checked)}
        />{" "}
        Start Deck B at a random beat offset
      </label>

      <h2 style={{ fontSize: 16, marginTop: 24 }}>Deck B pitch </h2>
      <input
        type="range"
        min={-PITCH_RANGE}
        max={PITCH_RANGE}
        step={PITCH_STEP}
        value={pitchPct}
        onChange={(e) => changePitch(Number(e.target.value))}
        style={{ width: "100%" }}
      />
      <div style={{ display: "flex", justifyContent: "Space-between" }}>
        <span>
          {pitchPct >= 0 ? "+" : ""}
          {pitchPct.toFixed(2)}%
        </span>
        <button onClick={() => changePitch(0)}>Reset</button>
      </div>

      <h2 style={{ fontSize: 16, marginTop: 24 }}>Deck B nudge (hold)</h2>
      <div style={{ display: "flex", gap: 8 }}>
        <button {...nudgeProps(-1)} disabled={!playing}>
          ◀︎ Slow down ( , )
        </button>
        <button {...nudgeProps(1)} disabled={!playing}>
          Speed up ( . ) ▶︎
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 24 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>Debug</h2>
        <button onClick={() => setShowDebug(!showDebug)}>
          {showDebug ? "Hide (ears only)" : "Show"}
        </button>
      </div>

      {!showDebug ? (
        <p>Hidden, Trust your ears, then peek to check.</p>
      ) : stats ? (
        <div style={{ fontFamily: "ui-monospace, monospace", lineHeight: 1.7, marginTop: 8 }}>
          <div>Deck A: {stats.bpmA.toFixed(2)} BPM</div>
          <div>Deck B: {stats.bpmB.toFixed(2)} BPM</div>
          <div>Tempo error: {stats.tempoErr.toFixed(2)}%</div>
          <div>
            Phase: {stats.phaseMs.toFixed(0)} ms{" "}
            {Math.abs(stats.phaseMs) < 20 ? "(locked)" : stats.phaseMs > 0 ? "(B early)" : "(B late)"}
          </div>
          <div style={{ position: "relative", height: 14, background: "#ddd", borderRadius: 7, marginTop: 8 }}>
            <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 2, background: "#888" }} />
            <div
              style={{
                position: "absolute",
                left: `${dotPct}%`,
                top: 1,
                width: 12,
                height: 12,
                marginLeft: -6,
                borderRadius: 6,
                background: "#2563eb",
              }}
            />
          </div>
        </div>
      ) : (
        <p>Press play to see live readings.</p>
      )}
    </div>
  );
}