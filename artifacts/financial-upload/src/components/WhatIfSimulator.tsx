import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, RotateCcw } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import {
  calculateHealthScore,
  extractRawFinancials,
  scoreColor,
} from "@/components/HealthScore";
import {
  scoreRatio,
  tierColor,
  type IndustryId,
  type MetricKey,
} from "@/utils/industryBenchmarks";

type FinancialData = Record<string, Record<string, number>>;

interface Props {
  financialData: FinancialData;
  industry: IndustryId;
}

interface Levers {
  revenue: number; // percentage deltas, e.g. +10 => +10%
  cogs: number;
  opex: number;
  debt: number;
}

const ZERO: Levers = { revenue: 0, cogs: 0, opex: 0, debt: 0 };

/** Rebuild a scoreable financialData object from raw figures adjusted by the levers. */
function simulate(base: ReturnType<typeof extractRawFinancials>, levers: Levers): FinancialData {
  const revenue = base.revenue * (1 + levers.revenue / 100);
  // If COGS wasn't itemised, back it out of revenue − gross profit.
  const baseCogs = base.cogs || Math.max(base.revenue - base.grossProfit, 0);
  const cogs = baseCogs * (1 + levers.cogs / 100);
  const grossProfit = revenue - cogs;
  // Operating cost = what sits between gross profit and net income.
  const baseOpex = Math.max(base.grossProfit - base.netIncome, 0);
  const opex = baseOpex * (1 + levers.opex / 100);
  const netIncome = grossProfit - opex;

  const debtFactor = 1 + levers.debt / 100;
  const totalLiab = base.totalLiab * debtFactor;
  const currentLiab = base.currentLiab * debtFactor;

  return {
    "Income Statement": {
      Revenue: revenue,
      "Cost of Goods Sold": cogs,
      "Gross Profit": grossProfit,
      "Net Income": netIncome,
    },
    "Balance Sheet": {
      "Total Current Assets": base.currentAssets,
      "Total Current Liabilities": currentLiab,
      "Total Liabilities": totalLiab,
      "Total Equity": base.equity,
    },
  };
}

const LEVER_META: { key: keyof Levers; label: string; hint: string }[] = [
  { key: "revenue", label: "Revenue", hint: "sales up or down" },
  { key: "cogs", label: "Cost of Goods", hint: "supplier / production cost" },
  { key: "opex", label: "Operating Costs", hint: "overheads, payroll, admin" },
  { key: "debt", label: "Debt Load", hint: "borrowing up or down" },
];

const SIM_METRICS: { key: MetricKey; label: string }[] = [
  { key: "grossMargin", label: "Gross Margin" },
  { key: "netMargin", label: "Net Margin" },
  { key: "currentRatio", label: "Current Ratio" },
  { key: "debtToEquity", label: "Debt / Equity" },
];

export function WhatIfSimulator({ financialData, industry }: Props) {
  const [levers, setLevers] = useState<Levers>(ZERO);
  const base = useMemo(() => extractRawFinancials(financialData), [financialData]);

  // Baseline scored from raw figures (empty keyMetrics) so 0% adjustment == baseline.
  const baseline = useMemo(
    () => calculateHealthScore(simulate(base, ZERO), [], industry),
    [base, industry]
  );

  const simData = useMemo(() => simulate(base, levers), [base, levers]);
  const result = useMemo(() => calculateHealthScore(simData, [], industry), [simData, industry]);

  const delta = result.score - baseline.score;
  const touched = Object.values(levers).some(v => v !== 0);

  // Derive live metric values from the simulated statements.
  const income = simData["Income Statement"];
  const balance = simData["Balance Sheet"];
  const rev = income.Revenue || 0;
  const liveValues: Partial<Record<MetricKey, number>> = {
    grossMargin: rev ? (income["Gross Profit"] / rev) * 100 : 0,
    netMargin: rev ? (income["Net Income"] / rev) * 100 : 0,
    currentRatio: balance["Total Current Liabilities"] ? balance["Total Current Assets"] / balance["Total Current Liabilities"] : 0,
    debtToEquity: balance["Total Equity"] ? balance["Total Liabilities"] / balance["Total Equity"] : 0,
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-muted-foreground max-w-md leading-relaxed">
          Drag a lever to see how a change would move your health score and key ratios — before you commit to it.
        </p>
        {touched && (
          <button
            onClick={() => setLevers(ZERO)}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-full px-2.5 py-1 shrink-0 transition-all hover:opacity-80"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(232,237,233,0.9)' }}
          >
            <RotateCcw className="w-3 h-3" />Reset
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6 items-center">
        {/* Levers */}
        <div className="space-y-4">
          {LEVER_META.map(({ key, label, hint }) => (
            <div key={key}>
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-[13px] font-medium text-foreground">
                  {label} <span className="text-[11px] text-muted-foreground font-normal">— {hint}</span>
                </span>
                <span
                  className="text-[13px] font-semibold tabular-nums"
                  style={{ color: levers[key] === 0 ? 'rgba(232,237,233,0.5)' : levers[key] > 0 ? '#4ade80' : '#f87171' }}
                >
                  {levers[key] > 0 ? "+" : ""}{levers[key]}%
                </span>
              </div>
              <Slider
                value={[levers[key]]}
                min={-40}
                max={40}
                step={1}
                onValueChange={([v]) => setLevers(prev => ({ ...prev, [key]: v }))}
              />
            </div>
          ))}
        </div>

        {/* Simulated score dial */}
        <div className="flex flex-col items-center justify-center rounded-2xl px-6 py-4 min-w-[180px]" style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <span className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: '#e8aa2a' }}>
            {touched ? "Simulated Score" : "Health Score"}
          </span>
          <motion.span
            key={result.score}
            initial={{ scale: 0.85, opacity: 0.6 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", duration: 0.4 }}
            className="font-serif text-5xl font-semibold tabular-nums leading-none"
            style={{ color: scoreColor(result.score) }}
          >
            {result.score}
          </motion.span>
          <span className="text-[11px] mt-1" style={{ color: scoreColor(result.score) }}>{result.label}</span>
          {touched && (
            <span
              className="text-xs font-semibold mt-2 px-2 py-0.5 rounded-full tabular-nums"
              style={{
                color: delta >= 0 ? '#4ade80' : '#f87171',
                background: delta >= 0 ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)',
              }}
            >
              {delta >= 0 ? "▲ +" : "▼ "}{delta} vs now
            </span>
          )}
        </div>
      </div>

      {/* Live metric readouts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
        {SIM_METRICS.map(({ key, label }) => {
          const val = liveValues[key] ?? 0;
          const s = scoreRatio(key, val, industry);
          const isPct = key === "grossMargin" || key === "netMargin";
          return (
            <div key={key} className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
              <p className="font-serif text-lg font-semibold tabular-nums" style={{ color: s ? tierColor(s.tier) : '#e8edea' }}>
                {isPct ? `${val.toFixed(1)}%` : `${val.toFixed(2)}x`}
              </p>
              {s && <p className="text-[10px] mt-0.5" style={{ color: tierColor(s.tier) }}>{s.status}</p>}
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-muted-foreground mt-4 flex items-center gap-1.5">
        <Sparkles className="w-3 h-3" style={{ color: '#e8aa2a' }} />
        Estimates assume other factors hold constant — a directional guide, not a forecast.
      </p>
    </div>
  );
}
