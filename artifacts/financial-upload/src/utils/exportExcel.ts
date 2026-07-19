import * as XLSX from "xlsx";

type FinancialData = Record<string, Record<string, number>>;
interface KeyMetric { label: string; value: string | number; note?: string; }
interface Risk { risk?: string; severity?: string; likelihood?: string; mitigation?: string; }
interface Opportunity { opportunity: string; potential_impact?: string; rationale?: string; }
interface Recommendation { area: string; recommendation: string; priority?: string; justification?: string; }
interface CashFlowForecast {
  period: string;
  projected_inflow: string | number;
  projected_outflow: string | number;
  net_cash_flow: string | number;
  ending_balance: string | number;
  commentary?: string;
}

interface ExcelData {
  period: string;
  generated_at: string;
  email_sent_to?: string;
  dashboard_url?: string;
  healthScore: number;
  healthLabel: string;
  report: {
    performance_summary?: string;
    financial_position?: string;
    key_metrics?: KeyMetric[];
    risks?: (Risk | string)[];
    opportunities?: Opportunity[];
    recommendations?: Recommendation[];
    cash_flow_forecast?: CashFlowForecast[];
  };
  financialData: FinancialData;
}

function fmtCurrency(v: number): number { return v; } // keep as number in Excel

/** Parse a possibly-string financial value into a number so Excel cells stay numeric. */
function toNum(v: string | number | undefined | null): number {
  if (v === undefined || v === null) return 0;
  if (typeof v === "number") return v;
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function exportExcel(data: ExcelData) {
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Summary ─────────────────────────────────────────────────────────

  const summaryRows = [
    ["Financial Statement Analysis Report", ""],
    ["", ""],
    ["Report Period",    data.period],
    ["Generated At",    new Date(data.generated_at).toLocaleString()],
    ["Health Score",    `${data.healthScore}/100  (${data.healthLabel})`],
    ...(data.email_sent_to   ? [["Emailed To",       data.email_sent_to]]   : []),
    ...(data.dashboard_url   ? [["Dashboard URL",    data.dashboard_url]]   : []),
    ["", ""],
    ["— Performance Summary —", ""],
    [data.report.performance_summary ?? "", ""],
    ["", ""],
    ["— Financial Position —", ""],
    [data.report.financial_position ?? "", ""],
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary["!cols"] = [{ wch: 28 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

  // ── Sheet 2: Key Metrics ──────────────────────────────────────────────────────

  if (data.report.key_metrics?.length) {
    const metricsRows: (string | number)[][] = [
      ["Metric", "Value", "Note"],
      ...data.report.key_metrics.map(m => [m.label, String(m.value), m.note ?? ""]),
    ];
    const wsMetrics = XLSX.utils.aoa_to_sheet(metricsRows);
    wsMetrics["!cols"] = [{ wch: 32 }, { wch: 18 }, { wch: 48 }];
    XLSX.utils.book_append_sheet(wb, wsMetrics, "Key Metrics");
  }

  // ── Sheet 3: Financial Data (one section per block, separated by blank rows) ──

  const dataRows: (string | number)[][] = [["Line Item", "Value ($)"]];
  let first = true;
  for (const [section, items] of Object.entries(data.financialData)) {
    if (!first) dataRows.push(["", ""]);
    dataRows.push([section.toUpperCase(), ""]);
    for (const [label, val] of Object.entries(items)) {
      dataRows.push([label, fmtCurrency(val)]);
    }
    first = false;
  }
  const wsData = XLSX.utils.aoa_to_sheet(dataRows);
  wsData["!cols"] = [{ wch: 36 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, wsData, "Financial Data");

  // ── Sheet 4: Risk Factors ─────────────────────────────────────────────────────

  if (data.report.risks?.length) {
    const riskRows: string[][] = [
      ["Risk Factor", "Severity", "Likelihood", "Mitigation"],
      ...data.report.risks.map(r => {
        const text = typeof r === "string" ? r : (r.risk ?? "");
        const sev  = typeof r === "object" ? (r.severity ?? "") : "";
        const like = typeof r === "object" ? (r.likelihood ?? "") : "";
        const mit  = typeof r === "object" ? (r.mitigation ?? "") : "";
        return [text, sev, like, mit];
      }),
    ];
    const wsRisks = XLSX.utils.aoa_to_sheet(riskRows);
    wsRisks["!cols"] = [{ wch: 60 }, { wch: 12 }, { wch: 12 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, wsRisks, "Risks");
  }

  // ── Sheet 5: Opportunities ────────────────────────────────────────────────────

  if (data.report.opportunities?.length) {
    const oppRows: string[][] = [
      ["Opportunity", "Potential Impact", "Rationale"],
      ...data.report.opportunities.map(o => [
        o.opportunity ?? "",
        o.potential_impact ?? "",
        o.rationale ?? "",
      ]),
    ];
    const wsOpp = XLSX.utils.aoa_to_sheet(oppRows);
    wsOpp["!cols"] = [{ wch: 48 }, { wch: 22 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, wsOpp, "Opportunities");
  }

  // ── Sheet 6: Recommendations ──────────────────────────────────────────────────

  if (data.report.recommendations?.length) {
    const recRows: string[][] = [
      ["Area", "Recommendation", "Priority", "Justification"],
      ...data.report.recommendations.map(rec => [
        rec.area ?? "",
        rec.recommendation ?? "",
        rec.priority ?? "",
        rec.justification ?? "",
      ]),
    ];
    const wsRec = XLSX.utils.aoa_to_sheet(recRows);
    wsRec["!cols"] = [{ wch: 22 }, { wch: 52 }, { wch: 12 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, wsRec, "Recommendations");
  }

  // ── Sheet 7: Outlook & Expectations (cash-flow forecast) ──────────────────────

  if (data.report.cash_flow_forecast?.length) {
    const cfRows: (string | number)[][] = [
      ["Period", "Projected Inflow ($)", "Projected Outflow ($)", "Net Cash Flow ($)", "Ending Balance ($)", "Commentary"],
      ...data.report.cash_flow_forecast.map(cf => [
        cf.period,
        toNum(cf.projected_inflow),
        toNum(cf.projected_outflow),
        toNum(cf.net_cash_flow),
        toNum(cf.ending_balance),
        cf.commentary ?? "",
      ]),
    ];
    const wsCf = XLSX.utils.aoa_to_sheet(cfRows);
    wsCf["!cols"] = [{ wch: 14 }, { wch: 20 }, { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 56 }];
    XLSX.utils.book_append_sheet(wb, wsCf, "Outlook");
  }

  // ── Write & Download ─────────────────────────────────────────────────────────

  const fileName = `financial-analysis-${data.period.replace(/\s+/g, "-").toLowerCase()}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
