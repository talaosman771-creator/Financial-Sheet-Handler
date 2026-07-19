// ─────────────────────────────────────────────────────────────────────────────
// Trend history store
//
// Persists a compact snapshot of each analysed period to localStorage so the app
// can show how a business is trending over time — not just a single-period photo.
// Client-only (SPA); safe to call from the browser.
// ─────────────────────────────────────────────────────────────────────────────

import type { IndustryId, MetricKey } from "./industryBenchmarks";

const STORAGE_KEY = "fsh:trend-history:v1";
const MAX_SNAPSHOTS = 24;

export interface TrendSnapshot {
  period: string;
  industry: IndustryId;
  savedAt: number;
  score: number;
  metrics: Partial<Record<MetricKey, number>>;
}

export function loadHistory(): TrendSnapshot[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TrendSnapshot[]) : [];
  } catch {
    return [];
  }
}

function persist(list: TrendSnapshot[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(-MAX_SNAPSHOTS)));
  } catch {
    /* storage full or blocked — trend history is best-effort */
  }
}

/**
 * Insert or replace a snapshot (keyed by period + industry) and return the new
 * history, ordered oldest → newest.
 */
export function saveSnapshot(snap: TrendSnapshot): TrendSnapshot[] {
  const history = loadHistory();
  const idx = history.findIndex(s => s.period === snap.period && s.industry === snap.industry);
  if (idx >= 0) history[idx] = snap;
  else history.push(snap);
  history.sort((a, b) => a.savedAt - b.savedAt);
  persist(history);
  return history;
}

export function clearHistory(): TrendSnapshot[] {
  if (typeof window !== "undefined") {
    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }
  return [];
}

/** History for a given sector only — comparing across industries isn't meaningful. */
export function historyForIndustry(industry: IndustryId): TrendSnapshot[] {
  return loadHistory().filter(s => s.industry === industry);
}
