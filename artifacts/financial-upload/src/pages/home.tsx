import { useState, useCallback, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import * as XLSX from "xlsx";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart3,
  CheckCircle2,
  ExternalLink,
  FileSpreadsheet,
  Link2,
  Loader2,
  Mail,
  Pencil,
  Upload,
  AlertTriangle,
  Activity,
  DollarSign,
  TrendingUp,
  X,
  RefreshCw,
  FileDown,
  Sheet,
  Lightbulb,
  ListChecks,
} from "lucide-react";
import { toast } from "sonner";

import { FinancialCharts, GaugeItem } from "@/components/FinancialCharts";
import { HealthScore, calculateHealthScore, scoreColor } from "@/components/HealthScore";
import { FinancialChatbot } from "@/components/FinancialChatbot";
import { exportPDF } from "@/utils/exportPDF";
import { exportExcel } from "@/utils/exportExcel";
import { getRatioMeta, parseRatioValue } from "@/utils/ratioMeta";
import {
  INDUSTRIES,
  DEFAULT_INDUSTRY,
  scoreRatio,
  metricKeyFromLabel,
  tierColor,
  getIndustryLabel,
  type IndustryId,
} from "@/utils/industryBenchmarks";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  computeRedFlags,
  flagsHeadline,
  severityColor,
  type RedFlag,
} from "@/utils/redFlags";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

// ── Constants ────────────────────────────────────────────────────────────────

const WEBHOOK_URL = `${import.meta.env.BASE_URL}api/analyze`;

// ── Types ────────────────────────────────────────────────────────────────────

type InputMode = "manual" | "file" | "sheet";

type FinancialData = Record<string, Record<string, number>>;

interface KeyMetricRaw {
  metric: string;      // API field name
  label?: string;      // fallback if already normalised
  value: string | number;
  trend?: string;
  benchmark?: string;
  commentary?: string;
  note?: string;
}

interface CashFlowForecast {
  period: string;
  projected_inflow: string | number;
  projected_outflow: string | number;
  net_cash_flow: string | number;
  ending_balance: string | number;
  commentary?: string;
}

interface Opportunity {
  opportunity: string;
  potential_impact?: string;
  rationale?: string;
}

interface Recommendation {
  area: string;
  recommendation: string;
  priority?: string;
  justification?: string;
}

interface ReportResponse {
  success: boolean;
  period: string;
  generated_at: string;
  email_sent_to?: string;
  dashboard_url?: string;
  report: {
    performance_summary: string;
    financial_position: string;
    key_metrics: KeyMetricRaw[];
    cash_flow_forecast?: CashFlowForecast[];
    risks: Array<{ risk: string; severity?: string; likelihood?: string; mitigation?: string } | string>;
    opportunities?: Opportunity[];
    recommendations?: Recommendation[];
  };
}

/** Normalise the API's key_metrics (field is `metric`) into the shape the rest of the UI expects (`label`) */
function normaliseKeyMetrics(raw: KeyMetricRaw[]): Array<{ label: string; value: string | number; note?: string }> {
  return (raw ?? []).map(m => ({
    label: m.metric ?? m.label ?? "",
    value: m.value,
    note: m.commentary ?? m.benchmark ?? m.note,
  }));
}

const baseSchema = z.object({
  periodLabel: z.string().min(1, "Reporting period is required (e.g. Q2 2026)"),
  industry: z.string().min(1, "Pick your industry so benchmarks match your sector"),
  notes: z.string().optional(),
});

type BaseValues = z.infer<typeof baseSchema>;

// ── Excel / CSV Parsers ──────────────────────────────────────────────────────

function parseWorkbook(workbook: XLSX.WorkBook): FinancialData {
  const result: FinancialData = {};

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    const section: Record<string, number> = {};

    for (const row of rows) {
      if (!Array.isArray(row) || row.length < 2) continue;
      const label = String(row[0] ?? "").trim();
      const rawVal = row[1];
      if (!label || label.toLowerCase() === "label" || label.toLowerCase() === "item") continue;
      const num = typeof rawVal === "number" ? rawVal : parseFloat(String(rawVal ?? "").replace(/[,$]/g, ""));
      if (!isNaN(num) && label) {
        section[label] = num;
      }
    }

    if (Object.keys(section).length > 0) {
      result[sheetName] = section;
    }
  }

  return result;
}

function parseCsv(csvText: string, sectionName = "Financial Data"): FinancialData {
  const lines = csvText.split(/\r?\n/).filter(Boolean);
  const section: Record<string, number> = {};

  for (const line of lines) {
    const [rawLabel, rawVal] = line.split(",");
    if (!rawLabel || !rawVal) continue;
    const label = rawLabel.trim().replace(/^"|"$/g, "");
    if (!label || label.toLowerCase() === "label" || label.toLowerCase() === "item") continue;
    const num = parseFloat(rawVal.trim().replace(/[,"$]/g, ""));
    if (!isNaN(num)) {
      section[label] = num;
    }
  }

  return Object.keys(section).length > 0 ? { [sectionName]: section } : {};
}

function extractSheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

// ── Data Preview ─────────────────────────────────────────────────────────────

function DataPreview({ data, onClear }: { data: FinancialData; onClear: () => void }) {
  const fmt = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  const totalSections = Object.keys(data).length;
  const totalRows = Object.values(data).reduce((s, v) => s + Object.keys(v).length, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2 }}
      className="space-y-3"
    >
      {/* Summary bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" style={{ color: '#4ade80' }} />
          <span className="text-sm font-medium text-foreground">
            {totalSections} section{totalSections !== 1 ? "s" : ""}, {totalRows} line item{totalRows !== 1 ? "s" : ""} loaded
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs gap-1 text-muted-foreground rounded-full"
          onClick={onClear}
        >
          <X className="w-3 h-3" />
          Clear
        </Button>
      </div>

      {/* Section breakdown */}
      <div className="rounded-xl border border-border overflow-hidden" style={{ background: 'rgba(0,0,0,0.2)' }}>
        {Object.entries(data).map(([section, items], si) => (
          <div key={section}>
            {si > 0 && <Separator />}
            <div className="px-4 py-2" style={{ background: 'rgba(0,0,0,0.15)' }}>
              <span className="text-xs font-bold tracking-widest uppercase text-accent">{section}</span>
            </div>
            <div className="px-4 pb-2">
              {Object.entries(items).map(([label, value]) => (
                <div key={label} className="flex items-center justify-between py-1">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <span className="text-xs font-medium text-foreground tabular-nums">{fmt(value)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ── File Drop Zone ────────────────────────────────────────────────────────────

function FileDropZone({
  onParsed,
  disabled,
}: {
  onParsed: (data: FinancialData, fileName: string) => void;
  disabled: boolean;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);

  const processFile = useCallback(
    async (file: File) => {
      if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
        toast.error("Please upload an Excel (.xlsx, .xls) or CSV file.");
        return;
      }
      setIsParsing(true);
      try {
        const buffer = await file.arrayBuffer();
        let data: FinancialData;

        if (file.name.endsWith(".csv")) {
          const text = new TextDecoder().decode(buffer);
          data = parseCsv(text, file.name.replace(/\.csv$/i, ""));
        } else {
          const workbook = XLSX.read(buffer, { type: "array" });
          data = parseWorkbook(workbook);
        }

        if (Object.keys(data).length === 0) {
          toast.error("No numeric data found. Check the file format: Column A = label, Column B = value.");
          return;
        }
        onParsed(data, file.name);
      } catch {
        toast.error("Failed to parse the file. Make sure it's a valid Excel or CSV file.");
      } finally {
        setIsParsing(false);
      }
    },
    [onParsed]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [disabled, processFile]
  );

  return (
    <label
      className={[
        "flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 cursor-pointer transition-all",
        isDragging ? "border-accent/60" : "border-accent/25 hover:border-accent/50",
        disabled ? "opacity-50 pointer-events-none" : "",
      ].join(" ")}
      style={{ background: isDragging ? 'rgba(212,146,15,0.06)' : 'rgba(212,146,15,0.03)' }}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
    >
      <input
        type="file"
        className="sr-only"
        accept=".xlsx,.xls,.csv"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) processFile(file);
          e.target.value = "";
        }}
      />
      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(212,146,15,0.12)' }}>
        {isParsing ? (
          <Loader2 className="w-5 h-5 animate-spin text-accent" />
        ) : (
          <Upload className="w-5 h-5 text-accent" />
        )}
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-foreground">
          {isParsing ? "Parsing file…" : "Drop file here or click to browse"}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">Excel (.xlsx, .xls) or CSV — each sheet becomes a section</p>
      </div>
    </label>
  );
}

// ── Google Sheet Input ────────────────────────────────────────────────────────

function GoogleSheetInput({
  onParsed,
  disabled,
}: {
  onParsed: (data: FinancialData) => void;
  disabled: boolean;
}) {
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleLoad() {
    const id = extractSheetId(url);
    if (!id) {
      toast.error("Could not find a spreadsheet ID in that URL. Make sure it's a Google Sheets link.");
      return;
    }
    setIsLoading(true);
    try {
      const exportUrl = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv`;
      const res = await fetch(exportUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const csv = await res.text();
      const data = parseCsv(csv, "Financial Data");
      if (Object.keys(data).length === 0) {
        toast.error("No numeric data found in the sheet. Format: Column A = label, Column B = value.");
        return;
      }
      onParsed(data);
      toast.success("Google Sheet loaded successfully.");
    } catch (err) {
      toast.error(
        "Could not load the sheet. Make sure it is shared publicly (Anyone with the link can view)."
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          placeholder="https://docs.google.com/spreadsheets/d/..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={disabled || isLoading}
          className="text-sm"
        />
        <Button
          type="button"
          onClick={handleLoad}
          disabled={disabled || isLoading || !url.trim()}
          className="shrink-0"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        The sheet must be set to <strong>Anyone with the link can view</strong>. Format: Column A = label, Column B = value. Each tab becomes a section.
      </p>
    </div>
  );
}

// ── Report View ───────────────────────────────────────────────────────────────

// Dashboard panel + section label primitives
function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl p-5 ${className}`}
      style={{ background: "rgba(255,255,255,0.045)", border: "1px solid rgba(255,255,255,0.11)" }}
    >
      {children}
    </div>
  );
}

function SectionLabel({ icon, children, hint }: { icon: React.ReactNode; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2 text-[11px] font-bold tracking-widest uppercase text-accent">
        {icon}
        {children}
      </div>
      {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
    </div>
  );
}

// Raw financial line items as a table
function FinancialTable({ data }: { data: FinancialData }) {
  const fmt = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  return (
    <div className="space-y-4">
      {Object.entries(data).map(([section, rows]) => (
        <div key={section}>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'rgba(212,146,15,0.85)' }}>{section}</p>
          <table className="w-full text-[13px]">
            <tbody>
              {Object.entries(rows).map(([label, val], i) => (
                <tr key={i} className="border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                  <td className="py-1.5 text-muted-foreground">{label}</td>
                  <td className="py-1.5 text-right font-medium text-foreground tabular-nums">{fmt(val)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

// Key ratios scored against the selected industry's norms.
function RatioTable({ metrics, industry }: { metrics: Array<{ label: string; value: string | number; note?: string }>; industry: IndustryId }) {
  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
          <th className="text-left font-semibold pb-2">Metric</th>
          <th className="text-right font-semibold pb-2">Value</th>
          <th className="text-left font-semibold pb-2 ps-4">vs {getIndustryLabel(industry)}</th>
        </tr>
      </thead>
      <tbody>
        {metrics.map((m, i) => {
          const key = m.label ? metricKeyFromLabel(m.label) : null;
          const score = key ? scoreRatio(key, parseRatioValue(m.value), industry) : null;
          const meta = m.label ? getRatioMeta(m.label) : null;
          return (
            <tr key={i} className="border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
              <td className="py-2 text-muted-foreground align-middle">{m.label}</td>
              <td className="py-2 text-right font-semibold text-accent tabular-nums align-middle">{String(m.value)}</td>
              <td className="py-2 ps-4 align-middle">
                {score ? (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold" style={{ color: tierColor(score.tier) }}>{score.status}</span>
                      <span className="text-[10px] tabular-nums text-muted-foreground">{score.vsIndustry}</span>
                    </div>
                    {/* Sector percentile bar */}
                    <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${score.percentile}%`, background: tierColor(score.tier) }} />
                    </div>
                  </div>
                ) : (
                  <span className="text-[11px]" style={{ color: 'rgba(212,146,15,0.85)' }}>
                    {meta ? meta.benchmark(parseRatioValue(m.value)) : (m.note ?? "—")}
                  </span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// Red flags + prioritized action plan, SME-facing.
function RedFlagsPanel({ flags }: { flags: RedFlag[] }) {
  const headline = flagsHeadline(flags);
  return (
    <Panel>
      <SectionLabel
        icon={<AlertTriangle className="w-3.5 h-3.5" />}
        hint={`${flags.length} flag${flags.length === 1 ? "" : "s"}`}
      >
        Red Flags &amp; Action Plan
      </SectionLabel>

      <div className="flex items-center gap-2 mb-3">
        <span
          className="text-sm font-semibold px-2.5 py-0.5 rounded-full"
          style={{ color: severityColor[headline.tone], background: `${severityColor[headline.tone]}1a` }}
        >
          {headline.label}
        </span>
      </div>

      {flags.length === 0 ? (
        <div className="flex items-center gap-2.5 text-sm text-muted-foreground rounded-xl px-3 py-3" style={{ background: 'rgba(134,195,74,0.08)', border: '1px solid rgba(134,195,74,0.2)' }}>
          <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: '#86c34a' }} />
          Nothing urgent stands out — your ratios sit at or above the norm for your sector.
        </div>
      ) : (
        <div className="space-y-2.5">
          {flags.map((f, i) => (
            <motion.div
              key={f.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05, duration: 0.3 }}
              className="rounded-xl px-3.5 py-3"
              style={{ background: 'rgba(0,0,0,0.2)', border: `1px solid ${severityColor[f.severity]}33`, borderLeft: `3px solid ${severityColor[f.severity]}` }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <span
                    className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 mt-0.5"
                    style={{ color: severityColor[f.severity], background: `${severityColor[f.severity]}1a` }}
                  >
                    {f.severity}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-foreground leading-snug">{f.title}</p>
                    <p className="text-[12px] text-muted-foreground leading-relaxed mt-0.5">{f.detail}</p>
                    <p className="text-[12px] leading-relaxed mt-1.5 flex items-start gap-1.5" style={{ color: 'rgba(232,237,233,0.85)' }}>
                      <Lightbulb className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: '#e8aa2a' }} />
                      <span><span className="font-semibold">Do this:</span> {f.action}</span>
                    </p>
                  </div>
                </div>
                {f.metric && (
                  <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">{f.metric}</span>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function ReportView({ data, financialData, industry, onReset }: { data: ReportResponse; financialData: FinancialData; industry: IndustryId; onReset: () => void }) {
  const fmt = (v: string | number) =>
    typeof v === "number"
      ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v)
      : String(v);

  const normalisedMetrics = normaliseKeyMetrics(data.report.key_metrics ?? []);
  const healthResult = calculateHealthScore(financialData, normalisedMetrics, industry);
  const redFlags = computeRedFlags(financialData, normalisedMetrics, industry);

  function handleDownloadPDF() {
    try {
      exportPDF({
        period: data.period,
        generated_at: data.generated_at,
        email_sent_to: data.email_sent_to ?? "",
        healthScore: healthResult.score,
        healthLabel: healthResult.label,
        report: { ...data.report, key_metrics: normalisedMetrics },
        financialData,
      });
    } catch {
      toast.error("PDF generation failed. Please try again.");
    }
  }

  function handleExportExcel() {
    try {
      exportExcel({
        period: data.period,
        generated_at: data.generated_at,
        email_sent_to: data.email_sent_to ?? "",
        dashboard_url: data.dashboard_url ?? "",
        healthScore: healthResult.score,
        healthLabel: healthResult.label,
        report: { ...data.report, key_metrics: normalisedMetrics },
        financialData,
      });
    } catch {
      toast.error("Excel export failed. Please try again.");
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-4"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)' }}>
            <CheckCircle2 className="w-5 h-5" style={{ color: '#4ade80' }} />
          </div>
          <div>
            <h2 className="font-serif text-xl font-semibold text-foreground leading-tight">Analysis Complete</h2>
            <p className="text-xs text-muted-foreground">
              Period: {data.period} &middot; {new Date(data.generated_at).toLocaleString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleDownloadPDF}
            className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1.5 transition-all hover:opacity-80"
            style={{ background: 'rgba(212,146,15,0.14)', border: '1px solid rgba(212,146,15,0.35)', color: '#d4920f' }}
          >
            <FileDown className="w-3.5 h-3.5" />PDF
          </button>
          <button
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1.5 transition-all hover:opacity-80"
            style={{ background: 'rgba(45,212,191,0.1)', border: '1px solid rgba(45,212,191,0.25)', color: '#2dd4bf' }}
          >
            <Sheet className="w-3.5 h-3.5" />Excel
          </button>
          <button
            onClick={onReset}
            className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1.5 transition-all hover:opacity-80"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(232,237,233,0.9)' }}
          >
            <RefreshCw className="w-3.5 h-3.5" />New
          </button>
        </div>
      </div>

      {/* Status chips */}
      {(data.email_sent_to || data.dashboard_url) && (
        <div className="flex flex-wrap gap-2">
          {data.email_sent_to && (
            <span className="inline-flex items-center gap-1.5 text-xs rounded-full px-3 py-1.5 text-muted-foreground" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <Mail className="w-3 h-3" />
              Emailed to {data.email_sent_to}
            </span>
          )}
          {data.dashboard_url && (
            <a href={data.dashboard_url} target="_blank" rel="noopener noreferrer">
              <span className="inline-flex items-center gap-1.5 text-xs rounded-full px-3 py-1.5 cursor-pointer text-accent" style={{ background: 'rgba(212,146,15,0.12)', border: '1px solid rgba(212,146,15,0.28)' }}>
                <ExternalLink className="w-3 h-3" />
                Open Dashboard
              </span>
            </a>
          )}
        </div>
      )}

      {/* Row 1 — Free-standing KPI indicators (no container) */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-x-4 gap-y-6 items-center py-2">
        <div className="col-span-2 lg:col-span-2">
          <HealthScore financialData={financialData} keyMetrics={normalisedMetrics} industry={industry} />
        </div>
        {normalisedMetrics.slice(0, 4).map((m, i) => (
          <GaugeItem key={i} metric={m} index={i} />
        ))}
      </div>

      {/* Row 1.5 — Red flags & action plan (SME priority) */}
      <RedFlagsPanel flags={redFlags} />

      {/* Row 2 — Condensed AI summary */}
      <Panel>
        <SectionLabel icon={<TrendingUp className="w-3.5 h-3.5" />}>AI Summary</SectionLabel>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
          <div className="md:border-r md:pr-8" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'rgba(212,146,15,0.85)' }}>Performance</p>
            <p className="text-[13px] text-muted-foreground leading-relaxed">{data.report.performance_summary}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'rgba(212,146,15,0.85)' }}>Position</p>
            <p className="text-[13px] text-muted-foreground leading-relaxed">{data.report.financial_position}</p>
          </div>
        </div>
      </Panel>

      {/* Row 3 — Charts */}
      <Panel>
        <SectionLabel icon={<BarChart3 className="w-3.5 h-3.5" />}>Visual Analysis</SectionLabel>
        <FinancialCharts
          financialData={financialData}
          keyMetrics={normalisedMetrics}
          period={data.period}
        />
      </Panel>

      {/* Row — Data tables (statements + ratios) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <Panel>
          <SectionLabel icon={<FileSpreadsheet className="w-3.5 h-3.5" />}>Financial Statements</SectionLabel>
          <FinancialTable data={financialData} />
        </Panel>
        {normalisedMetrics.length > 0 && (
          <Panel>
            <SectionLabel icon={<ListChecks className="w-3.5 h-3.5" />} hint={`vs ${getIndustryLabel(industry)} norms`}>Ratio Analysis</SectionLabel>
            <RatioTable metrics={normalisedMetrics} industry={industry} />
          </Panel>
        )}
      </div>

      {/* Row 4 — Risks / Opportunities / Recommendations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {data.report.risks?.length > 0 && (
          <Panel>
            <SectionLabel icon={<AlertTriangle className="w-3.5 h-3.5" />}>Risk Factors</SectionLabel>
            <ul className="space-y-2">
              {data.report.risks.map((r, i) => {
                const text = typeof r === "string" ? r : r.risk;
                const sev = typeof r === "object" ? r.severity : undefined;
                const mitigation = typeof r === "object" ? r.mitigation : undefined;
                return (
                  <li key={i} className="rounded-xl px-3 py-2.5 text-xs" style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.15)' }}>
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#f87171', marginTop: 5 }} />
                      <span className="text-foreground font-medium flex-1">{text}
                        {sev && <span className="ml-2 text-[10px] rounded-full px-2 py-0.5 font-semibold" style={{ background: 'rgba(248,113,113,0.15)', color: '#f87171' }}>{sev}</span>}
                      </span>
                    </div>
                    {mitigation && <p className="mt-1.5 ml-3.5 text-muted-foreground leading-relaxed">{mitigation}</p>}
                  </li>
                );
              })}
            </ul>
          </Panel>
        )}

        {(data.report.opportunities?.length ?? 0) > 0 && (
          <Panel>
            <SectionLabel icon={<Lightbulb className="w-3.5 h-3.5" />}>Opportunities</SectionLabel>
            <ul className="space-y-2">
              {data.report.opportunities?.map((o, i) => (
                <li key={i} className="rounded-xl px-3 py-2.5 text-xs" style={{ background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.14)' }}>
                  <div className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#4ade80', marginTop: 5 }} />
                    <span className="text-foreground font-medium flex-1">{o.opportunity}
                      {o.potential_impact && <span className="ml-2 text-[10px] rounded-full px-2 py-0.5 font-semibold" style={{ background: 'rgba(74,222,128,0.12)', color: '#4ade80' }}>{o.potential_impact}</span>}
                    </span>
                  </div>
                  {o.rationale && <p className="mt-1.5 ml-3.5 text-muted-foreground leading-relaxed">{o.rationale}</p>}
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {(data.report.recommendations?.length ?? 0) > 0 && (
          <Panel>
            <SectionLabel icon={<ListChecks className="w-3.5 h-3.5" />}>Recommendations</SectionLabel>
            <div className="space-y-2.5">
              {data.report.recommendations?.map((rec, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 12, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 0.15 + i * 0.09, type: "spring", stiffness: 300, damping: 20 }}
                  whileHover={{ y: -3, scale: 1.02 }}
                  className="rounded-2xl px-3.5 py-3 text-xs cursor-default"
                  style={{ background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.22)', boxShadow: '0 6px 18px rgba(0,0,0,0.25)' }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold tracking-wider uppercase" style={{ color: '#7cb3fb' }}>{rec.area}</span>
                    {rec.priority && <span className="text-[10px] rounded-full px-2 py-0.5 font-semibold" style={{ background: 'rgba(96,165,250,0.18)', color: '#7cb3fb' }}>{rec.priority}</span>}
                  </div>
                  <p className="text-foreground font-medium ml-0">{rec.recommendation}</p>
                  {rec.justification && <p className="mt-1 text-muted-foreground leading-relaxed">{rec.justification}</p>}
                </motion.div>
              ))}
            </div>
          </Panel>
        )}
      </div>

      {/* Row 5 — Cash flow forecast */}
      {(data.report.cash_flow_forecast?.length ?? 0) > 0 && (
        <Panel>
          <SectionLabel icon={<Activity className="w-3.5 h-3.5" />} hint="AI-projected · not guaranteed">Outlook &amp; Expectations</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {data.report.cash_flow_forecast?.map((cf, i) => {
              const inflow  = parseFloat(String(cf.projected_inflow).replace(/[,$]/g, "")) || 0;
              const outflow = parseFloat(String(cf.projected_outflow).replace(/[,$]/g, "")) || 0;
              const net     = parseFloat(String(cf.net_cash_flow).replace(/[,$,-]/g, "")) || 0;
              const isPositive = inflow >= outflow;
              return (
                <div key={i} className="rounded-xl px-3 py-2.5 text-xs" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-foreground">{cf.period}</span>
                    <span className="font-serif font-semibold text-base tabular-nums" style={{ color: isPositive ? '#4ade80' : '#f87171' }}>
                      {isPositive ? '+' : ''}{fmt(net)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                    <span>Inflow: <span className="text-foreground font-medium">{fmt(inflow)}</span></span>
                    <span>Outflow: <span className="text-foreground font-medium">{fmt(outflow)}</span></span>
                    {cf.ending_balance && <span className="col-span-2">Ending balance: <span className="text-foreground font-medium">{fmt(parseFloat(String(cf.ending_balance).replace(/[,$]/g, "")) || 0)}</span></span>}
                  </div>
                  {cf.commentary && <p className="mt-1.5 text-muted-foreground leading-relaxed">{cf.commentary}</p>}
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {/* Floating AI chat assistant — reads the full analysis context */}
      <FinancialChatbot
        context={{
          period: data.period,
          healthScore: healthResult.score,
          healthLabel: healthResult.label,
          performanceSummary: data.report.performance_summary,
          financialPosition: data.report.financial_position,
          keyMetrics: normalisedMetrics,
          risks: data.report.risks,
          financialData,
        }}
      />
    </motion.div>
  );
}

// ── Mode Tab ──────────────────────────────────────────────────────────────────

function ModeTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      ].join(" ")}
    >
      {icon}
      {label}
    </button>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

// ── Analysis progress steps ───────────────────────────────────────────────────

const ANALYSIS_STEPS = [
  { label: "Submitting financial data…",     pct: 8  },
  { label: "AI reading statements…",         pct: 22 },
  { label: "Calculating metrics…",           pct: 40 },
  { label: "Generating narrative report…",   pct: 58 },
  { label: "Writing to dashboard…",          pct: 75 },
  { label: "Preparing email dispatch…",      pct: 90 },
];

// Dev-only: seed the results view (with the chatbot) so the full UI can be
// previewed locally without the n8n backend. Enable via ?preview in the URL.
const PREVIEW =
  import.meta.env.DEV &&
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).has("preview");

const SAMPLE_FINANCIAL_DATA: FinancialData = {
  "Income Statement": {
    Revenue: 1250000,
    "Cost of Goods Sold": 720000,
    "Gross Profit": 530000,
    "Operating Expenses": 310000,
    "Net Income": 168000,
  },
  "Balance Sheet": {
    "Total Current Assets": 480000,
    "Total Current Liabilities": 210000,
    "Total Assets": 1350000,
    "Total Equity": 720000,
  },
};

const SAMPLE_REPORT: ReportResponse = {
  success: true,
  period: "Q2 2026",
  generated_at: "2026-07-19T12:00:00.000Z",
  email_sent_to: "cfo@example.com",
  report: {
    performance_summary:
      "Revenue grew a healthy 14% quarter-over-quarter while gross margin held steady at 42%. Net income of $168k reflects disciplined operating expense control, though marketing spend is trending up faster than revenue.",
    financial_position:
      "The balance sheet is solid: current assets more than double current liabilities, and equity funds over half of total assets. Liquidity is comfortable and leverage is moderate.",
    key_metrics: [
      { metric: "Current Ratio", value: "2.29", commentary: "Strong short-term liquidity" },
      { metric: "Gross Margin", value: "42.4%", commentary: "Above industry average" },
      { metric: "Net Profit Margin", value: "13.4%", commentary: "Healthy profitability" },
      { metric: "Debt-to-Equity", value: "0.88", commentary: "Moderate leverage" },
    ],
    risks: [
      { risk: "Operating expenses growing faster than revenue", severity: "Medium", mitigation: "Cap discretionary marketing until CAC payback improves." },
      { risk: "Customer concentration — top 3 clients are 38% of revenue", severity: "High", mitigation: "Accelerate mid-market pipeline to dilute concentration." },
    ],
    opportunities: [
      { opportunity: "Renegotiate supplier terms to lift gross margin", potential_impact: "+2-3% margin", rationale: "Volume has grown enough to unlock tier pricing." },
    ],
    recommendations: [
      { area: "Liquidity", recommendation: "Deploy idle cash into a short-term treasury ladder.", priority: "Low", justification: "Excess current assets are earning nothing." },
      { area: "Growth", recommendation: "Shift 15% of paid spend to retention.", priority: "Medium", justification: "Retention ROI is currently 3x acquisition." },
    ],
    cash_flow_forecast: [
      { period: "Q3 2026", projected_inflow: 1320000, projected_outflow: 1150000, net_cash_flow: 170000, ending_balance: 650000, commentary: "Seasonal uptick expected." },
      { period: "Q4 2026", projected_inflow: 1410000, projected_outflow: 1200000, net_cash_flow: 210000, ending_balance: 860000, commentary: "Holiday demand lifts inflow." },
      { period: "FY 2027", projected_inflow: 5900000, projected_outflow: 5050000, net_cash_flow: 850000, ending_balance: 1710000, commentary: "Full-year expansion, margins hold." },
      { period: "FY 2028", projected_inflow: 6800000, projected_outflow: 5700000, net_cash_flow: 1100000, ending_balance: 2810000, commentary: "Compounding growth, reinvestment tapers." },
    ],
  },
};

export default function Home() {
  const [mode, setMode] = useState<InputMode>("manual");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [report, setReport] = useState<ReportResponse | null>(PREVIEW ? SAMPLE_REPORT : null);
  const [submittedFinancialData, setSubmittedFinancialData] = useState<FinancialData>(PREVIEW ? SAMPLE_FINANCIAL_DATA : {});
  const [submittedIndustry, setSubmittedIndustry] = useState<IndustryId>(DEFAULT_INDUSTRY);
  const [parsedData, setParsedData] = useState<FinancialData | null>(null);
  const [parsedFileName, setParsedFileName] = useState<string | null>(null);

  const form = useForm<BaseValues>({
    resolver: zodResolver(baseSchema),
    defaultValues: { periodLabel: "", industry: DEFAULT_INDUSTRY, notes: "" },
  });

  // Manual entry financial data (same as before — kept minimal here)
  const [manualIncome, setManualIncome] = useState([
    { label: "Revenue", value: "" },
    { label: "Cost of Goods Sold", value: "" },
    { label: "Gross Profit", value: "" },
    { label: "Operating Expenses", value: "" },
    { label: "Net Income", value: "" },
  ]);
  const [manualBalance, setManualBalance] = useState([
    { label: "Total Current Assets", value: "" },
    { label: "Total Current Liabilities", value: "" },
    { label: "Total Assets", value: "" },
    { label: "Total Equity", value: "" },
  ]);

  function buildManualData(): FinancialData {
    const income: Record<string, number> = {};
    const balance: Record<string, number> = {};
    for (const r of manualIncome) {
      const n = parseFloat(r.value.replace(/,/g, ""));
      if (r.label && !isNaN(n)) income[r.label] = n;
    }
    for (const r of manualBalance) {
      const n = parseFloat(r.value.replace(/,/g, ""));
      if (r.label && !isNaN(n)) balance[r.label] = n;
    }
    const result: FinancialData = {};
    if (Object.keys(income).length) result["Income Statement"] = income;
    if (Object.keys(balance).length) result["Balance Sheet"] = balance;
    return result;
  }

  async function onSubmit(values: BaseValues) {
    let financialData: FinancialData;

    if (mode === "manual") {
      financialData = buildManualData();
      if (Object.keys(financialData).length === 0) {
        toast.error("Please enter at least one financial figure.");
        return;
      }
    } else {
      if (!parsedData || Object.keys(parsedData).length === 0) {
        toast.error("Please load a file or Google Sheet first.");
        return;
      }
      financialData = parsedData;
    }

    setIsSubmitting(true);
    setProgressPct(0);
    setProgressLabel(ANALYSIS_STEPS[0].label);

    // Advance through fake progress steps while waiting for the API
    let stepIdx = 0;
    progressTimer.current = setInterval(() => {
      stepIdx = Math.min(stepIdx + 1, ANALYSIS_STEPS.length - 1);
      setProgressPct(ANALYSIS_STEPS[stepIdx].pct);
      setProgressLabel(ANALYSIS_STEPS[stepIdx].label);
    }, 2800);

    try {
      const res = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodLabel: values.periodLabel,
          industry: values.industry,
          industryLabel: getIndustryLabel(values.industry as IndustryId),
          notes: values.notes || undefined,
          financialData,
        }),
      });

      if (!res.ok) throw new Error(`Webhook returned ${res.status}: ${res.statusText}`);
      const data: ReportResponse = await res.json();
      if (!data.success) throw new Error("Webhook returned success: false");

      clearInterval(progressTimer.current!);
      setProgressPct(100);
      setProgressLabel("Complete!");
      setSubmittedFinancialData(financialData);
      setSubmittedIndustry(values.industry as IndustryId);
      setTimeout(() => setReport(data), 400);
    } catch (err) {
      clearInterval(progressTimer.current!);
      toast.error(err instanceof Error ? err.message : "Submission failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleReset() {
    setReport(null);
    setParsedData(null);
    setParsedFileName(null);
    form.reset({ periodLabel: "", industry: DEFAULT_INDUSTRY, notes: "" });
    setMode("manual");
  }

  function switchMode(m: InputMode) {
    setMode(m);
    setParsedData(null);
    setParsedFileName(null);
  }

  return (
    <div className="min-h-screen w-full bg-background text-foreground relative overflow-hidden">

      {/* Background grid texture */}
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      {/* Radial glow top-center */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] pointer-events-none" style={{ background: 'radial-gradient(ellipse at center top, hsl(148,50%,18%) 0%, transparent 65%)' }} />

      <div className={`relative z-10 mx-auto px-4 py-12 md:py-16 transition-all ${report ? "max-w-6xl" : "max-w-xl"}`}>

        {/* Header — full hero on the form, compact brand row on the dashboard */}
        {report ? (
          <div className="flex items-center gap-2.5 mb-6">
            <div className="inline-flex items-center justify-center w-9 h-9 rounded-xl shrink-0" style={{ background: 'rgba(212,146,15,0.12)', border: '1px solid rgba(212,146,15,0.25)' }}>
              <BarChart3 className="w-5 h-5 text-accent" />
            </div>
            <span className="font-serif text-lg font-semibold text-foreground">
              Financial Statement <span className="italic text-accent">Analyser</span>
            </span>
          </div>
        ) : (
          <div className="text-center mb-10">
            <p className="text-xs font-bold tracking-[0.2em] uppercase text-accent mb-5">
              AI-Powered Financial Intelligence
            </p>
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-5" style={{ background: 'rgba(212,146,15,0.12)', border: '1px solid rgba(212,146,15,0.25)' }}>
              <BarChart3 className="w-7 h-7 text-accent" />
            </div>
            <h1 className="font-serif text-4xl md:text-5xl font-semibold tracking-tight text-foreground">
              Financial Statement{' '}
              <span className="italic font-medium text-accent">Analyser</span>
            </h1>
            <p className="mt-3 text-sm text-muted-foreground max-w-sm mx-auto">
              Enter figures manually, upload a spreadsheet, or connect a Google Sheet — AI does the rest.
            </p>
          </div>
        )}

        {/* Form card (narrow) / Dashboard (wide) */}
        <AnimatePresence mode="wait">
          {report ? (
            <ReportView key="report" data={report} financialData={submittedFinancialData} industry={submittedIndustry} onReset={handleReset} />
          ) : (
            <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="bg-card border border-card-border rounded-2xl p-6 md:p-8 shadow-2xl" style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.45)' }}>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

                    {/* Period + Notes */}
                    <div className="space-y-4">
                      <FormField
                        control={form.control}
                        name="periodLabel"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Reporting Period</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. Q2 2026" {...field} disabled={isSubmitting} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="industry"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Industry</FormLabel>
                            <Select
                              value={field.value}
                              onValueChange={field.onChange}
                              disabled={isSubmitting}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select your industry" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {INDUSTRIES.map(ind => (
                                  <SelectItem key={ind.id} value={ind.id}>
                                    <span className="font-medium">{ind.label}</span>
                                    <span className="text-muted-foreground text-xs ms-2">{ind.blurb}</span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <p className="text-[11px] text-muted-foreground mt-1">
                              Ratios are scored against norms for your sector — not generic averages.
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="notes"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Notes <span className="text-muted-foreground font-normal text-xs">(optional)</span></FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Any context — acquisitions, seasonality, one-off items..."
                                {...field}
                                disabled={isSubmitting}
                                rows={2}
                                className="resize-none text-sm"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <Separator />

                    {/* Mode selector */}
                    <div>
                      <p className="text-xs font-bold tracking-widest uppercase text-accent mb-3">Financial Data</p>
                      <div className="flex items-center gap-1 p-1 rounded-full w-fit" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.07)' }}>
                        <ModeTab active={mode === "manual"} onClick={() => switchMode("manual")} icon={<Pencil className="w-3.5 h-3.5" />} label="Manual" />
                        <ModeTab active={mode === "file"} onClick={() => switchMode("file")} icon={<FileSpreadsheet className="w-3.5 h-3.5" />} label="Upload file" />
                        <ModeTab active={mode === "sheet"} onClick={() => switchMode("sheet")} icon={<Link2 className="w-3.5 h-3.5" />} label="Google Sheet" />
                      </div>
                    </div>

                    {/* Mode content */}
                    <AnimatePresence mode="wait">
                      {mode === "manual" && (
                        <motion.div key="manual" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }} className="space-y-5">
                          {/* Income Statement */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-bold tracking-widest uppercase text-accent">Income Statement</p>
                              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-accent hover:text-accent rounded-full px-3" style={{ background: 'rgba(212,146,15,0.1)' }} onClick={() => setManualIncome([...manualIncome, { label: "", value: "" }])} disabled={isSubmitting}>
                                + Add line
                              </Button>
                            </div>
                            {manualIncome.map((row, i) => (
                              <div key={i} className="flex gap-2">
                                <Input className="text-sm h-9" placeholder="Line item" value={row.label} disabled={isSubmitting} onChange={e => setManualIncome(manualIncome.map((r, j) => j === i ? { ...r, label: e.target.value } : r))} />
                                <div className="relative w-36">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                                  <Input className="text-sm h-9 pl-6" placeholder="0" value={row.value} disabled={isSubmitting} onChange={e => setManualIncome(manualIncome.map((r, j) => j === i ? { ...r, value: e.target.value } : r))} />
                                </div>
                                <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive shrink-0" disabled={isSubmitting || manualIncome.length <= 1} onClick={() => setManualIncome(manualIncome.filter((_, j) => j !== i))}>
                                  <X className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            ))}
                          </div>

                          <Separator />

                          {/* Balance Sheet */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-bold tracking-widest uppercase text-accent">Balance Sheet</p>
                              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-accent hover:text-accent rounded-full px-3" style={{ background: 'rgba(212,146,15,0.1)' }} onClick={() => setManualBalance([...manualBalance, { label: "", value: "" }])} disabled={isSubmitting}>
                                + Add line
                              </Button>
                            </div>
                            {manualBalance.map((row, i) => (
                              <div key={i} className="flex gap-2">
                                <Input className="text-sm h-9" placeholder="Line item" value={row.label} disabled={isSubmitting} onChange={e => setManualBalance(manualBalance.map((r, j) => j === i ? { ...r, label: e.target.value } : r))} />
                                <div className="relative w-36">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                                  <Input className="text-sm h-9 pl-6" placeholder="0" value={row.value} disabled={isSubmitting} onChange={e => setManualBalance(manualBalance.map((r, j) => j === i ? { ...r, value: e.target.value } : r))} />
                                </div>
                                <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive shrink-0" disabled={isSubmitting || manualBalance.length <= 1} onClick={() => setManualBalance(manualBalance.filter((_, j) => j !== i))}>
                                  <X className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}

                      {mode === "file" && (
                        <motion.div key="file" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }} className="space-y-4">
                          <AnimatePresence mode="wait">
                            {parsedData ? (
                              <DataPreview key="preview" data={parsedData} onClear={() => { setParsedData(null); setParsedFileName(null); }} />
                            ) : (
                              <motion.div key="dropzone" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                <FileDropZone onParsed={(d, name) => { setParsedData(d); setParsedFileName(name); }} disabled={isSubmitting} />
                              </motion.div>
                            )}
                          </AnimatePresence>
                          {parsedFileName && (
                            <p className="text-xs text-muted-foreground text-center">
                              Loaded from: <span className="font-medium text-foreground">{parsedFileName}</span>
                            </p>
                          )}
                        </motion.div>
                      )}

                      {mode === "sheet" && (
                        <motion.div key="sheet" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }} className="space-y-4">
                          <GoogleSheetInput onParsed={(d) => setParsedData(d)} disabled={isSubmitting} />
                          <AnimatePresence>
                            {parsedData && (
                              <DataPreview data={parsedData} onClear={() => setParsedData(null)} />
                            )}
                          </AnimatePresence>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <AnimatePresence mode="wait">
                      {isSubmitting ? (
                        <motion.div
                          key="progress"
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className="space-y-3"
                        >
                          {/* Step label + percentage */}
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-muted-foreground truncate pr-2">{progressLabel}</p>
                            <p className="text-xs font-bold shrink-0" style={{ color: '#d4920f' }}>{progressPct}%</p>
                          </div>
                          {/* Track */}
                          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                            <motion.div
                              className="h-full rounded-full"
                              style={{ background: 'linear-gradient(90deg, hsl(38,88%,35%), hsl(38,88%,55%))' }}
                              animate={{ width: `${progressPct}%` }}
                              transition={{ duration: 0.7, ease: "easeOut" }}
                            />
                          </div>
                          {/* Step dots */}
                          <div className="flex items-center gap-1 justify-center">
                            {ANALYSIS_STEPS.map((s, i) => (
                              <div
                                key={i}
                                className="rounded-full transition-all duration-500"
                                style={{
                                  width: progressPct >= s.pct ? 8 : 5,
                                  height: progressPct >= s.pct ? 8 : 5,
                                  background: progressPct >= s.pct ? '#d4920f' : 'rgba(255,255,255,0.18)',
                                }}
                              />
                            ))}
                          </div>
                          <Button type="button" className="w-full" size="lg" disabled>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />AI Analysing…
                          </Button>
                        </motion.div>
                      ) : (
                        <motion.div key="submit" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                          <Button type="submit" className="w-full" size="lg">
                            Generate Analysis
                          </Button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </form>
                </Form>
            </motion.div>
          )}
        </AnimatePresence>

        {!report && (
          <p className="mt-5 text-center text-xs text-muted-foreground">
            Results are written to your Google Sheets dashboard and emailed to the CFO automatically.
          </p>
        )}
      </div>
    </div>
  );
}
