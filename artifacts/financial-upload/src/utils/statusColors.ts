// ─────────────────────────────────────────────────────────────────────────────
// Status colours — the single source of truth for "is this good or bad?"
//
// One traffic-light the whole UI speaks, so a colour never means two things:
//   green  = healthy   (good / at or above the sector norm)
//   yellow = caution   (fine, but worth an eye)
//   orange = warning   (needs attention)
//   red    = critical  (urgent)
//   amber  = neutral   (a value with no good/bad signal — brand accent)
//
// Every chart, gauge, score dial, ratio bar, red-flag and trend indicator that
// signals health routes through here. Compositional charts (a revenue bar, an
// asset-mix pie) are magnitude — not good/bad — so they keep the brand palette.
// ─────────────────────────────────────────────────────────────────────────────

import type { Tier } from "./industryBenchmarks"; // type-only — erased at build, no runtime cycle

export type Status = "healthy" | "caution" | "warning" | "critical" | "neutral";

export const STATUS_COLORS: Record<Status, string> = {
  healthy:  "#4ade80", // green
  caution:  "#eab308", // yellow
  warning:  "#e0842e", // orange
  critical: "#f87171", // red
  neutral:  "#d4920f", // brand amber
};

export function statusColor(status: Status): string {
  return STATUS_COLORS[status];
}

/** Translucent tint of a status colour, for chip backgrounds / track fills. */
export function statusTint(status: Status, alpha = "1a"): string {
  return `${STATUS_COLORS[status]}${alpha}`;
}

/** Collapse the 5-tier industry score onto the 4-state traffic light. */
export function statusFromTier(tier: Tier): Status {
  switch (tier) {
    case "excellent":
    case "good":     return "healthy";
    case "fair":     return "caution";
    case "weak":     return "warning";
    case "critical": return "critical";
  }
}

/** Map a 0–100 composite health score onto the traffic light. */
export function statusFromScore(score: number): Status {
  if (score >= 70) return "healthy";
  if (score >= 50) return "caution";
  if (score >= 35) return "warning";
  return "critical";
}
