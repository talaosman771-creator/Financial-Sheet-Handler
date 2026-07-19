import * as XLSX from "xlsx";

type FinancialData = Record<string, Record<string, number>>;
interface KeyMetric { label: string; value: string | number; note?: string; }
interface Risk { risk?: string; severity?: string; }

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
  };
  financialData: FinancialData;
}

function fmtCurrency(v: number): number { return v; } // keep as number in Excel

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
      ["Risk Factor", "Severity"],
      ...data.report.risks.map(r => {
        const text = typeof r === "string" ? r : (r.risk ?? "");
        const sev  = typeof r === "object" ? (r.severity ?? "") : "";
        return [text, sev];
      }),
    ];
    const wsRisks = XLSX.utils.aoa_to_sheet(riskRows);
    wsRisks["!cols"] = [{ wch: 72 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsRisks, "Risks");
  }

  // ── Write & Download ─────────────────────────────────────────────────────────

  const fileName = `financial-analysis-${data.period.replace(/\s+/g, "-").toLowerCase()}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
