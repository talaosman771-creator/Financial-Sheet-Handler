// ─────────────────────────────────────────────────────────────────────────────
// Industry-relative benchmark engine
//
// The single source of truth for "is this ratio good?" — scored against the
// norms of the user's *sector*, not flat absolute thresholds. A 15% net margin
// is a disaster for software but healthy for a grocer; this module encodes that.
//
// Consumed by: ratioMeta (per-ratio commentary), HealthScore (weighted score),
// the red-flags engine, the what-if simulator, and trend tracking.
// ─────────────────────────────────────────────────────────────────────────────

import { statusColor, statusFromTier } from "./statusColors";

export type IndustryId =
  | "retail"
  | "restaurant"
  | "software"
  | "services"
  | "manufacturing"
  | "construction"
  | "ecommerce"
  | "healthcare"
  | "general";

export interface IndustryOption {
  id: IndustryId;
  label: string;
  blurb: string;
}

/** SME-facing industry picker. Ordered by how common they are for small businesses. */
export const INDUSTRIES: IndustryOption[] = [
  { id: "general",       label: "General / Other",        blurb: "Balanced cross-industry norms" },
  { id: "retail",        label: "Retail",                 blurb: "Shops, stockists, distributors" },
  { id: "restaurant",    label: "Restaurant & Food",      blurb: "Cafés, restaurants, catering" },
  { id: "ecommerce",     label: "E-commerce",             blurb: "Online stores, DTC brands" },
  { id: "software",      label: "Software / SaaS",        blurb: "Apps, subscriptions, tech" },
  { id: "services",      label: "Professional Services",  blurb: "Agencies, consultancies, trades" },
  { id: "manufacturing", label: "Manufacturing",          blurb: "Producers, workshops, factories" },
  { id: "construction",  label: "Construction",           blurb: "Builders, contractors, trades" },
  { id: "healthcare",    label: "Healthcare",             blurb: "Clinics, practices, care" },
];

export const DEFAULT_INDUSTRY: IndustryId = "general";

// ── Metric definitions ───────────────────────────────────────────────────────

export type MetricKey =
  | "grossMargin"
  | "netMargin"
  | "operatingMargin"
  | "currentRatio"
  | "quickRatio"
  | "debtToEquity"
  | "roe"
  | "roa"
  | "inventoryTurnover"
  | "dso";

export type Tier = "excellent" | "good" | "fair" | "weak" | "critical";

/**
 * Cutoffs are 4 ascending boundaries splitting the number line into 5 tiers.
 * When higherIsBetter: values above cutoffs[3] are excellent, below cutoffs[0] critical.
 * When !higherIsBetter (e.g. leverage, DSO): the orientation flips.
 */
interface MetricDef {
  label: string;
  unit: "%" | "x" | "days";
  higherIsBetter: boolean;
  weight: number; // relative weight in the composite health score
  /** Per-industry cutoffs; `default` used when an industry has no override. */
  cutoffs: Partial<Record<IndustryId, [number, number, number, number]>> & {
    default: [number, number, number, number];
  };
}

// Cutoffs are [weak|critical edge, fair edge, good edge, excellent edge].
// Grounded in commonly-cited SME sector ranges; tuned for plausibility, not precision.
const METRICS: Record<MetricKey, MetricDef> = {
  grossMargin: {
    label: "Gross Margin",
    unit: "%",
    higherIsBetter: true,
    weight: 18,
    cutoffs: {
      default:       [10, 20, 35, 50],
      retail:        [15, 25, 35, 45],
      restaurant:    [55, 60, 65, 72], // food cost accounting: high gross, thin net
      ecommerce:     [25, 35, 45, 60],
      software:      [55, 65, 75, 85],
      services:      [30, 45, 60, 75],
      manufacturing: [15, 25, 35, 45],
      construction:  [10, 18, 26, 35],
      healthcare:    [30, 45, 55, 68],
    },
  },
  netMargin: {
    label: "Net Margin",
    unit: "%",
    higherIsBetter: true,
    weight: 20,
    cutoffs: {
      default:       [2, 5, 10, 18],
      retail:        [1, 3, 6, 10],
      restaurant:    [2, 5, 10, 15],
      ecommerce:     [2, 5, 10, 16],
      software:      [5, 12, 20, 30],
      services:      [5, 10, 18, 28],
      manufacturing: [3, 6, 10, 16],
      construction:  [2, 4, 7, 12],
      healthcare:    [4, 8, 14, 22],
    },
  },
  operatingMargin: {
    label: "Operating Margin",
    unit: "%",
    higherIsBetter: true,
    weight: 12,
    cutoffs: {
      default:       [3, 8, 15, 25],
      software:      [8, 15, 25, 35],
      services:      [8, 15, 22, 32],
      retail:        [2, 5, 9, 14],
      restaurant:    [4, 8, 13, 18],
    },
  },
  currentRatio: {
    label: "Current Ratio",
    unit: "x",
    higherIsBetter: true,
    weight: 16,
    cutoffs: {
      default:       [1.0, 1.5, 2.0, 2.5],
      restaurant:    [0.6, 0.9, 1.2, 1.6], // hospitality runs lean on current assets
      software:      [1.2, 1.8, 2.5, 3.5],
      construction:  [1.1, 1.4, 1.8, 2.4],
    },
  },
  quickRatio: {
    label: "Quick Ratio",
    unit: "x",
    higherIsBetter: true,
    weight: 8,
    cutoffs: {
      default:       [0.5, 0.8, 1.0, 1.5],
      software:      [1.0, 1.5, 2.0, 3.0],
      retail:        [0.3, 0.5, 0.8, 1.2],
    },
  },
  debtToEquity: {
    label: "Debt to Equity",
    unit: "x",
    higherIsBetter: false,
    weight: 16,
    cutoffs: {
      default:       [0.5, 1.0, 1.5, 2.5],
      software:      [0.3, 0.6, 1.0, 1.8],
      construction:  [0.8, 1.5, 2.2, 3.2], // capital-heavy, higher leverage normal
      manufacturing: [0.6, 1.2, 1.8, 2.8],
      healthcare:    [0.5, 1.0, 1.6, 2.6],
    },
  },
  roe: {
    label: "Return on Equity",
    unit: "%",
    higherIsBetter: true,
    weight: 12,
    cutoffs: {
      default:       [4, 8, 12, 20],
      software:      [8, 15, 25, 40],
      services:      [10, 18, 28, 40],
      retail:        [6, 10, 15, 22],
    },
  },
  roa: {
    label: "Return on Assets",
    unit: "%",
    higherIsBetter: true,
    weight: 8,
    cutoffs: {
      default:       [2, 5, 8, 12],
      software:      [5, 10, 16, 24],
      manufacturing: [2, 4, 7, 11],
    },
  },
  inventoryTurnover: {
    label: "Inventory Turnover",
    unit: "x",
    higherIsBetter: true,
    weight: 6,
    cutoffs: {
      default:       [2, 4, 6, 8],
      retail:        [4, 6, 9, 12],
      restaurant:    [12, 20, 30, 45], // perishables turn very fast
      ecommerce:     [4, 6, 9, 14],
      manufacturing: [3, 5, 7, 10],
    },
  },
  dso: {
    label: "Days Sales Outstanding",
    unit: "days",
    higherIsBetter: false,
    weight: 6,
    cutoffs: {
      default:       [30, 45, 60, 90],
      retail:        [5, 15, 30, 50],   // mostly cash/card at point of sale
      restaurant:    [2, 5, 10, 20],
      services:      [30, 45, 60, 90],
      construction:  [45, 60, 80, 110], // long payment cycles
    },
  },
};

// ── Scoring ──────────────────────────────────────────────────────────────────

export interface RatioScore {
  metric: MetricKey;
  label: string;
  value: number;
  unit: "%" | "x" | "days";
  industry: IndustryId;
  tier: Tier;
  /** 0–100 position within the sector's range (higher = better regardless of direction). */
  percentile: number;
  /** Weight this metric carries in the composite health score. */
  weight: number;
  /** Points earned (0..weight) for the composite score. */
  points: number;
  status: string;       // short SME-facing verdict
  vsIndustry: string;   // e.g. "top 20% for Retail" / "below the Retail norm"
}

const TIER_POINTS: Record<Tier, number> = {
  excellent: 1.0,
  good: 0.8,
  fair: 0.55,
  weak: 0.3,
  critical: 0.08,
};

const TIER_STATUS: Record<Tier, string> = {
  excellent: "Excellent",
  good: "Strong",
  fair: "Fair",
  weak: "Weak",
  critical: "Critical",
};

function industryLabel(id: IndustryId): string {
  return INDUSTRIES.find(i => i.id === id)?.label ?? "your sector";
}

function cutoffsFor(def: MetricDef, industry: IndustryId): [number, number, number, number] {
  return def.cutoffs[industry] ?? def.cutoffs.default;
}

/**
 * Map a value to a tier + a 0–100 sector percentile.
 * Percentile is a linear interpolation across the 5 tier bands, so it degrades
 * gracefully and is honest about being a sector-relative *position*, not a survey stat.
 */
function positionInBands(
  value: number,
  cutoffs: [number, number, number, number],
  higherIsBetter: boolean
): { tier: Tier; percentile: number } {
  const [c0, c1, c2, c3] = cutoffs;
  // Band edges from worst→best in the "higher is better" frame.
  const edges = higherIsBetter ? [c0, c1, c2, c3] : [c3, c2, c1, c0];
  const tiers: Tier[] = ["critical", "weak", "fair", "good", "excellent"];

  // Determine which of the 5 bands the value falls in.
  const above = (a: number, b: number) => (higherIsBetter ? a >= b : a <= b);

  let bandIndex = 0; // critical
  if (above(value, edges[3])) bandIndex = 4;
  else if (above(value, edges[2])) bandIndex = 3;
  else if (above(value, edges[1])) bandIndex = 2;
  else if (above(value, edges[0])) bandIndex = 1;

  // Percentile: place value within its band [bandIndex*20 .. bandIndex*20+20].
  const bandBase = bandIndex * 20;
  let frac = 0.5;
  const lo = bandIndex === 0 ? undefined : edges[bandIndex - 1];
  const hi = bandIndex === 4 ? undefined : edges[bandIndex];
  if (lo !== undefined && hi !== undefined && hi !== lo) {
    frac = (value - lo) / (hi - lo);
    if (!higherIsBetter) frac = (lo - value) / (lo - hi);
    frac = Math.max(0, Math.min(1, frac));
  } else if (bandIndex === 4) {
    frac = 0.75; // in the top band but we can't see the ceiling
  } else if (bandIndex === 0) {
    frac = 0.35;
  }

  const percentile = Math.round(Math.max(0, Math.min(100, bandBase + frac * 20)));
  return { tier: tiers[bandIndex], percentile };
}

/** Score a single ratio against its industry. Returns null if the metric is unknown. */
export function scoreRatio(
  metric: MetricKey,
  value: number,
  industry: IndustryId
): RatioScore | null {
  const def = METRICS[metric];
  if (!def) return null;

  const cutoffs = cutoffsFor(def, industry);
  const { tier, percentile } = positionInBands(value, cutoffs, def.higherIsBetter);
  const label = industryLabel(industry);

  const vsIndustry =
    percentile >= 80 ? `Top ${100 - percentile || 20}% for ${label}` :
    percentile >= 55 ? `Above the ${label} norm` :
    percentile >= 40 ? `Around the ${label} norm` :
    percentile >= 20 ? `Below the ${label} norm` :
                       `Well below the ${label} norm`;

  return {
    metric,
    label: def.label,
    value,
    unit: def.unit,
    industry,
    tier,
    percentile,
    weight: def.weight,
    points: def.weight * TIER_POINTS[tier],
    status: TIER_STATUS[tier],
    vsIndustry,
  };
}

/** Which metric a free-text ratio label maps to, so we can score API-returned metrics. */
export function metricKeyFromLabel(label: string): MetricKey | null {
  if (!label) return null;
  const k = label.toLowerCase();
  if (k.includes("gross margin") || k.includes("gross profit margin")) return "grossMargin";
  if (k.includes("operating margin") || k.includes("ebit margin")) return "operatingMargin";
  if (k.includes("net margin") || k.includes("net profit margin") || k.includes("profit margin")) return "netMargin";
  if (k.includes("quick ratio") || k.includes("acid test")) return "quickRatio";
  if (k.includes("current ratio")) return "currentRatio";
  if (k.includes("debt to equity") || k.includes("d/e") || k.includes("leverage")) return "debtToEquity";
  if (k.includes("return on equity") || k.includes("roe")) return "roe";
  if (k.includes("return on asset") || k.includes("roa")) return "roa";
  if (k.includes("inventory turnover")) return "inventoryTurnover";
  if (k.includes("receivable") || k.includes("debtor day") || k.includes("days outstanding") || k.includes("dso")) return "dso";
  return null;
}

export function tierColor(tier: Tier): string {
  // Canonical traffic-light lives in statusColors — this keeps ratio bars,
  // trends and the what-if readouts on the exact same green/yellow/orange/red.
  return statusColor(statusFromTier(tier));
}

export function getIndustryLabel(id: IndustryId): string {
  return industryLabel(id);
}

/** Expose a metric's industry median-ish midpoint (good/fair boundary) for display. */
export function industryReference(metric: MetricKey, industry: IndustryId): { mid: number; unit: string } | null {
  const def = METRICS[metric];
  if (!def) return null;
  const [, c1, c2] = cutoffsFor(def, industry);
  return { mid: (c1 + c2) / 2, unit: def.unit };
}
