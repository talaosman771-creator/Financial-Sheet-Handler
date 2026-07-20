// ─────────────────────────────────────────────────────────────────────────────
// Red-flag & prioritized-action engine (SME-facing)
//
// Reads the industry-scored ratios + raw statement figures and surfaces the
// things a non-finance business owner actually needs to worry about — in plain
// language, ranked by how urgent they are, each with a concrete next action.
// ─────────────────────────────────────────────────────────────────────────────

import {
  scoreRatio,
  type IndustryId,
  type MetricKey,
} from "./industryBenchmarks";
import {
  extractRawFinancials,
  deriveMetricValues,
} from "@/components/HealthScore";
import { STATUS_COLORS } from "./statusColors";

type FinancialData = Record<string, Record<string, number>>;
interface KeyMetric { label: string; value: string | number; note?: string; }

export type Severity = "critical" | "high" | "medium" | "low";

export interface RedFlag {
  id: string;
  severity: Severity;
  title: string;   // short headline
  detail: string;  // plain-language explanation for a non-finance owner
  action: string;  // the single most useful next step
  metric?: string; // related ratio, if any
}

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

// Same traffic-light as everything else: red → orange → yellow → green.
export const severityColor: Record<Severity, string> = {
  critical: STATUS_COLORS.critical, // red
  high: STATUS_COLORS.warning,      // orange
  medium: STATUS_COLORS.caution,    // yellow
  low: STATUS_COLORS.healthy,       // green
};

// Plain-language templates for a weak/critical ratio, phrased for a business owner.
const RATIO_FLAGS: Partial<Record<MetricKey, { title: string; detail: string; action: string }>> = {
  currentRatio: {
    title: "Tight on short-term cash",
    detail: "You may not have enough in liquid assets to cover the bills due in the next 12 months.",
    action: "Chase overdue invoices and delay non-essential spend to rebuild a cash buffer.",
  },
  quickRatio: {
    title: "Liquidity leans on stock",
    detail: "Once you set aside inventory, there's little left to cover immediate obligations.",
    action: "Free up cash: convert slow stock and tighten payment terms with customers.",
  },
  grossMargin: {
    title: "Thin gross margin for your sector",
    detail: "What's left after the direct cost of your product/service is below the norm for your industry.",
    action: "Review pricing and supplier costs — a small price or cost move flows straight to profit.",
  },
  netMargin: {
    title: "Low bottom-line profitability",
    detail: "After all costs, very little of each sale becomes profit compared with peers in your sector.",
    action: "Audit overheads and discretionary spend; find the two or three biggest leaks first.",
  },
  operatingMargin: {
    title: "Core operations barely profitable",
    detail: "The day-to-day business is generating slim profit before financing and tax.",
    action: "Look at operating costs and process efficiency, not just headline revenue.",
  },
  debtToEquity: {
    title: "Carrying heavy debt",
    detail: "The business is financed by a lot of debt relative to owner equity, which raises risk if trading dips.",
    action: "Prioritise paying down the most expensive debt before taking on new borrowing.",
  },
  roe: {
    title: "Weak return on your investment",
    detail: "The money owners have put in is generating a below-par return for your industry.",
    action: "Compare this return with simply holding cash — where can capital work harder?",
  },
  roa: {
    title: "Assets aren't pulling their weight",
    detail: "The business owns a lot relative to the earnings it produces.",
    action: "Identify idle or underused assets that could be sold, rented out, or better utilised.",
  },
  inventoryTurnover: {
    title: "Stock is moving slowly",
    detail: "Inventory sits longer than is healthy for your sector — that's cash tied up on the shelf.",
    action: "Clear slow lines with promotions and order smaller, more frequent batches.",
  },
  dso: {
    title: "Customers are paying late",
    detail: "It's taking longer than the sector norm to collect cash after a sale.",
    action: "Tighten credit terms, send reminders earlier, and offer small early-payment incentives.",
  },
};

/** Build the ranked list of red flags for the current report. */
export function computeRedFlags(
  financialData: FinancialData,
  keyMetrics: KeyMetric[],
  industry: IndustryId
): RedFlag[] {
  const flags: RedFlag[] = [];
  const raw = extractRawFinancials(financialData);

  // ── Structural checks (independent of ratios) ──
  if (raw.equity < 0) {
    flags.push({
      id: "negative-equity",
      severity: "critical",
      title: "Negative equity — technically insolvent",
      detail: "Liabilities exceed everything the business owns. On paper, owners' stake is underwater.",
      action: "Speak to an accountant now about recapitalising or restructuring debt.",
    });
  }

  if (raw.netIncome < 0) {
    flags.push({
      id: "net-loss",
      severity: "critical",
      title: "Operating at a loss",
      detail: "The business spent more than it earned this period — every month at a loss burns cash.",
      action: "Find the fastest lever: cut the largest controllable cost or lift price on your best sellers.",
    });
  }

  if (raw.currentAssets > 0 && raw.currentLiab > 0 && raw.currentAssets < raw.currentLiab) {
    flags.push({
      id: "negative-working-capital",
      severity: "high",
      title: "Negative working capital",
      detail: "Short-term bills outweigh short-term assets — a cash crunch can hit even while profitable.",
      action: "Map the next 90 days of cash in vs out and close the gap before it forces a decision.",
      metric: "Working Capital",
    });
  }

  // ── Ratio-driven flags ──
  const derived = deriveMetricValues(financialData, keyMetrics);
  for (const key of Object.keys(derived) as MetricKey[]) {
    const value = derived[key];
    if (value === undefined) continue;
    const score = scoreRatio(key, value, industry);
    if (!score) continue;
    const template = RATIO_FLAGS[key];
    if (!template) continue;

    if (score.tier === "critical") {
      flags.push({
        id: `ratio-${key}`,
        severity: "high",
        title: template.title,
        detail: `${template.detail} (${score.vsIndustry.toLowerCase()}.)`,
        action: template.action,
        metric: score.label,
      });
    } else if (score.tier === "weak") {
      flags.push({
        id: `ratio-${key}`,
        severity: "medium",
        title: template.title,
        detail: `${template.detail} (${score.vsIndustry.toLowerCase()}.)`,
        action: template.action,
        metric: score.label,
      });
    }
  }

  // Stable sort: most urgent first, de-duplicated by id.
  const seen = new Set<string>();
  return flags
    .filter(f => (seen.has(f.id) ? false : (seen.add(f.id), true)))
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

/** A one-line health verdict for the SME, driven by the worst flags present. */
export function flagsHeadline(flags: RedFlag[]): { label: string; tone: Severity } {
  if (flags.some(f => f.severity === "critical")) return { label: "Needs urgent attention", tone: "critical" };
  if (flags.some(f => f.severity === "high")) return { label: "A few things to watch", tone: "high" };
  if (flags.length > 0) return { label: "Minor issues to tidy up", tone: "medium" };
  return { label: "No red flags — looking healthy", tone: "low" };
}
