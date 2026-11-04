// src/App.tsx
//
// Week 2 test page: pitch fader on Deck B plus a live debug panel

import { useEffect, useRef, useState } from "react";
import { renderLoop } from "./engine/loops";
import { Deck } from "./engine/Deck";
import { phaseErrorMs, tempoErrorPct } from "./engine/phase";

const BPM_A = 124;
const BPM_B = 120;

interface Stats {
  bpmA: number;
  bpmB: number;
  tempoErr: number;
  phaseMs: number;
}

export default function App() {
  const ctxRef = useRef<AudioContext | null>(null);
  const decksRef = useRef<{ a: Deck; b: Deck } | null>(null);

  const [playing, setPlaying] = useState(false);
  const [pitchPct, setPitchPct] = useState(0);
  const [splitCue, setSplitCue] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);


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
    decks.a.play(when);
    decks.b.play(when);
    setPlaying(true);
  };

  const stop = () => {
    decksRef.current?.a.stop();
    decksRef.current?.b.stop();
    setPlaying(false);
  };

  const changePitch = (pct: number) => {
    setPitchPct(pct);
    decksRef.current?.b.setRate(1 + pct / 100);
  }

  const toggleSplitCue = () => {
    const next = !splitCue;
    setSplitCue(next);
    decksRef.current?.a.setPan(next ? -1 : 0); // A in left ear
    decksRef.current?.b.setPan(next ? 1 : 0); // B in right ear
  };

  // While playing, read the clocks about 30 times a second and update the panel.
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
    return () => cancelAnimationFrame(frame); // cleanup when playing becomes false
  }, [playing]);

  // Phase meter: dor at center = locked; edges = half a beat off.
  const halfBeatMs = stats ? 30000 / stats.bpmA : 1;
  const dotPct = stats ? Math.min(100, Math.max(0, 50 + (stats.phaseMs / halfBeatMs) * 50)) : 50;


  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif", maxWidth: 480 }}>
      <h1>Beatmatch Trainer</h1>

      <div style={{ display: "flex", gap: 8 }}>
        {playing ? (
          <button onClick={stop}>Stop</button>
        ) : (
          <button onClick={start}>Play both decks</button>
        )}
        <button onClick={toggleSplitCue} disabled={!playing}>
          Split cue: {splitCue ? "on" : "off"}
        </button>
      </div>

      <h2 style={{ fontSize: 16, marginTop: 24 }}>Deck B pitch </h2>
      <input
        type="range"
        min={-8}
        max={8}
        step={0.02}
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

      <h2 style={{ fontSize: 16, marginTop: 24 }}>Debug</h2>
      {stats ? (
        <div style={{ fontFamily: "ui-monospace, monospace", lineHeight: 1.7 }}>
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