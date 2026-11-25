// src/ui/Progress.tsx
//
// Progress view: daily averages for one level, as a trend line and a table

import { useMemo, useState } from "react";
import type { RoundResult } from "../engine/scoring";

type Metric = "score" | "timeToLockSec" | "phaseErrorMs";

const METRICS: Record<Metric, { label: string; unit: string; better: "higher" | "lower" }> = {
    score: { label: "Average score", unit: "", better: "higher" },
    timeToLockSec: { label: "Average time to lock", unit: " s", better: "lower" },
    phaseErrorMs: { label: "Average phase error", unit: " ms", better: "lower" },
};

interface DayStat {
    day: string;    // "2026-11-24"
    rounds: number;
    value: number;
}

/** Turns an ISO timestamp intoa local calendar day, like "2026-11-24". */
function localDay(iso: string): string {
    const d = new Date(iso);
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const date = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${month}-${date}`;
}

/** Groups one level's results by day and averages the chosen metric. */
function dailyAverages(results: RoundResult[], level: number, metric: Metric): DayStat[] {
    const byDay = new Map<string, number[]>();

    for (const r of results) {
        if (r.level !== level) continue;
        const value = metric === "phaseErrorMs" ? Math.abs(r.phaseErrorMs) : r[metric];
        const day = localDay(r.playedAt);
        const list = byDay.get(day) ?? [];
        list.push(value);
        byDay.set(day, list);
    }

    return [...byDay.entries()]
        .sort(([a], [b]) => a.localeCompare(b))     // oldest day first
        .map(([day, values]) => ({
            day,
            rounds: values.length,
            value: values.reduce((sum, v) => sum + v, 0) / values.length,
        }));
}

/** A small hand-drawn SVG line chart. */
function LineChart({ points, unit }: { points: DayStat[]; unit: string }) {
    if (points.length < 2) {
        return <p>Play on at least two different days to see a trend line.</p>;
    }

    const W = 480;
    const H = 180;
    const PAD = 36;
    const values = points.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;    // avoid dividing by zero if every day is equal

    // Convert a point's index and value into SVG coordinates.
    const x = (i: number) => PAD + (i * (W - 2 * PAD)) / (points.length - 1);
    const y = (v: number) => H - PAD - ((v - min) / span) * (H - 2 * PAD);

    const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ");

    return (
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto"}}>
            <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#bbb" />
            <path d ={path} fill="none" stroke="#2563eb" strokeWidth={2} />
            {points.map((p, i) => (
                <circle key={p.day} cx={x(i)} cy={y(p.value)} r={3.5} fill="2563eb" />
            ))}
            <text x={4} y={y(max) + 4} fontSize={11} fill="#666">
                {max.toFixed(0)}
                {unit}
            </text>
            {max !== min && (
                <text x={4} y={y(min) + 4} fontSize={11} fill="#666">
                    {min.toFixed(0)}
                    {unit}
                </text>
                )}
                <text x={PAD} y={H - 10} fontSize={11} fill="#666">
                    {points[0].day.slice(5)}
                </text>
                <text x={W - PAD} y={H-10} fontSize={11} fill="#666" textAnchor="end">
                    {points[0].day.slice(5)}
                </text>
        </svg>
    );
}

interface ProgressProps {
    results: RoundResult[];
    onClear: () => void;
}

export function Progress({ results, onClear }: ProgressProps) {
    const [level, setLevel] = useState(1);
    const [metric, setMetric] = useState<Metric>("score");

    // useMemo: only recalculate when the inputs change, not on every render.
    const days = useMemo(() => dailyAverages(results, level, metric), [results, level, metric]);
    const info = METRICS[metric];

    let trend: string | null = null;
    if (days.length >= 2) {
        const change = days[days.length - 1].value - days[0].value;
        const improved = info.better === "higher" ? change > 0 : change < 0;
        trend = `${improved ? "Improving" : "Not improving yet"}: ${change >= 0 ? "+" : ""}${change.toFixed(1)}${info.unit} since ${days[0].day}`;
    }

    const handleClear = () => {
        if (window.confirm("Delete all saved rounds? This can't be undone.")) onClear();
    };

    return (
        <section style={{ marginTop: 32 }}>
            <h2 style={{ fontSize: 16 }}>Progress ({results.length} saved rounds)</h2>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12}}>
                <select value={level} onChange={(e) => setLevel(Number(e.target.value))}>
                    {[1, 2, 3, 4].map((n) => (
                        <option key={n} value={n}>
                            Level {n}
                        </option>
                    ))}
                </select>
                <select value={metric} onChange={(e) => setMetric(e.target.value as Metric)}>
                    {(Object.keys(METRICS) as Metric[]).map((m) => (
                        <option key={m} value={m}>
                            {METRICS[m].label}
                        </option>
                    ))}
                </select>
            </div>

            {days.length === 0 ? (
                <p>No saved rounds for Level {level} yet.</p>
            ) : (
                <>
                {trend && <p style={{ fontWeight: 600 }}>{trend}</p>}
                <LineChart points={days} unit={info.unit} />
                
                <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14, marginTop: 8 }}>
                    <thead>
                        <tr style={{ textAlign: "left" }}>
                            <th>Day</th>
                            <th>Rounds</th>
                            <th>{info.label}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {days.map((d) => (
                            <tr key={d.day}>
                                <td>{d.day}</td>
                                <td>{d.rounds}</td>
                                <td>
                                    {d.value.toFixed(1)}
                                    {info.unit}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </>
        )}

        {results.length > 0 && (
            <button onClick={handleClear} style={{ marginTop: 12 }}>
                Clear saved history
            </button>        
        )}
        </section>
    );
}