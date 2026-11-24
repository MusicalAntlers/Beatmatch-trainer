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
}