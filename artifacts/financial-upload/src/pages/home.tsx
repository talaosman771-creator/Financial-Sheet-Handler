import { useState, useCallback } from "react";
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
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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

interface ReportResponse {
  success: boolean;
  period: string;
  generated_at: string;
  email_sent_to: string;
  dashboard_url: string;
  report: {
    performance_summary: string;
    financial_position: string;
    key_metrics: Array<{ label: string; value: string | number; note?: string }>;
    cash_flow_forecast: Array<{ period: string; amount: string | number; note?: string }>;
    risks: Array<{ risk: string; severity?: string } | string>;
  };
}

const baseSchema = z.object({
  periodLabel: z.string().min(1, "Reporting period is required (e.g. Q2 2026)"),
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

function ReportView({ data, onReset }: { data: ReportResponse; onReset: () => void }) {
  const fmt = (v: string | number) =>
    typeof v === "number"
      ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v)
      : String(v);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-6"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)' }}>
          <CheckCircle2 className="w-5 h-5" style={{ color: '#4ade80' }} />
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">Analysis Complete</h2>
          <p className="text-xs text-muted-foreground">
            Period: {data.period} &middot; {new Date(data.generated_at).toLocaleString()}
          </p>
        </div>
      </div>

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

      <Separator />

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-bold tracking-widest uppercase text-accent"><TrendingUp className="w-3.5 h-3.5" />Performance Summary</div>
        <p className="text-sm text-muted-foreground leading-relaxed">{data.report.performance_summary}</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-bold tracking-widest uppercase text-accent"><DollarSign className="w-3.5 h-3.5" />Financial Position</div>
        <p className="text-sm text-muted-foreground leading-relaxed">{data.report.financial_position}</p>
      </div>

      {data.report.key_metrics?.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold tracking-widest uppercase text-accent"><BarChart3 className="w-3.5 h-3.5" />Key Metrics</div>
          <div className="grid grid-cols-2 gap-2">
            {data.report.key_metrics.map((m, i) => (
              <div key={i} className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="text-xs text-muted-foreground truncate">{m.label}</p>
                <p className="text-sm font-semibold text-accent mt-0.5">{fmt(m.value)}</p>
                {m.note && <p className="text-xs text-muted-foreground mt-0.5">{m.note}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {data.report.risks?.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold tracking-widest uppercase text-accent"><AlertTriangle className="w-3.5 h-3.5" />Risk Factors</div>
          <ul className="space-y-1.5">
            {data.report.risks.map((r, i) => {
              const text = typeof r === "string" ? r : r.risk;
              const sev = typeof r === "object" ? r.severity : undefined;
              return (
                <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                  <span>{text}{sev && <span className="ml-1.5 text-[10px] rounded-full px-2 py-0.5 font-medium text-accent" style={{ background: 'rgba(212,146,15,0.12)' }}>{sev}</span>}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <Separator />
      <Button onClick={onReset} className="w-full" size="lg">Analyse Another Period</Button>
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

export default function Home() {
  const [mode, setMode] = useState<InputMode>("manual");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [parsedData, setParsedData] = useState<FinancialData | null>(null);
  const [parsedFileName, setParsedFileName] = useState<string | null>(null);

  const form = useForm<BaseValues>({
    resolver: zodResolver(baseSchema),
    defaultValues: { periodLabel: "", notes: "" },
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
    try {
      const res = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodLabel: values.periodLabel,
          notes: values.notes || undefined,
          financialData,
        }),
      });

      if (!res.ok) throw new Error(`Webhook returned ${res.status}: ${res.statusText}`);
      const data: ReportResponse = await res.json();
      if (!data.success) throw new Error("Webhook returned success: false");
      setReport(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Submission failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleReset() {
    setReport(null);
    setParsedData(null);
    setParsedFileName(null);
    form.reset({ periodLabel: "", notes: "" });
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

      <div className="relative z-10 max-w-xl mx-auto px-4 py-12 md:py-16">

        {/* Header */}
        <div className="text-center mb-10">
          <p className="text-xs font-bold tracking-[0.2em] uppercase text-accent mb-5">
            AI-Powered Financial Intelligence
          </p>
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-5" style={{ background: 'rgba(212,146,15,0.12)', border: '1px solid rgba(212,146,15,0.25)' }}>
            <BarChart3 className="w-7 h-7 text-accent" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
            Financial Statement{' '}
            <span className="italic text-accent">Analyser</span>
          </h1>
          <p className="mt-3 text-sm text-muted-foreground max-w-sm mx-auto">
            Enter figures manually, upload a spreadsheet, or connect a Google Sheet — AI does the rest.
          </p>
        </div>

        {/* Card */}
        <div className="bg-card border border-card-border rounded-2xl p-6 md:p-8 shadow-2xl" style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.45)' }}>
          <AnimatePresence mode="wait">
            {report ? (
              <ReportView key="report" data={report} onReset={handleReset} />
            ) : (
              <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
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

                    <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
                      {isSubmitting ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Analyzing...</>
                      ) : (
                        "Generate Analysis"
                      )}
                    </Button>
                  </form>
                </Form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p className="mt-5 text-center text-xs text-muted-foreground">
          Results are written to your Google Sheets dashboard and emailed to the CFO automatically.
        </p>
      </div>
    </div>
  );
}
