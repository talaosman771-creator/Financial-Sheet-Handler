import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart3,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Mail,
  Plus,
  Trash2,
  TrendingUp,
  AlertTriangle,
  DollarSign,
  Activity,
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

// ── Types ────────────────────────────────────────────────────────────────────

const lineItemSchema = z.object({
  label: z.string().min(1, "Label required"),
  value: z
    .string()
    .min(1, "Value required")
    .refine((v) => !isNaN(Number(v.replace(/,/g, ""))), "Must be a number"),
});

const formSchema = z.object({
  periodLabel: z.string().min(1, "Reporting period is required (e.g. Q2 2026)"),
  notes: z.string().optional(),
  incomeStatement: z.array(lineItemSchema).min(1, "Add at least one income statement line"),
  balanceSheet: z.array(lineItemSchema).min(1, "Add at least one balance sheet line"),
});

type FormValues = z.infer<typeof formSchema>;

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

// ── Helpers ──────────────────────────────────────────────────────────────────

const WEBHOOK_URL = "https://proojectta.app.n8n.cloud/webhook/financial-analysis";

function parseNumber(str: string): number {
  return Number(str.replace(/,/g, ""));
}

function buildFinancialData(
  incomeItems: { label: string; value: string }[],
  balanceItems: { label: string; value: string }[]
) {
  const incomeStatement: Record<string, number> = {};
  for (const item of incomeItems) {
    incomeStatement[item.label] = parseNumber(item.value);
  }
  const balanceSheet: Record<string, number> = {};
  for (const item of balanceItems) {
    balanceSheet[item.label] = parseNumber(item.value);
  }
  return { "Income Statement": incomeStatement, "Balance Sheet": balanceSheet };
}

// ── Line Item Editor ─────────────────────────────────────────────────────────

function LineItemSection({
  title,
  fieldName,
  form,
  disabled,
  defaultItems,
}: {
  title: string;
  fieldName: "incomeStatement" | "balanceSheet";
  form: ReturnType<typeof useForm<FormValues>>;
  disabled: boolean;
  defaultItems: { label: string; value: string }[];
}) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: fieldName,
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs gap-1 text-primary hover:text-primary"
          onClick={() => append({ label: "", value: "" })}
          disabled={disabled}
        >
          <Plus className="w-3 h-3" />
          Add line
        </Button>
      </div>

      <div className="space-y-2">
        {fields.map((field, index) => (
          <motion.div
            key={field.id}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="flex gap-2 items-start"
          >
            <FormField
              control={form.control}
              name={`${fieldName}.${index}.label`}
              render={({ field }) => (
                <FormItem className="flex-1">
                  <FormControl>
                    <Input
                      placeholder="Line item"
                      {...field}
                      disabled={disabled}
                      className="text-sm h-9"
                    />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name={`${fieldName}.${index}.value`}
              render={({ field }) => (
                <FormItem className="w-36">
                  <FormControl>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                      <Input
                        placeholder="0"
                        {...field}
                        disabled={disabled}
                        className="text-sm h-9 pl-6"
                      />
                    </div>
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:text-destructive shrink-0"
              onClick={() => remove(index)}
              disabled={disabled || fields.length <= 1}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </motion.div>
        ))}
      </div>

      {(form.formState.errors[fieldName] as { message?: string } | undefined)?.message && (
        <p className="text-xs text-destructive">
          {(form.formState.errors[fieldName] as { message?: string }).message}
        </p>
      )}
    </div>
  );
}

// ── Report View ──────────────────────────────────────────────────────────────

function ReportView({
  data,
  onReset,
}: {
  data: ReportResponse;
  onReset: () => void;
}) {
  const fmt = (v: string | number) =>
    typeof v === "number"
      ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v)
      : v;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-green-100 text-green-600 flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">Analysis Complete</h2>
          <p className="text-xs text-muted-foreground">
            Period: {data.period} &middot; Generated {new Date(data.generated_at).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Notifications row */}
      <div className="flex flex-wrap gap-2">
        {data.email_sent_to && (
          <Badge variant="secondary" className="gap-1.5 text-xs font-normal">
            <Mail className="w-3 h-3" />
            Emailed to {data.email_sent_to}
          </Badge>
        )}
        {data.dashboard_url && (
          <a href={data.dashboard_url} target="_blank" rel="noopener noreferrer">
            <Badge variant="secondary" className="gap-1.5 text-xs font-normal cursor-pointer hover:bg-muted transition-colors">
              <ExternalLink className="w-3 h-3" />
              Open Dashboard
            </Badge>
          </a>
        )}
      </div>

      <Separator />

      {/* Performance summary */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <TrendingUp className="w-4 h-4 text-primary" />
          Performance Summary
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">{data.report.performance_summary}</p>
      </div>

      {/* Financial position */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <DollarSign className="w-4 h-4 text-primary" />
          Financial Position
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">{data.report.financial_position}</p>
      </div>

      {/* Key metrics */}
      {data.report.key_metrics?.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <BarChart3 className="w-4 h-4 text-primary" />
            Key Metrics
          </div>
          <div className="grid grid-cols-2 gap-2">
            {data.report.key_metrics.map((m, i) => (
              <div key={i} className="bg-muted/50 rounded-lg px-3 py-2.5">
                <p className="text-xs text-muted-foreground truncate">{m.label}</p>
                <p className="text-sm font-semibold text-foreground mt-0.5">{fmt(m.value)}</p>
                {m.note && <p className="text-xs text-muted-foreground mt-0.5">{m.note}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cash flow forecast */}
      {data.report.cash_flow_forecast?.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Activity className="w-4 h-4 text-primary" />
            Cash Flow Forecast
          </div>
          <div className="space-y-1.5">
            {data.report.cash_flow_forecast.map((cf, i) => (
              <div key={i} className="flex items-center justify-between bg-muted/40 rounded-lg px-3 py-2">
                <span className="text-xs text-muted-foreground">{cf.period}</span>
                <div className="text-right">
                  <span className="text-xs font-medium text-foreground">{fmt(cf.amount)}</span>
                  {cf.note && <p className="text-xs text-muted-foreground">{cf.note}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Risks */}
      {data.report.risks?.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Risk Factors
          </div>
          <ul className="space-y-1.5">
            {data.report.risks.map((r, i) => {
              const text = typeof r === "string" ? r : r.risk;
              const sev = typeof r === "object" ? r.severity : undefined;
              return (
                <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  <span>
                    {text}
                    {sev && (
                      <Badge variant="outline" className="ml-1.5 text-[10px] px-1 py-0 font-normal">
                        {sev}
                      </Badge>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <Separator />

      <Button onClick={onReset} className="w-full" size="lg">
        Analyze another period
      </Button>
    </motion.div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const DEFAULT_INCOME: { label: string; value: string }[] = [
  { label: "Revenue", value: "" },
  { label: "Cost of Goods Sold", value: "" },
  { label: "Gross Profit", value: "" },
  { label: "Operating Expenses", value: "" },
  { label: "Net Income", value: "" },
];

const DEFAULT_BALANCE: { label: string; value: string }[] = [
  { label: "Total Current Assets", value: "" },
  { label: "Total Current Liabilities", value: "" },
  { label: "Total Assets", value: "" },
  { label: "Total Equity", value: "" },
];

export default function Home() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [report, setReport] = useState<ReportResponse | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      periodLabel: "",
      notes: "",
      incomeStatement: DEFAULT_INCOME,
      balanceSheet: DEFAULT_BALANCE,
    },
  });

  async function onSubmit(values: FormValues) {
    setIsSubmitting(true);
    try {
      const financialData = buildFinancialData(values.incomeStatement, values.balanceSheet);
      const payload = {
        periodLabel: values.periodLabel,
        notes: values.notes || undefined,
        financialData,
      };

      const res = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`Webhook returned ${res.status}: ${res.statusText}`);
      }

      const data: ReportResponse = await res.json();

      if (!data.success) {
        throw new Error("Webhook returned success: false");
      }

      setReport(data);
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error ? err.message : "Submission failed. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleReset() {
    setReport(null);
    form.reset({
      periodLabel: "",
      notes: "",
      incomeStatement: DEFAULT_INCOME,
      balanceSheet: DEFAULT_BALANCE,
    });
  }

  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-4 py-10 md:py-16">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary text-primary-foreground mb-5 shadow-sm">
            <BarChart3 className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Financial Analysis
          </h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-sm mx-auto">
            Enter your financial figures and n8n will generate an AI report, update the dashboard, and email the CFO.
          </p>
        </div>

        {/* Card */}
        <div className="bg-card border border-card-border shadow-lg shadow-black/5 rounded-2xl p-6 md:p-8">
          <AnimatePresence mode="wait">
            {report ? (
              <ReportView key="report" data={report} onReset={handleReset} />
            ) : (
              <motion.div
                key="form"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-7">
                    {/* Period + Notes */}
                    <div className="space-y-4">
                      <FormField
                        control={form.control}
                        name="periodLabel"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Reporting Period</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="e.g. Q2 2026"
                                {...field}
                                disabled={isSubmitting}
                              />
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
                            <FormLabel>
                              Notes{" "}
                              <span className="text-muted-foreground font-normal text-xs">(optional)</span>
                            </FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Any context for this period — acquisitions, seasonality, one-off items..."
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

                    {/* Income Statement */}
                    <LineItemSection
                      title="Income Statement"
                      fieldName="incomeStatement"
                      form={form}
                      disabled={isSubmitting}
                      defaultItems={DEFAULT_INCOME}
                    />

                    <Separator />

                    {/* Balance Sheet */}
                    <LineItemSection
                      title="Balance Sheet"
                      fieldName="balanceSheet"
                      form={form}
                      disabled={isSubmitting}
                      defaultItems={DEFAULT_BALANCE}
                    />

                    <Button
                      type="submit"
                      className="w-full"
                      size="lg"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Analyzing...
                        </>
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

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Results are written to your Google Sheets dashboard and emailed to the CFO automatically.
        </p>
      </div>
    </div>
  );
}
