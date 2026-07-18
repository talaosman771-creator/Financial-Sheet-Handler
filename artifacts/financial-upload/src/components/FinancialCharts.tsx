import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  RadialBarChart,
  RadialBar,
  CartesianGrid,
  LabelList,
} from "recharts";

// ── Types ────────────────────────────────────────────────────────────────────

type FinancialData = Record<string, Record<string, number>>;
interface KeyMetric { label: string; value: string | number; note?: string; }

interface Props {
  financialData: FinancialData;
  keyMetrics: KeyMetric[];
  period: string;
}

// ── Palette ──────────────────────────────────────────────────────────────────

const AMBER   = "#d4920f";
const AMBER_L = "#e8aa2a";
const GREEN   = "#4ade80";
const RED     = "#f87171";
const BLUE    = "#60a5fa";
const PURPLE  = "#a78bfa";
const TEAL    = "#2dd4bf";
const MUTED   = "rgba(232,237,233,0.18)";
const TEXT    = "rgba(232,237,233,0.65)";
const GRID    = "rgba(255,255,255,0.05)";
const CARD2   = "rgba(0,0,0,0.25)";
const BORDER  = "rgba(255,255,255,0.08)";

const PIE_COLORS = [AMBER, TEAL, BLUE, PURPLE, GREEN, RED, AMBER_L];

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Find a value in a section by matching any of the given keyword fragments */
function find(section: Record<string, number> | undefined, ...terms: string[]): number {
  if (!section) return 0;
  for (const [key, val] of Object.entries(section)) {
    const k = key.toLowerCase();
    if (terms.some(t => k.includes(t.toLowerCase()))) return Math.abs(val);
  }
  return 0;
}

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000)    return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function pct(n: number): string { return `${n.toFixed(1)}%`; }

/** Parse a metric value like "60.5%" or "3.48x" into a number */
function parseMetric(v: string | number): number {
  if (typeof v === "number") return v;
  const s = String(v).replace(/[%x,]/g, "").trim();
  return parseFloat(s) || 0;
}

const CustomTooltipStyle: React.CSSProperties = {
  background: "hsl(148,55%,9%)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 10,
  color: "rgba(232,237,233,0.9)",
  fontSize: 12,
  padding: "8px 12px",
};

function DarkTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={CustomTooltipStyle}>
      {label && <p style={{ fontWeight: 600, marginBottom: 4, color: AMBER_L }}>{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || TEXT }}>{p.name}: <strong>{fmt(p.value)}</strong></p>
      ))}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: CARD2, border: `1px solid ${BORDER}` }}>
      <p className="text-[11px] font-bold tracking-widest uppercase mb-4" style={{ color: AMBER_L }}>
        {title}
      </p>
      {children}
    </div>
  );
}

// ── Main Export ──────────────────────────────────────────────────────────────

export function FinancialCharts({ financialData, keyMetrics, period }: Props) {
  // Find income statement and balance sheet sections (flexible key matching)
  const incomeKey = Object.keys(financialData).find(k =>
    k.toLowerCase().includes("income") || k.toLowerCase().includes("p&l") || k.toLowerCase().includes("profit")
  );
  const balanceKey = Object.keys(financialData).find(k =>
    k.toLowerCase().includes("balance") || k.toLowerCase().includes("asset")
  );

  const income  = incomeKey  ? financialData[incomeKey]  : {};
  const balance = balanceKey ? financialData[balanceKey] : {};

  // Extract core income figures
  const revenue     = find(income, "revenue", "sales", "turnover", "income from");
  const cogs        = find(income, "cost of goods", "cogs", "cost of sales", "cost of revenue");
  const grossProfit = find(income, "gross profit") || Math.max(revenue - cogs, 0);
  const opex        = find(income, "operating exp", "opex", "selling", "general", "admin", "sg&a");
  const netIncome   = find(income, "net income", "net profit", "profit after", "net earnings");

  // Derive operating income if not directly available
  const operatingIncome = find(income, "operating income", "ebit") || Math.max(grossProfit - opex, 0);

  // All income items for expenses donut (exclude revenue and gross/net profit totals)
  const expenseItems = Object.entries(income).filter(([k]) => {
    const kl = k.toLowerCase();
    return !kl.includes("revenue") && !kl.includes("sales") && !kl.includes("turnover") &&
           !kl.includes("gross profit") && !kl.includes("net income") && !kl.includes("net profit") &&
           !kl.includes("operating income") && !kl.includes("ebit");
  }).map(([label, value]) => ({ label, value: Math.abs(value) }))
    .filter(d => d.value > 0);

  // Balance sheet figures
  const currentAssets       = find(balance, "current asset", "total current asset");
  const currentLiabilities  = find(balance, "current liabil", "total current liabil");
  const totalAssets         = find(balance, "total asset") || currentAssets;
  const totalLiabilities    = find(balance, "total liabil") || currentLiabilities;
  const equity              = find(balance, "equity", "net worth", "shareholders");
  const nonCurrentAssets    = Math.max(totalAssets - currentAssets, 0);
  const nonCurrentLiabilities = Math.max(totalLiabilities - currentLiabilities, 0);

  const hasIncome  = revenue > 0 || netIncome > 0;
  const hasBalance = totalAssets > 0 || currentAssets > 0;

  return (
    <div className="space-y-4 mt-2">
      {/* Row 1: Revenue/Profit bars + Expenses donut */}
      {hasIncome && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <RevenueAndProfitChart revenue={revenue} grossProfit={grossProfit} netIncome={netIncome} period={period} />
          <ExpensesDonutChart items={expenseItems} />
        </div>
      )}

      {/* Row 2: Profit Waterfall */}
      {hasIncome && revenue > 0 && (
        <ProfitWaterfallChart
          revenue={revenue}
          cogs={cogs}
          grossProfit={grossProfit}
          opex={opex}
          operatingIncome={operatingIncome}
          netIncome={netIncome}
        />
      )}

      {/* Row 3: Assets vs Liabilities + Balance structure */}
      {hasBalance && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <AssetsVsLiabilitiesChart
            currentAssets={currentAssets}
            nonCurrentAssets={nonCurrentAssets}
            currentLiabilities={currentLiabilities}
            nonCurrentLiabilities={nonCurrentLiabilities}
            equity={equity}
          />
          <BalanceStructureChart
            currentAssets={currentAssets}
            nonCurrentAssets={nonCurrentAssets}
            currentLiabilities={currentLiabilities}
            nonCurrentLiabilities={nonCurrentLiabilities}
            equity={equity}
          />
        </div>
      )}

      {/* Row 4: Ratio gauges */}
      {keyMetrics.length > 0 && <RatioGauges keyMetrics={keyMetrics} />}
    </div>
  );
}

// ── Chart 1: Revenue & Profit ─────────────────────────────────────────────────

function RevenueAndProfitChart({ revenue, grossProfit, netIncome, period }: {
  revenue: number; grossProfit: number; netIncome: number; period: string;
}) {
  const data = [
    { name: "Revenue",       value: revenue,     fill: AMBER },
    { name: "Gross Profit",  value: grossProfit, fill: TEAL },
    { name: "Net Income",    value: netIncome,   fill: GREEN },
  ].filter(d => d.value > 0);

  return (
    <ChartCard title="Revenue & Profit">
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} barCategoryGap="30%" margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="name" tick={{ fill: TEXT, fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: TEXT, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={fmt} width={52} />
          <Tooltip content={<DarkTooltip />} />
          <Bar dataKey="value" radius={[6, 6, 0, 0]} name={period}>
            {data.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ── Chart 2: Expenses Donut ───────────────────────────────────────────────────

function ExpensesDonutChart({ items }: { items: { label: string; value: number }[] }) {
  if (items.length === 0) return (
    <ChartCard title="Expenses by Category">
      <div className="h-[180px] flex items-center justify-center text-xs" style={{ color: TEXT }}>
        No expense breakdown available
      </div>
    </ChartCard>
  );

  const CustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: {
    cx: number; cy: number; midAngle: number; innerRadius: number; outerRadius: number; percent: number;
  }) => {
    if (percent < 0.06) return null;
    const RADIAN = Math.PI / 180;
    const r = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + r * Math.cos(-midAngle * RADIAN);
    const y = cy + r * Math.sin(-midAngle * RADIAN);
    return <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={10}>{pct(percent * 100)}</text>;
  };

  return (
    <ChartCard title="Expenses by Category">
      <div className="flex items-center gap-3">
        <div style={{ width: 140, height: 140, flexShrink: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={items} dataKey="value" nameKey="label" cx="50%" cy="50%"
                   innerRadius={38} outerRadius={65} paddingAngle={2}
                   labelLine={false} label={<CustomLabel cx={0} cy={0} midAngle={0} innerRadius={0} outerRadius={0} percent={0} />}>
                {items.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0];
                return (
                  <div style={CustomTooltipStyle}>
                    <p style={{ color: AMBER_L, fontWeight: 600 }}>{d.name}</p>
                    <p style={{ color: TEXT }}>{fmt(d.value as number)}</p>
                  </div>
                );
              }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 space-y-1.5 min-w-0">
          {items.slice(0, 5).map((item, i) => (
            <div key={i} className="flex items-center gap-1.5 min-w-0">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
              <span className="text-[10px] truncate" style={{ color: TEXT }}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </ChartCard>
  );
}

// ── Chart 3: Profit Waterfall ─────────────────────────────────────────────────

function ProfitWaterfallChart({ revenue, cogs, grossProfit, opex, operatingIncome, netIncome }: {
  revenue: number; cogs: number; grossProfit: number; opex: number;
  operatingIncome: number; netIncome: number;
}) {
  // Waterfall: invisible (base) bar + visible (amount) bar stacked
  type WaterfallEntry = { name: string; base: number; pos: number; neg: number; total: number; isTotal: boolean; };
  
  type StepType = "start" | "neg" | "total";
  const rawSteps = [
    { name: "Revenue",       value: revenue,     type: "start" as StepType },
    { name: "COGS",          value: -cogs,       type: "neg"   as StepType },
    { name: "Gross Profit",  value: grossProfit, type: "total" as StepType },
    { name: "Op. Expenses",  value: opex > 0 ? -opex : 0, type: "neg" as StepType },
    { name: "Net Income",    value: netIncome,   type: "total" as StepType },
  ];
  const steps = rawSteps.filter(s => s.value !== 0);

  let running = 0;
  const data: WaterfallEntry[] = steps.map(s => {
    if (s.type === "total") {
      const entry = { name: s.name, base: 0, pos: s.value, neg: 0, total: s.value, isTotal: true };
      running = s.value;
      return entry;
    }
    if (s.type === "start") {
      running = s.value;
      return { name: s.name, base: 0, pos: s.value, neg: 0, total: s.value, isTotal: false };
    }
    // neg step
    const start = running;
    running = running + s.value; // s.value is negative
    const entry = { name: s.name, base: Math.min(start, running), pos: 0, neg: Math.abs(s.value), total: running, isTotal: false };
    return entry;
  });

  return (
    <ChartCard title="Profit Bridge">
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} barCategoryGap="25%" margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="name" tick={{ fill: TEXT, fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: TEXT, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={fmt} width={52} />
          <Tooltip content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const d = data.find(r => r.name === label);
            if (!d) return null;
            return (
              <div style={CustomTooltipStyle}>
                <p style={{ color: AMBER_L, fontWeight: 600 }}>{label}</p>
                <p style={{ color: TEXT }}>{fmt(d.isTotal ? d.pos : (d.neg > 0 ? -d.neg : d.pos))}</p>
              </div>
            );
          }} />
          {/* Invisible base spacer */}
          <Bar dataKey="base" stackId="a" fill="transparent" />
          {/* Positive bars */}
          <Bar dataKey="pos" stackId="a" radius={[6, 6, 0, 0]}>
            {data.map((d, i) => <Cell key={i} fill={d.isTotal ? TEAL : AMBER} />)}
            <LabelList dataKey="pos" position="top" formatter={(v: number) => v > 0 ? fmt(v) : ""}
              style={{ fill: TEXT, fontSize: 10 }} />
          </Bar>
          {/* Negative bars (expenses) */}
          <Bar dataKey="neg" stackId="b" radius={[6, 6, 0, 0]}>
            {/* Offset trick: base already positions it */}
            {data.map((d, i) => <Cell key={i} fill={d.neg > 0 ? RED : "transparent"} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ── Chart 4: Assets vs Liabilities ───────────────────────────────────────────

function AssetsVsLiabilitiesChart({ currentAssets, nonCurrentAssets, currentLiabilities, nonCurrentLiabilities, equity }: {
  currentAssets: number; nonCurrentAssets: number;
  currentLiabilities: number; nonCurrentLiabilities: number; equity: number;
}) {
  const data = [
    { name: "Assets",      current: currentAssets, nonCurrent: nonCurrentAssets },
    { name: "Liabilities & Equity", current: currentLiabilities, nonCurrent: Math.max(nonCurrentLiabilities + equity, 0) },
  ].filter(d => d.current + d.nonCurrent > 0);

  if (data.length === 0) return null;

  return (
    <ChartCard title="Assets vs Liabilities">
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} barCategoryGap="35%" margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="name" tick={{ fill: TEXT, fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: TEXT, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={fmt} width={52} />
          <Tooltip content={<DarkTooltip />} />
          <Bar dataKey="current" name="Current" stackId="a" fill={AMBER} radius={[0, 0, 0, 0]}>
            <LabelList dataKey="current" position="inside" formatter={fmt}
              style={{ fill: "rgba(0,0,0,0.7)", fontSize: 10, fontWeight: 600 }} />
          </Bar>
          <Bar dataKey="nonCurrent" name="Non-Current / Equity" stackId="a" fill={BLUE} radius={[6, 6, 0, 0]}>
            <LabelList dataKey="nonCurrent" position="inside" formatter={fmt}
              style={{ fill: "rgba(255,255,255,0.8)", fontSize: 10, fontWeight: 600 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {/* Legend */}
      <div className="flex items-center gap-4 mt-2">
        {[{color: AMBER, label: "Current"}, {color: BLUE, label: "Non-Current / Equity"}].map((l, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: l.color }} />
            <span className="text-[10px]" style={{ color: TEXT }}>{l.label}</span>
          </div>
        ))}
      </div>
    </ChartCard>
  );
}

// ── Chart 5: Balance Sheet Structure ─────────────────────────────────────────

function BalanceStructureChart({ currentAssets, nonCurrentAssets, currentLiabilities, nonCurrentLiabilities, equity }: {
  currentAssets: number; nonCurrentAssets: number;
  currentLiabilities: number; nonCurrentLiabilities: number; equity: number;
}) {
  const totalAssets = currentAssets + nonCurrentAssets;
  const totalL = currentLiabilities + nonCurrentLiabilities + equity;
  const base = Math.max(totalAssets, totalL);
  if (base === 0) return null;

  const rows = [
    { name: "Current Assets",      value: currentAssets,      fill: AMBER,  pct: totalAssets ? currentAssets / totalAssets * 100 : 0 },
    { name: "Fixed Assets",        value: nonCurrentAssets,   fill: TEAL,   pct: totalAssets ? nonCurrentAssets / totalAssets * 100 : 0 },
    { name: "Current Liabilities", value: currentLiabilities, fill: RED,    pct: totalL ? currentLiabilities / totalL * 100 : 0 },
    { name: "Long-term Liabilities",value: nonCurrentLiabilities, fill: PURPLE, pct: totalL ? nonCurrentLiabilities / totalL * 100 : 0 },
    { name: "Equity",              value: equity,             fill: GREEN,  pct: totalL ? equity / totalL * 100 : 0 },
  ].filter(r => r.value > 0);

  return (
    <ChartCard title="Balance Sheet Structure">
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i}>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px]" style={{ color: TEXT }}>{r.name}</span>
              <span className="text-[10px] font-medium" style={{ color: "rgba(232,237,233,0.85)" }}>{fmt(r.value)}</span>
            </div>
            <div className="h-3 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.min(r.pct, 100)}%`, background: r.fill }}
              />
            </div>
          </div>
        ))}
      </div>
    </ChartCard>
  );
}

// ── Chart 6: Financial Ratio Gauges ──────────────────────────────────────────

function RatioGauges({ keyMetrics }: { keyMetrics: KeyMetric[] }) {
  // Pick up to 4 gauges from key_metrics
  const gaugeMetrics = keyMetrics
    .filter(m => {
      const v = String(m.value);
      return v.includes("%") || v.includes("x") || !isNaN(Number(v));
    })
    .slice(0, 4);

  if (gaugeMetrics.length === 0) return null;

  return (
    <ChartCard title="Financial Ratio Gauges">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {gaugeMetrics.map((m, i) => (
          <GaugeItem key={i} metric={m} index={i} />
        ))}
      </div>
    </ChartCard>
  );
}

function GaugeItem({ metric, index }: { metric: KeyMetric; index: number }) {
  const raw = parseMetric(metric.value);
  const isPercent = String(metric.value).includes("%");
  const isMultiple = String(metric.value).includes("x");

  // Normalise to 0-100 for the radial gauge
  let normalised: number;
  let max: number;
  let displayVal: string;

  if (isPercent) {
    max = 100;
    normalised = Math.min(Math.max(raw, 0), 100);
    displayVal = `${raw.toFixed(1)}%`;
  } else if (isMultiple) {
    max = 5;
    normalised = Math.min(Math.max(raw / max * 100, 0), 100);
    displayVal = `${raw.toFixed(2)}x`;
  } else {
    max = Math.max(raw * 1.5, 10);
    normalised = Math.min((raw / max) * 100, 100);
    displayVal = raw.toFixed(2);
  }

  const GAUGE_COLORS = [AMBER, TEAL, GREEN, BLUE];
  const color = GAUGE_COLORS[index % GAUGE_COLORS.length];

  const data = [
    { name: metric.label, value: normalised, fill: color },
    { name: "empty", value: 100 - normalised, fill: "rgba(255,255,255,0.05)" },
  ];

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: 90, height: 90 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%" cy="50%"
            innerRadius="65%"
            outerRadius="100%"
            startAngle={200}
            endAngle={-20}
            data={data}
            barSize={10}
          >
            <RadialBar dataKey="value" cornerRadius={5} background={false}>
              {data.map((d, i) => <Cell key={i} fill={d.fill} />)}
            </RadialBar>
          </RadialBarChart>
        </ResponsiveContainer>
        {/* Center label */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-bold" style={{ color }}>{displayVal}</span>
        </div>
      </div>
      <p className="text-[10px] text-center mt-1 leading-tight" style={{ color: TEXT }}>
        {metric.label}
      </p>
    </div>
  );
}
