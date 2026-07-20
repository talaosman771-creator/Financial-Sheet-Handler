import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  scoreRatio,
  metricKeyFromLabel,
  DEFAULT_INDUSTRY,
  type IndustryId,
  type MetricKey,
} from "@/utils/industryBenchmarks";
import { statusColor, statusFromScore } from "@/utils/statusColors";

// ── Types ────────────────────────────────────────────────────────────────────

type FinancialData = Record<string, Record<string, number>>;
interface KeyMetric { label: string; value: string | number; note?: string; }

interface Props {
  financialData: FinancialData;
  keyMetrics: KeyMetric[];
  industry?: IndustryId;
}

// ── Score calculation ────────────────────────────────────────────────────────

function parseMetric(v: string | number | undefined | null): number {
  if (v === undefined || v === null) return 0;
  const s = String(v).replace(/[%x,$\s]/g, "").trim();
  return parseFloat(s) || 0;
}

function findMetric(metrics: KeyMetric[], ...terms: string[]): number | null {
  for (const m of metrics) {
    if (!m || !m.label) continue;
    const k = m.label.toLowerCase();
    if (terms.some(t => k.includes(t.toLowerCase()))) return parseMetric(m.value);
  }
  return null;
}

function findValue(section: Record<string, number> | undefined, ...terms: string[]): number {
  if (!section) return 0;
  for (const [key, val] of Object.entries(section)) {
    const k = key.toLowerCase();
    if (terms.some(t => k.includes(t.toLowerCase()))) return Math.abs(val);
  }
  return 0;
}

export interface ScoreResult {
  score: number;
  label: string;
  breakdown: { name: string; points: number; max: number; note: string }[];
}

export interface RawFinancials {
  revenue: number;
  cogs: number;
  grossProfit: number;
  netIncome: number;
  currentAssets: number;
  currentLiab: number;
  totalLiab: number;
  equity: number;
}

/** Pull the headline figures out of the raw statements, tolerant of naming variants. */
export function extractRawFinancials(financialData: FinancialData): RawFinancials {
  const incomeKey = Object.keys(financialData).find(k =>
    k.toLowerCase().includes("income") || k.toLowerCase().includes("p&l") || k.toLowerCase().includes("profit")
  );
  const balanceKey = Object.keys(financialData).find(k =>
    k.toLowerCase().includes("balance") || k.toLowerCase().includes("asset")
  );

  const income  = incomeKey  ? financialData[incomeKey]  : {};
  const balance = balanceKey ? financialData[balanceKey] : {};

  const revenue    = findValue(income, "revenue", "sales", "turnover");
  const cogs       = findValue(income, "cost of goods", "cogs", "cost of sales");
  const grossProfit = findValue(income, "gross profit") || Math.max(revenue - cogs, 0);
  const netIncome  = findValue(income, "net income", "net profit", "profit after");
  const currentAssets = findValue(balance, "current asset");
  const currentLiab   = findValue(balance, "current liabil");
  const totalLiab     = findValue(balance, "total liabil");
  const equity        = findValue(balance, "equity", "net worth");

  return { revenue, cogs, grossProfit, netIncome, currentAssets, currentLiab, totalLiab, equity };
}

/** Derive each scoreable metric's numeric value from key_metrics (preferred) or raw statements. */
export function deriveMetricValues(financialData: FinancialData, keyMetrics: KeyMetric[]): Partial<Record<MetricKey, number>> {
  const { revenue, grossProfit, netIncome, currentAssets, currentLiab, totalLiab, equity } =
    extractRawFinancials(financialData);

  const values: Partial<Record<MetricKey, number>> = {};

  const gm = findMetric(keyMetrics, "gross margin") ?? (revenue > 0 ? (grossProfit / revenue) * 100 : null);
  if (gm !== null) values.grossMargin = gm;

  const nm = findMetric(keyMetrics, "net margin", "profit margin") ?? (revenue > 0 ? (netIncome / revenue) * 100 : null);
  if (nm !== null) values.netMargin = nm;

  const cr = findMetric(keyMetrics, "current ratio") ?? (currentLiab > 0 ? currentAssets / currentLiab : null);
  if (cr !== null) values.currentRatio = cr;

  const de = findMetric(keyMetrics, "debt to equity", "d/e", "leverage") ??
    (equity > 0 && totalLiab > 0 ? totalLiab / equity : null);
  if (de !== null) values.debtToEquity = de;

  const roe = findMetric(keyMetrics, "return on equity", "roe");
  if (roe !== null) values.roe = roe;
  const roa = findMetric(keyMetrics, "return on asset", "roa");
  if (roa !== null) values.roa = roa;

  // Any other scoreable metric the API returned that we didn't derive above.
  for (const m of keyMetrics) {
    const key = m?.label ? metricKeyFromLabel(m.label) : null;
    if (key && values[key] === undefined) {
      const n = parseMetric(m.value);
      if (n !== 0 || String(m.value).trim().startsWith("0")) values[key] = n;
    }
  }

  return { revenue, netIncome, ...values } as Partial<Record<MetricKey, number>> & { revenue: number; netIncome: number };
}

export function calculateHealthScore(
  financialData: FinancialData,
  keyMetrics: KeyMetric[],
  industry: IndustryId = DEFAULT_INDUSTRY
): ScoreResult {
  const derived = deriveMetricValues(financialData, keyMetrics) as Partial<Record<MetricKey, number>> & { revenue: number; netIncome: number };
  const { revenue, netIncome } = derived;

  const breakdown: ScoreResult["breakdown"] = [];
  let totalPoints = 0;
  let totalMax = 0;

  const unitOf = (u: string, v: number) => u === "%" ? `${v.toFixed(1)}%` : u === "days" ? `${Math.round(v)}d` : `${v.toFixed(2)}x`;

  for (const key of Object.keys(derived) as MetricKey[]) {
    const value = derived[key];
    if (value === undefined) continue;
    const s = scoreRatio(key, value, industry);
    if (!s) continue;
    totalPoints += s.points;
    totalMax += s.weight;
    breakdown.push({ name: s.label, points: Math.round(s.points), max: s.weight, note: `${unitOf(s.unit, value)} · ${s.status}` });
  }

  let score = totalMax > 0 ? Math.round((totalPoints / totalMax) * 100) : 50;

  // Fallback: if no key_metrics, use rough revenue/netIncome ratio
  if (breakdown.length === 0) {
    if (revenue > 0 && netIncome > 0) {
      const margin = netIncome / revenue;
      score = Math.min(100, Math.round(30 + margin * 200));
    } else {
      score = 40; // neutral when no data
    }
  }

  const label =
    score >= 80 ? "Excellent" :
    score >= 65 ? "Good"      :
    score >= 50 ? "Fair"      :
    score >= 35 ? "Weak"      : "Critical";

  return { score, label, breakdown };
}

// ── Score color ──────────────────────────────────────────────────────────────

// Routes through the canonical traffic-light: green ≥70, yellow ≥50,
// orange ≥35, red below — so the score dial matches every other indicator.
export function scoreColor(score: number): string {
  return statusColor(statusFromScore(score));
}

// ── Component ────────────────────────────────────────────────────────────────

export function HealthScore({ financialData, keyMetrics, industry }: Props) {
  const result   = calculateHealthScore(financialData, keyMetrics, industry);
  const color    = scoreColor(result.score);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const SIZE = 160;
  const CX   = SIZE / 2;
  const CY   = SIZE / 2;
  const R    = 64;
  const STROKE = 10;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, SIZE, SIZE);

    // Background track
    ctx.beginPath();
    ctx.arc(CX, CY, R, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = STROKE;
    ctx.stroke();

    // Score arc
    const startAngle = -Math.PI / 2;
    const endAngle   = startAngle + (result.score / 100) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(CX, CY, R, startAngle, endAngle);
    ctx.strokeStyle = color;
    ctx.lineWidth   = STROKE;
    ctx.lineCap     = "round";
    ctx.stroke();
  }, [result.score, color]);

  return (
    <div className="h-full flex flex-col items-center">
      <p className="text-[11px] font-bold tracking-widest uppercase self-center" style={{ color: '#e8aa2a' }}>
        Financial Health
      </p>

      <div className="flex-1 flex items-center justify-center py-2">
        <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
          <canvas ref={canvasRef} width={SIZE} height={SIZE} style={{ width: SIZE, height: SIZE }} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <motion.span
              className="font-serif text-5xl font-semibold leading-none tabular-nums"
              style={{ color }}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, type: "spring" }}
            >
              {result.score}
            </motion.span>
            <span className="text-xs mt-1.5" style={{ color: 'rgba(232,237,233,0.5)' }}>out of 100</span>
            <motion.span
              className="text-sm font-semibold mt-2 px-2.5 py-0.5 rounded-full"
              style={{ color, background: `${color}1a` }}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.4 }}
            >
              {result.label}
            </motion.span>
          </div>
        </div>
      </div>
    </div>
  );
}
