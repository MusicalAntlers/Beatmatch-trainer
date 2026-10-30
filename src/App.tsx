// src/App.tsx
//
// Temporary test page: renders a drum loop at the chosen BPM and plays it on repeat.
// This gets replaced by the real Controls / Feedback UI in later weeks.

import { useRef, useState } from "react";
import { renderLoop } from "./engine/loops";

export default function App() {
  // useRef holds values that survive re-renders without causing them.
  // Audio objects live here, not in state (see "Pitfalls" in the plan).
  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  const [bpm, setBpm] = useState(124);
  const [playing, setPlaying] = useState(false);

  const start = async () => {
    // Create the AudioContext once, on the first click (browser autoplay rule).
    const ctx = (ctxRef.current ??= new AudioContext());
    await ctx.resume();

    // Render at the context's own sample rate (often 48000 on Macs) to avoid resampling.
    const buffer = await renderLoop({ bpm, sampleRate: ctx.sampleRate });

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true; // the buffer is an exact number of bars, so it loops seamlessly
    source.connect(ctx.destination);
    source.start();

    sourceRef.current = source;
    setPlaying(true);
  };

  const stop = () => {
    sourceRef.current?.stop();
    sourceRef.current = null;
    setPlaying(false);
  };

  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>Beatmatch Trainer</h1>

      <label>
        BPM:{" "}
        <input
          type="number"
          value={bpm}
          min={70}
          max={180}
          disabled={playing}
          onChange={(e) => setBpm(Number(e.target.value))}
        />
      </label>{" "}
      
      {playing ? (
        <button onClick={stop}>Strop</button>
      ) : (
        <button onClick={start}>Play loop</button>
      )}
    </div>
  );
}

