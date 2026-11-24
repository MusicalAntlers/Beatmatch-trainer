// src/engine/HistoryStore.ts
//
// Saves round results in the browser's localStorage so they survive pase refreshes.
// localStorage only stores string, so results are converted to and from JSON.

import type { RoundResult } from "./scoring";

const STORAGE_KEY = "beatmatch-trainer.history.v1";     // "v1" lets you change the format later
const MAX_RESULTS = 2000;   // keep storage from growing forever

export class HistoryStore {
    private key: string;

    constructor(key = STORAGE_KEY) {
        this.key = key;
    }

    /** All saved results, oldest first. Returns [] if nothing is saved or storage is blocked. */
    load(): RoundResult[] {
        try {
            const raw = localStorage.getItem(this.key);
            if (!raw) return [];
            const parsed: unknown = JSON.parse(raw);
            return Array.isArray(parsed) ? (parsed as RoundResult[]) : [];
        } catch {
            return [];  // private browsing or corrupted data: start fresh
        }
    }

    /** Adds one result and returns the full updated list. */
    save(result: RoundResult): RoundResult[] {
        const all = [...this.load(), result].slice(-MAX_RESULTS);
        try {
            localStorage.setItem(this.key, JSON.stringify(all));
        } catch {
            // Storage full or blocked: the round still shows on screen, it just isn't savved
        }
        return all;
    }

    clear(): void {
        try {
            localStorage.removeItem(this.key);
        } catch {
            // Nothing to do it storage is blocked
        }
    }
}