import { useState } from "react";
import {
  BarChart3,
  Pencil,
  FileSpreadsheet,
  Link2,
  TrendingUp,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Mail,
  ExternalLink,
  X,
  Loader2,
  Upload,
  RefreshCw,
} from "lucide-react";
/* ── Mini Design Tokens ───────────────────────────────────────────────── */
// Forest green dark theme matching try.ka.nz/hack
const BG = "#0a1f13";
const CARD = "#0e2818";
const CARD2 = "#122d1b"; // slightly lighter card for nested sections
const BORDER = "rgba(255,255,255,0.08)";
const AMBER = "#d4920f";
const AMBER_DIM = "rgba(212,146,15,0.12)";
const AMBER_TEXT = "#e8aa2a";
const TEXT = "#e8ede9";
const TEXT_MUTED = "rgba(232,237,233,0.45)";
const TEXT_SECTION = "rgba(232,237,233,0.7)";
const INPUT_BG = "rgba(0,0,0,0.25)";
const GREEN_GLOW = "rgba(34,197,94,0.15)";

type Tab = "manual" | "file" | "sheet";
type View = "form" | "result";

export function FullForm() {
  const [tab, setTab] = useState<Tab>("manual");
  const [view, setView] = useState<View>("form");

  return (
    <div
      className="min-h-screen w-full relative overflow-auto"
      style={{ background: BG, fontFamily: "'Inter', system-ui, sans-serif", color: TEXT }}
    >
      {/* Background grid texture */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)`,
          backgroundSize: "40px 40px",
        }}
      />
      {/* Radial glow top-center */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at center top, rgba(20,80,40,0.55) 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 max-w-xl mx-auto px-4 py-12">
        {/* ── Header ───────────────────────────────────────────── */}
        <div className="text-center mb-10">
          <p
            className="text-xs font-semibold tracking-[0.2em] uppercase mb-5"
            style={{ color: AMBER_TEXT }}
          >
            AI-Powered Financial Intelligence
          </p>

          {/* Icon */}
          <div className="flex justify-center mb-5">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{
                background: AMBER_DIM,
                border: `1px solid rgba(212,146,15,0.25)`,
              }}
            >
              <BarChart3 size={26} style={{ color: AMBER_TEXT }} />
            </div>
          </div>

          <h1 className="text-4xl font-bold tracking-tight" style={{ color: TEXT }}>
            Financial Statement{" "}
            <span className="italic" style={{ color: AMBER_TEXT }}>
              Analyser
            </span>
          </h1>
          <p className="mt-3 text-sm max-w-sm mx-auto" style={{ color: TEXT_MUTED }}>
            Enter figures manually, upload a spreadsheet, or connect a Google
            Sheet — AI does the rest.
          </p>
        </div>

        {/* ── Main Card ────────────────────────────────────────── */}
        <div
          className="rounded-2xl p-6 md:p-8"
          style={{
            background: CARD,
            border: `1px solid ${BORDER}`,
            boxShadow: "0 24px 64px rgba(0,0,0,0.45)",
          }}
        >
          {view === "form" ? (
            <FormView tab={tab} setTab={setTab} onSubmit={() => setView("result")} />
          ) : (
            <ResultView onReset={() => setView("form")} />
          )}
        </div>

        {/* Footer */}
        <p className="mt-5 text-center text-xs" style={{ color: TEXT_MUTED }}>
          Results are written to your Google Sheets dashboard and emailed to
          the CFO automatically.
        </p>
      </div>
    </div>
  );
}

/* ── Form View ──────────────────────────────────────────────────────────── */
function FormView({
  tab,
  setTab,
  onSubmit,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-6">
      {/* Period */}
      <Field label="Reporting Period">
        <DarkInput placeholder="e.g. Q2 2026" />
      </Field>

      {/* Notes */}
      <Field label="Notes" optional>
        <DarkTextarea placeholder="Any context — acquisitions, seasonality, one-off items..." rows={2} />
      </Field>

      <DividerLine />

      {/* Mode Selector */}
      <div>
        <SectionLabel>Financial Data</SectionLabel>
        <div
          className="flex items-center gap-1 mt-2 p-1 rounded-full w-fit"
          style={{ background: "rgba(0,0,0,0.3)", border: `1px solid ${BORDER}` }}
        >
          {(["manual", "file", "sheet"] as Tab[]).map((t) => {
            const icons: Record<Tab, React.ReactNode> = {
              manual: <Pencil size={13} />,
              file: <FileSpreadsheet size={13} />,
              sheet: <Link2 size={13} />,
            };
            const labels: Record<Tab, string> = {
              manual: "Manual",
              file: "Upload file",
              sheet: "Google Sheet",
            };
            const active = tab === t;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                style={{
                  background: active ? AMBER : "transparent",
                  color: active ? "#0a1f13" : TEXT_MUTED,
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {icons[t]}
                {labels[t]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      {tab === "manual" && <ManualTab />}
      {tab === "file" && <FileTab />}
      {tab === "sheet" && <SheetTab />}

      {/* Submit */}
      <button
        onClick={onSubmit}
        className="w-full flex items-center justify-center gap-2 rounded-full font-semibold text-sm py-3 transition-all"
        style={{
          background: AMBER,
          color: "#0a1f13",
          border: "none",
          cursor: "pointer",
          letterSpacing: "0.01em",
        }}
      >
        Generate Analysis
      </button>
    </div>
  );
}

/* ── Manual Tab ─────────────────────────────────────────────────────────── */
function ManualTab() {
  const incomeRows = [
    { label: "Revenue", value: "2,400,000" },
    { label: "Cost of Goods Sold", value: "960,000" },
    { label: "Gross Profit", value: "1,440,000" },
    { label: "Operating Expenses", value: "620,000" },
    { label: "Net Income", value: "820,000" },
  ];
  const balanceRows = [
    { label: "Total Current Assets", value: "3,100,000" },
    { label: "Total Current Liabilities", value: "890,000" },
    { label: "Total Assets", value: "5,200,000" },
    { label: "Total Equity", value: "4,310,000" },
  ];
  return (
    <div className="space-y-5">
      <TableSection title="Income Statement" rows={incomeRows} />
      <DividerLine />
      <TableSection title="Balance Sheet" rows={balanceRows} />
    </div>
  );
}

function TableSection({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: string }[];
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold tracking-wider uppercase" style={{ color: AMBER_TEXT }}>
          {title}
        </p>
        <button
          className="text-xs font-medium rounded-full px-2.5 py-1"
          style={{ color: AMBER_TEXT, background: AMBER_DIM, border: "none", cursor: "pointer" }}
        >
          + Add line
        </button>
      </div>
      {rows.map((row, i) => (
        <div key={i} className="flex gap-2 items-center">
          <input
            readOnly
            value={row.label}
            className="flex-1 rounded-xl text-xs px-3 py-2"
            style={{
              background: INPUT_BG,
              border: `1px solid ${BORDER}`,
              color: TEXT_SECTION,
              outline: "none",
            }}
          />
          <div className="relative w-36 shrink-0">
            <span
              className="absolute left-3 top-1/2 -translate-y-1/2 text-xs"
              style={{ color: TEXT_MUTED }}
            >
              $
            </span>
            <input
              readOnly
              value={row.value}
              className="w-full rounded-xl text-xs pl-6 pr-3 py-2"
              style={{
                background: INPUT_BG,
                border: `1px solid ${BORDER}`,
                color: TEXT,
                outline: "none",
              }}
            />
          </div>
          <button
            className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "rgba(255,255,255,0.05)", border: "none", cursor: "pointer", color: TEXT_MUTED }}
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

/* ── File Tab ───────────────────────────────────────────────────────────── */
function FileTab() {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed py-10 px-6 text-center"
      style={{ borderColor: "rgba(212,146,15,0.25)", background: "rgba(212,146,15,0.04)" }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center"
        style={{ background: AMBER_DIM }}
      >
        <Upload size={18} style={{ color: AMBER_TEXT }} />
      </div>
      <div>
        <p className="text-sm font-medium" style={{ color: TEXT }}>
          Drop file here or click to browse
        </p>
        <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>
          Excel (.xlsx, .xls) or CSV — each sheet becomes a section
        </p>
      </div>
    </div>
  );
}

/* ── Sheet Tab ──────────────────────────────────────────────────────────── */
function SheetTab() {
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          readOnly
          placeholder="https://docs.google.com/spreadsheets/d/..."
          className="flex-1 rounded-full text-xs px-4 py-2.5"
          style={{
            background: INPUT_BG,
            border: `1px solid ${BORDER}`,
            color: TEXT_MUTED,
            outline: "none",
          }}
        />
        <button
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
          style={{ background: AMBER, border: "none", cursor: "pointer" }}
        >
          <RefreshCw size={14} style={{ color: "#0a1f13" }} />
        </button>
      </div>
      <p className="text-xs" style={{ color: TEXT_MUTED }}>
        The sheet must be set to{" "}
        <strong style={{ color: TEXT_SECTION }}>Anyone with the link can view</strong>.
        Format: Column A = label, Column B = value.
      </p>
    </div>
  );
}

/* ── Result View ────────────────────────────────────────────────────────── */
function ResultView({ onReset }: { onReset: () => void }) {
  const metrics = [
    { label: "Gross Margin", value: "60.0%" },
    { label: "Net Margin", value: "34.2%" },
    { label: "Current Ratio", value: "3.48x" },
    { label: "Return on Equity", value: "19.0%" },
  ];
  const risks = [
    { text: "Revenue concentration risk — top 3 clients represent ~62% of revenue", sev: "Medium" },
    { text: "Operating expense growth outpacing revenue growth by 4% YoY", sev: "Low" },
  ];

  return (
    <div className="space-y-6">
      {/* Success header */}
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.25)" }}
        >
          <CheckCircle2 size={20} style={{ color: "#4ade80" }} />
        </div>
        <div>
          <h2 className="text-sm font-semibold" style={{ color: TEXT }}>
            Analysis Complete
          </h2>
          <p className="text-xs" style={{ color: TEXT_MUTED }}>
            Period: Q2 2026 · Jul 18, 2026, 10:18 PM
          </p>
        </div>
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-2">
        <span
          className="flex items-center gap-1.5 text-xs rounded-full px-3 py-1.5"
          style={{ background: "rgba(255,255,255,0.07)", border: `1px solid ${BORDER}`, color: TEXT_SECTION }}
        >
          <Mail size={12} />
          Emailed to cfo@company.com
        </span>
        <span
          className="flex items-center gap-1.5 text-xs rounded-full px-3 py-1.5 cursor-pointer"
          style={{ background: AMBER_DIM, border: `1px solid rgba(212,146,15,0.3)`, color: AMBER_TEXT }}
        >
          <ExternalLink size={12} />
          Open Dashboard
        </span>
      </div>

      <DividerLine />

      {/* Performance Summary */}
      <ResultSection icon={<TrendingUp size={14} />} title="Performance Summary">
        <p className="text-sm leading-relaxed" style={{ color: TEXT_SECTION }}>
          Q2 2026 demonstrates strong operational performance with revenue reaching $2.4M, representing a 18% year-over-year increase. Gross margins held steady at 60%, indicating effective cost management. Net income of $820K reflects disciplined spending and favourable market conditions.
        </p>
      </ResultSection>

      {/* Financial Position */}
      <ResultSection icon={<DollarSign size={14} />} title="Financial Position">
        <p className="text-sm leading-relaxed" style={{ color: TEXT_SECTION }}>
          The balance sheet remains robust with a current ratio of 3.48x, well above the 2.0x industry benchmark. Total equity of $4.31M provides a solid foundation for planned expansion initiatives in H2 2026.
        </p>
      </ResultSection>

      {/* Key Metrics */}
      <div className="space-y-3">
        <SectionLabel>Key Metrics</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          {metrics.map((m, i) => (
            <div
              key={i}
              className="rounded-xl px-3 py-3"
              style={{ background: CARD2, border: `1px solid ${BORDER}` }}
            >
              <p className="text-xs truncate" style={{ color: TEXT_MUTED }}>
                {m.label}
              </p>
              <p className="text-base font-semibold mt-0.5" style={{ color: AMBER_TEXT }}>
                {m.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Risk Factors */}
      <div className="space-y-3">
        <div className="flex items-center gap-1.5">
          <AlertTriangle size={14} style={{ color: AMBER_TEXT }} />
          <SectionLabel>Risk Factors</SectionLabel>
        </div>
        <ul className="space-y-2">
          {risks.map((r, i) => (
            <li key={i} className="flex items-start gap-2.5 text-xs" style={{ color: TEXT_SECTION }}>
              <span
                className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: AMBER_TEXT }}
              />
              <span>
                {r.text}
                <span
                  className="ml-1.5 text-[10px] rounded-full px-2 py-0.5 font-medium"
                  style={{ background: AMBER_DIM, color: AMBER_TEXT }}
                >
                  {r.sev}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <DividerLine />

      <button
        onClick={onReset}
        className="w-full flex items-center justify-center rounded-full font-semibold text-sm py-3"
        style={{ background: AMBER, color: "#0a1f13", border: "none", cursor: "pointer" }}
      >
        Analyse Another Period
      </button>
    </div>
  );
}

/* ── Shared helpers ─────────────────────────────────────────────────────── */
function Field({
  label,
  optional,
  children,
}: {
  label: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold" style={{ color: TEXT_SECTION }}>
        {label}
        {optional && (
          <span className="ml-1.5 font-normal text-[11px]" style={{ color: TEXT_MUTED }}>
            (optional)
          </span>
        )}
      </label>
      {children}
    </div>
  );
}

function DarkInput({ placeholder }: { placeholder: string }) {
  return (
    <input
      readOnly
      placeholder={placeholder}
      className="w-full rounded-xl text-sm px-4 py-2.5"
      style={{
        background: INPUT_BG,
        border: `1px solid ${BORDER}`,
        color: TEXT,
        outline: "none",
      }}
    />
  );
}

function DarkTextarea({ placeholder, rows }: { placeholder: string; rows?: number }) {
  return (
    <textarea
      readOnly
      placeholder={placeholder}
      rows={rows ?? 3}
      className="w-full rounded-xl text-sm px-4 py-2.5 resize-none"
      style={{
        background: INPUT_BG,
        border: `1px solid ${BORDER}`,
        color: TEXT,
        outline: "none",
      }}
    />
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-bold tracking-widest uppercase" style={{ color: AMBER_TEXT }}>
      {children}
    </p>
  );
}

function ResultSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span style={{ color: AMBER_TEXT }}>{icon}</span>
        <SectionLabel>{title}</SectionLabel>
      </div>
      {children}
    </div>
  );
}

function DividerLine() {
  return <hr style={{ borderColor: BORDER, borderTopWidth: 1 }} />;
}
