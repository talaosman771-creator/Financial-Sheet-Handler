import { useEffect, useRef } from "react";
import { motion } from "framer-motion";

// ── Types ────────────────────────────────────────────────────────────────────

type FinancialData = Record<string, Record<string, number>>;
interface KeyMetric { label: string; value: string | number; note?: string; }

interface Props {
  financialData: FinancialData;
  keyMetrics: KeyMetric[];
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

export function calculateHealthScore(financialData: FinancialData, keyMetrics: KeyMetric[]): ScoreResult {
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

  const breakdown: ScoreResult["breakdown"] = [];

  // ── 1. Gross Margin (20pts) ──
  const gmPct = findMetric(keyMetrics, "gross margin") ?? (revenue > 0 ? (grossProfit / revenue) * 100 : null);
  let gmPts = 0;
  if (gmPct !== null) {
    if (gmPct >= 50) gmPts = 20;
    else if (gmPct >= 35) gmPts = 16;
    else if (gmPct >= 20) gmPts = 12;
    else if (gmPct >= 10) gmPts = 7;
    else gmPts = 3;
    breakdown.push({ name: "Gross Margin", points: gmPts, max: 20, note: `${gmPct.toFixed(1)}%` });
  }

  // ── 2. Net Margin (20pts) ──
  const nmPct = findMetric(keyMetrics, "net margin", "profit margin") ?? (revenue > 0 ? (netIncome / revenue) * 100 : null);
  let nmPts = 0;
  if (nmPct !== null) {
    if (nmPct >= 20) nmPts = 20;
    else if (nmPct >= 12) nmPts = 16;
    else if (nmPct >= 7) nmPts = 12;
    else if (nmPct >= 3) nmPts = 7;
    else if (nmPct >= 0) nmPts = 3;
    else nmPts = 0;
    breakdown.push({ name: "Net Margin", points: nmPts, max: 20, note: `${nmPct.toFixed(1)}%` });
  }

  // ── 3. Current Ratio (20pts) ──
  const cr = findMetric(keyMetrics, "current ratio") ?? (currentLiab > 0 ? currentAssets / currentLiab : null);
  let crPts = 0;
  if (cr !== null) {
    if (cr >= 2.5) crPts = 20;
    else if (cr >= 2.0) crPts = 17;
    else if (cr >= 1.5) crPts = 13;
    else if (cr >= 1.0) crPts = 8;
    else crPts = 2;
    breakdown.push({ name: "Current Ratio", points: crPts, max: 20, note: `${cr.toFixed(2)}x` });
  }

  // ── 4. Debt-to-Equity (20pts) ──
  const de = findMetric(keyMetrics, "debt to equity", "d/e", "leverage") ??
    (equity > 0 && totalLiab > 0 ? totalLiab / equity : null);
  let dePts = 0;
  if (de !== null) {
    if (de <= 0.5) dePts = 20;
    else if (de <= 1.0) dePts = 16;
    else if (de <= 1.5) dePts = 11;
    else if (de <= 2.5) dePts = 6;
    else dePts = 2;
    breakdown.push({ name: "Debt / Equity", points: dePts, max: 20, note: `${de.toFixed(2)}x` });
  }

  // ── 5. Return on Equity / profitability (20pts) ──
  const roe = findMetric(keyMetrics, "return on equity", "roe", "return on asset", "roa");
  let roePts = 0;
  if (roe !== null) {
    if (roe >= 20) roePts = 20;
    else if (roe >= 12) roePts = 16;
    else if (roe >= 8) roePts = 12;
    else if (roe >= 4) roePts = 7;
    else if (roe >= 0) roePts = 3;
    else roePts = 0;
    breakdown.push({ name: "Return on Equity", points: roePts, max: 20, note: `${roe.toFixed(1)}%` });
  }

  // ── Normalise to available max ──
  const totalPoints = breakdown.reduce((s, b) => s + b.points, 0);
  const totalMax    = breakdown.reduce((s, b) => s + b.max, 0);

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

export function scoreColor(score: number): string {
  if (score >= 70) return "#4ade80";
  if (score >= 40) return "#d4920f";
  return "#f87171";
}

// ── Component ────────────────────────────────────────────────────────────────

export function HealthScore({ financialData, keyMetrics }: Props) {
  const result   = calculateHealthScore(financialData, keyMetrics);
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
