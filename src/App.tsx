// src/App.tsx
//
// Week 4: training rounds with difficulty levels, Lock, a hands-off drift test, and scoring.

import { useCallback, useEffect, useRef, useState } from "react";
import { renderLoop } from "./engine/loops";
import { Deck } from "./engine/Deck";
import { beatOffset, phaseErrorMs, tempoErrorPct } from "./engine/phase";
import { generateExercise, type Exercise } from "./engine/exercises";
import { scoreRound, type RoundResult } from "./engine/scoring";
import { HistoryStore } from "./engine/HistoryStore";
import { Progress } from "./ui/Progress";

const PITCH_STEP = 0.02;
const PITCH_RANGE = 8;
const DRIFT_BARS = 16;    // hands-off test length; lower to 8 for quicker rounds
const historyStore = new HistoryStore();

const LEVEL_LABELS: Record<number, string> = {
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
function PhaseMeter({ phaseMs, bpm }: { phaseMs: number; bpm: number }) {
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
  // Load saved results once, when the app first opens.
  const [allResults, setAllResults] = useState<RoundResult[]>(() => historyStore.load());
  const [hideMeter, setHideMeter] = useState(false);

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

  const lock = () => {
    const ctx = ctxRef.current;
    const decks = decksRef.current;
    const timing = timingRef.current;
    if (!ctx || !decks || !timing || phaseRef.current !== "playing") return;

    decks.b.nudge(0); // release any nudge in progress
    const t = ctx.currentTime;

    timing.lockTime = t;
    timing.lockOffsetBeats = beatOffset(decks.a, decks.b, t);
    timing.lockPhaseMs = phaseErrorMs(decks.a, decks.b, t);
    timing.lockTempoErr = tempoErrorPct(decks.a, decks.b);
    timing.driftEnd = t + (DRIFT_BARS * 4 * 60) / decks.a.effectiveBpm;

    setRoundPhase("drift");
  };

  const giveUp = () => {
    decksRef.current?.a.stop();
    decksRef.current?.b.stop();
    setRoundPhase("idle");
  };

  const toggleSplitCue = () => {
    const next = !splitCue;
    splitRef.current = next;
    setSplitCue(next);
    decksRef.current?.a.setPan(next ? -1 : 0);
    decksRef.current?.b.setPan(next ? 1 : 0);
  };

  const nudgeProps = (direction: number) => ({
    onPointerDown: () => {
      if (phaseRef.current === "playing") decksRef.current?.b.nudge(direction);
    },
    onPointerUp: () => decksRef.current?.b.nudge(0),
    onPointerLeave: () => decksRef.current?.b.nudge(0),
  });

  // Keyboard: 
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

  // Animation loop: live readings while playing, and the drift test after Lock.
  useEffect(() => {
    if (roundPhase !== "playing" && roundPhase !== "drift") return;
    let frame = 0;
    let last = 0;

    const tick = (ms: number) => {
      const ctx = ctxRef.current;
      const decks = decksRef.current;
      const timing = timingRef.current;
      const ex = exerciseRef.current;

      if (ctx && decks && timing && ex && ms - last > 33) {
        last = ms;
        const t = ctx.currentTime;

        setStats({
          bpmA: decks.a.effectiveBpm,
          bpmB: decks.b.effectiveBpm,
          tempoErr: tempoErrorPct(decks.a, decks.b),
          phaseMs: phaseErrorMs(decks.a, decks.b, t),
        });

        if (phaseRef.current === "drift" && !timing.done) {
          const total = timing.driftEnd - timing.lockTime;
          setDriftProgress(Math.min(1, (t - timing.lockTime) / total));

          if (t >= timing.driftEnd) {
            timing.done = true;

            // How far the beats slid apart between Lock and the end of the test.
            const driftBeats = beatOffset(decks.a, decks.b, timing.driftEnd) - timing.lockOffsetBeats;

            const r = scoreRound({
              level: ex.level,
              timeToLockSec: timing.lockTime - timing.startTime,
              phaseErrorMs: timing.lockPhaseMs,
              tempoErrorPct: timing.lockTempoErr,
              driftMs: (driftBeats * 60000) / decks.a.effectiveBpm,
            });

            decks.a.stop();
            decks.b.stop();
            setResult(r);
            setHistory((h) => [r, ...h].slice(0, 10));  // newest first, keep 10
            setAllResults(historyStore.save(r));
            setRoundPhase("results");
            return; // stop the loop
          }
        }
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [roundPhase, setRoundPhase]);

  const playing = roundPhase === "playing";
  const inRound = roundPhase === "playing" || roundPhase === "drift";

  // Whether this level lets you see live readings right now.
  const showLive = 
  !hideMeter &&
  exercise !== null &&
    ((roundPhase === "playing" && exercise.meter === "live") ||
    (roundPhase === "drift" && exercise.meter !== "hidden"));

    const average =
      history.length > 0 ? Math.round(history.reduce((sum, r) => sum + r.score, 0) / history.length) : null;

    return (
      <div style={{ padding: 24, fontFamily: "system-ui, sans-serif", maxWidth: 520 }}>
        <h1>Beatmatch Trainer</h1>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center"}}>
          <select value={level} onChange={(e) => setLevel(Number(e.target.value))} disabled={inRound}>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {LEVEL_LABELS[n]}
              </option>
            ))}
          </select>
          <button onClick={toggleSplitCue}>Split cue: {splitCue ? "on" : "off"}</button>
          <label>
            <input
              type="checkbox"
              checked={hideMeter}
              onChange={(e) => setHideMeter(e.target.checked)}
              />{" "}
              Ears only (hide meter)
          </label>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          {roundPhase === "idle" && <button onClick={startRound}>Start round</button>}
          {roundPhase === "results" && <button onClick={startRound}>Next round</button>}
          {playing && (
            <>
            <button onClick={lock} style={{ fontWeight: 600}}>
              Lock
              </button>
              <button onClick={giveUp}>Give up</button>
              </>
          )}
        </div>

        {roundPhase === "drift" && (
          <div style={{ margin: 16 }}>
            <div>Hands off: listening for drift over {DRIFT_BARS} bars...</div>
            <div style={{ height: 8, background: "#ddd", borderRadius: 4, marginTop: 6 }}>
              <div
                style={{
                  width: `${driftProgress * 100}%`,
                  height: "100%",
                  background: "#2563eb",
                  borderRadius: 4,
                }}
              />
            </div>
          </div>
        )}

        <h2 style={{ fontSize: 16, marginTop: 24 }}>Deck B pitch</h2>
        <input
          type="range"
          min={-PITCH_RANGE}
          max={PITCH_RANGE}
          step={PITCH_STEP}
          value={pitchPct}
          onChange={(e) => changePitch(Number(e.target.value))}
          disabled={!playing}
          style={{ width: "100%" }}
        />
        <div>
          {pitchPct >= 0 ? "+" : ""}
          {pitchPct.toFixed(2)}%
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

        {inRound && (
          <div style={{ marginTop: 24, fontFamily: "ui-monospace, monospace", lineHeight: 1.7 }}>
            {showLive && stats ? (
              <>
                <div>Deck A: {stats.bpmA.toFixed(2)} BPM</div>
                <div>Deck B: {stats.bpmB.toFixed(2)} BPM</div>
                <div>
                    Phase: {stats.phaseMs.toFixed(0)} ms ({phaseLabel(stats.phaseMs)})
                  </div>
                  <PhaseMeter phaseMs={stats.phaseMs} bpm={stats.bpmA} />
                  </>
            ) : (
              <div style={{ fontFamily: "system-ui, sans-serif" }}>
                Ears only. Press Lock when it sounds locked.
              </div>
            )}
          </div>
        )}

        {roundPhase === "results" && result && (
          <div style={{ marginTop: 24, padding: 16, border: "1px solid #ccc", borderRadius: 8 }}>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{result.score} / 100</div>
            <div style={{ marginBottom: 8 }}>{result.locked ? "Locked!" : "Not quite locked"}</div>
            <div>Time to lock: {result.timeToLockSec.toFixed(1)} s</div>
            <div>
              Phase at Lock: {Math.abs(result.phaseErrorMs).toFixed(0)} ms ({phaseLabel(result.phaseErrorMs)})
            </div>
            <div>Tempo error at Lock: {result.tempoErrorPct.toFixed(3)}%</div>
            <div>
              Drift over {DRIFT_BARS} bars: {Math.abs(result.driftMs).toFixed(0)} ms
              {Math.abs(result.driftMs) >= 10 &&
                (result.driftMs > 0 ? " (B pulled ahead: slightly too fast)" : " (B fell behind: slightly too slow)")}
            </div>
          </div>
        )}

        {history.length > 0 && (
          <>
            <h2 style={{ fontSize: 16, marginTop: 24 }}>
              This session ({history.length} rounds, average {average})
            </h2>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left" }}>
                  <th>Level</th>
                  <th>Score</th>
                  <th>Time</th>
                  <th>Phase</th>
                  <th>Drift</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r) => (
                  <tr key={r.playedAt}>
                    <td>{r.level}</td>
                    <td>{r.score}</td>
                    <td>{r.timeToLockSec.toFixed(1)} s</td>
                    <td>{Math.abs(r.phaseErrorMs).toFixed(0)} ms</td>
                    <td>{Math.abs(r.driftMs).toFixed(0)} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <Progress
          results={allResults}
          onClear={() => {
            historyStore.clear();
            setAllResults([]);
          }}
        />
      </div>
    );
  }