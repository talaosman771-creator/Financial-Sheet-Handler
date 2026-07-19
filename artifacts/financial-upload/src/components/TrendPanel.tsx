import { useEffect, useMemo, useState } from "react";
import { TrendingUp, TrendingDown, Minus, History } from "lucide-react";
import {
  scoreRatio,
  tierColor,
  type IndustryId,
  type MetricKey,
} from "@/utils/industryBenchmarks";
import { scoreColor } from "@/components/HealthScore";
import {
  saveSnapshot,
  historyForIndustry,
  type TrendSnapshot,
} from "@/utils/trendStore";

interface Props {
  industry: IndustryId;
  current: TrendSnapshot;
}

const TRACKED: { key: MetricKey; label: string; unit: "%" | "x" | "days" }[] = [
  { key: "grossMargin", label: "Gross Margin", unit: "%" },
  { key: "netMargin", label: "Net Margin", unit: "%" },
  { key: "currentRatio", label: "Current Ratio", unit: "x" },
  { key: "debtToEquity", label: "Debt / Equity", unit: "x" },
];

/** Build an SVG polyline path from a series, normalised into the given box. */
function sparkPoints(values: number[], w: number, h: number, pad = 3): string {
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
  return values
    .map((v, i) => {
      const x = pad + i * stepX;
      const y = pad + (h - pad * 2) * (1 - (v - min) / span);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function fmtVal(v: number, unit: "%" | "x" | "days"): string {
  return unit === "%" ? `${v.toFixed(1)}%` : unit === "days" ? `${Math.round(v)}d` : `${v.toFixed(2)}x`;
}

export function TrendPanel({ industry, current }: Props) {
  const [history, setHistory] = useState<TrendSnapshot[]>([]);

  useEffect(() => {
    // Persist the current period, then reload this sector's series.
    saveSnapshot(current);
    setHistory(historyForIndustry(industry));
  }, [industry, current]);

  const scores = useMemo(() => history.map(h => h.score), [history]);

  if (history.length < 2) {
    return (
      <div className="flex items-center gap-2.5 text-sm text-muted-foreground rounded-xl px-3 py-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <History className="w-4 h-4 shrink-0" style={{ color: '#e8aa2a' }} />
        This period is saved. Analyse another period in the same industry to unlock trend tracking — you'll see whether each metric is improving or slipping over time.
      </div>
    );
  }

  const firstScore = scores[0];
  const lastScore = scores[scores.length - 1];
  const scoreDelta = lastScore - firstScore;

  return (
    <div className="space-y-5">
      {/* Health score trajectory */}
      <div className="rounded-xl px-4 py-3.5" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Health Score · {history.length} periods</span>
          <span
            className="text-xs font-semibold tabular-nums px-2 py-0.5 rounded-full"
            style={{
              color: scoreDelta >= 0 ? '#4ade80' : '#f87171',
              background: scoreDelta >= 0 ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)',
            }}
          >
            {scoreDelta >= 0 ? "▲ +" : "▼ "}{scoreDelta} over period
          </span>
        </div>
        <div className="flex items-end gap-3">
          <svg viewBox="0 0 240 48" preserveAspectRatio="none" className="w-full h-12">
            <polyline
              points={sparkPoints(scores, 240, 48)}
              fill="none"
              stroke={scoreColor(lastScore)}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="font-serif text-2xl font-semibold tabular-nums shrink-0" style={{ color: scoreColor(lastScore) }}>
            {lastScore}
          </span>
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
          <span>{history[0].period}</span>
          <span>{history[history.length - 1].period}</span>
        </div>
      </div>

      {/* Per-metric trajectories */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {TRACKED.map(({ key, label, unit }) => {
          const series = history.map(h => h.metrics[key]).filter((v): v is number => typeof v === "number");
          if (series.length < 2) return null;

          const first = series[0];
          const last = series[series.length - 1];
          // Direction by sector percentile, so it's correct for both higher- and lower-is-better metrics.
          const pFirst = scoreRatio(key, first, industry)?.percentile ?? 50;
          const pLast = scoreRatio(key, last, industry)?.percentile ?? 50;
          const improving = pLast > pFirst + 1;
          const declining = pLast < pFirst - 1;
          const dirColor = improving ? "#4ade80" : declining ? "#f87171" : "#9ca3af";
          const DirIcon = improving ? TrendingUp : declining ? TrendingDown : Minus;
          const lastTier = scoreRatio(key, last, industry);

          return (
            <div key={key} className="rounded-xl px-3.5 py-3" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[12px] font-medium text-foreground">{label}</span>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: dirColor }}>
                  <DirIcon className="w-3.5 h-3.5" />
                  {improving ? "Improving" : declining ? "Slipping" : "Flat"}
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <svg viewBox="0 0 120 28" preserveAspectRatio="none" className="w-full h-7">
                  <polyline
                    points={sparkPoints(series, 120, 28)}
                    fill="none"
                    stroke={lastTier ? tierColor(lastTier.tier) : dirColor}
                    strokeWidth={1.75}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="text-[13px] font-semibold tabular-nums shrink-0" style={{ color: lastTier ? tierColor(lastTier.tier) : '#e8edea' }}>
                  {fmtVal(last, unit)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
