// src/App.tsx
//
// Temporary test page: renders a drum loop at the chosen BPM and plays it on repeat.
// This gets replaced by the real Controls / Feedback UI in later weeks.

import { useRef, useState } from "react";
import { renderLoop } from "./engine/loops";
import { Deck } from "./engine/Deck";

const BPM = 124;

export default function App() {
  const ctxRef = useRef<AudioContext | null>(null);
  const decksRef = useRef<{ a: Deck; b: Deck } | null>(null);

  const [playing, setPlaying] = useState(false);
  const [splitCue, setSplitCue] = useState(false);
  const [mutedA, setMutedA] = useState(false);
  const [mutedB, setMutedB] = useState(false);

  // Creates the AudioContext and both decks the first time, then reuses them.
  const setup = async () => {
    const ctx = (ctxRef.current ??= new AudioContext());
    await ctx.resume();

    if (!decksRef.current) {
      const buffer = await renderLoop({ bpm: BPM, sampleRate: ctx.sampleRate });
      decksRef.current = {
        a: new Deck(ctx, buffer, BPM, ctx.destination),
        b: new Deck(ctx, buffer, BPM, ctx.destination),
      };
    }
    return { ctx, decks: decksRef.current };
  };

  const start = async () => {
    const { ctx, decks } = await setup();

    // Schedule both starts 100 ms in the future, at the SAME audio clock time.
    // Calling play() "now" twice would start time a few microseconds apart.

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

  const toggleSplitCue = () => {
    const next = !splitCue;
    setSplitCue(next);
    decksRef.current?.a.setPan(next ? -1 : 0); // A in left ear
    decksRef.current?.b.setPan(next ? 1 : 0); // B in right ear
  };

  const toggleMuteA = () => {
    const next = !mutedA;
    setMutedA(next);
    decksRef.current?.b.setVolume(next ? 0 : 0.5);
  };

  const toggleMuteB = () => {
    const next = !mutedB;
    setMutedB(next);
    decksRef.current?.b.setVolume(next ? 0 : 0.5);
  };

  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>Beatmatch Trainer</h1>
      <p>Both decks: {BPM} BPM</p>

      {playing ? (
        <button onClick={stop}>Stop</button>
      ) : (
        <button onClick={start}>Play both decks</button>
      )}

      <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
        <button onClick={toggleMuteA} disabled={!playing}>
          {mutedA ? "Unmute A" : "Mute A"}
        </button>
        <button onClick={toggleMuteB} disabled={!playing}>
          {mutedB ? "Unmute B" : "Mute B"}
        </button>
        <button onClick={toggleSplitCue} disabled={!playing}>
          Split cue: {splitCue ? "on" : "off"}
        </button>
      </div>
    </div>
  );
}

