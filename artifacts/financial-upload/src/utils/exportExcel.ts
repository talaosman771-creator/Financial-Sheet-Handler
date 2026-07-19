import XLSX from "xlsx-js-style";

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

/** Parse a possibly-string financial value into a number so Excel cells stay numeric. */
function toNum(v: string | number | undefined | null): number {
  if (v === undefined || v === null) return 0;
  if (typeof v === "number") return v;
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

// ── Palette (ARGB hex — brand dark-green / amber) ─────────────────────────────

const C = {
  headerBg: "FF1A3C26",   // dark forest green
  headerFg: "FFE8AA2A",   // amber
  bandBg:   "FF0E2818",    // deep green banner
  bandFg:   "FFF5EEDC",    // warm off-white
  labelFg:  "FF14402A",    // dark green text
  bodyFg:   "FF1F2937",    // near-black slate
  zebra:    "FFF2F7F4",    // faint green tint
  white:    "FFFFFFFF",
  border:   "FFCBD8CF",    // soft green-gray gridline
  sectionBg:"FFDDEBE1",    // section sub-header fill
};

const CURRENCY_FMT = '"$"#,##0;[Red]-"$"#,##0';

const THIN = { style: "thin", color: { rgb: C.border } } as const;
const ALL_BORDERS = { top: THIN, bottom: THIN, left: THIN, right: THIN };

type Style = Record<string, unknown>;

const headerStyle: Style = {
  font: { bold: true, sz: 11, color: { rgb: C.headerFg } },
  fill: { fgColor: { rgb: C.headerBg } },
  alignment: { vertical: "center", horizontal: "left" },
  border: ALL_BORDERS,
};

const bodyStyle = (zebra: boolean): Style => ({
  font: { sz: 10, color: { rgb: C.bodyFg } },
  fill: { fgColor: { rgb: zebra ? C.zebra : C.white } },
  alignment: { vertical: "top", horizontal: "left", wrapText: true },
  border: ALL_BORDERS,
});

/** Apply a styled header row + zebra-striped, bordered body to a sheet built from an AoA. */
function styleTable(
  ws: XLSX.WorkSheet,
  opts: { rows: number; cols: number; currencyCols?: number[]; headerRow?: number },
) {
  const { rows, cols, currencyCols = [], headerRow = 0 } = opts;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr] ?? (ws[addr] = { t: "s", v: "" });
      if (r === headerRow) {
        cell.s = headerStyle;
      } else {
        const zebra = (r - headerRow) % 2 === 0;
        const s = { ...bodyStyle(zebra) } as Style;
        if (currencyCols.includes(c) && typeof cell.v === "number") {
          s.numFmt = CURRENCY_FMT;
          (s.alignment as Record<string, unknown>) = { vertical: "top", horizontal: "right" };
        }
        cell.s = s;
      }
    }
  }
}

export function exportExcel(data: ExcelData) {
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Summary ─────────────────────────────────────────────────────────

  const summaryRows: (string | number)[][] = [
    ["Financial Statement Analysis Report", ""],
    ["Report Period",  data.period],
    ["Generated At",   new Date(data.generated_at).toLocaleString()],
    ["Health Score",   `${data.healthScore}/100  (${data.healthLabel})`],
    ...(data.email_sent_to ? [["Emailed To",    data.email_sent_to]]  : []),
    ...(data.dashboard_url ? [["Dashboard URL", data.dashboard_url]]  : []),
    ["", ""],
    ["Performance Summary", data.report.performance_summary ?? "—"],
    ["Financial Position",  data.report.financial_position ?? "—"],
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary["!cols"] = [{ wch: 24 }, { wch: 92 }];
  wsSummary["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
  // Style summary: banner title row, label column bold-green, wrapping value cells.
  const sumRowCount = summaryRows.length;
  for (let r = 0; r < sumRowCount; r++) {
    const labelCell = wsSummary[XLSX.utils.encode_cell({ r, c: 0 })];
    const valCell   = wsSummary[XLSX.utils.encode_cell({ r, c: 1 })] ?? (wsSummary[XLSX.utils.encode_cell({ r, c: 1 })] = { t: "s", v: "" });
    if (r === 0) {
      if (labelCell) labelCell.s = {
        font: { bold: true, sz: 15, color: { rgb: C.bandFg } },
        fill: { fgColor: { rgb: C.bandBg } },
        alignment: { vertical: "center", horizontal: "left" },
      };
      valCell.s = { fill: { fgColor: { rgb: C.bandBg } } };
      continue;
    }
    if (labelCell && labelCell.v) {
      labelCell.s = {
        font: { bold: true, sz: 10, color: { rgb: C.labelFg } },
        alignment: { vertical: "top", horizontal: "left" },
      };
    }
    valCell.s = {
      font: { sz: 10, color: { rgb: C.bodyFg } },
      alignment: { vertical: "top", horizontal: "left", wrapText: true },
    };
  }
  wsSummary["!rows"] = [{ hpt: 26 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

  // ── Sheet 2: Key Metrics ──────────────────────────────────────────────────────

  if (data.report.key_metrics?.length) {
    const metricsRows: (string | number)[][] = [
      ["Metric", "Value", "Note"],
      ...data.report.key_metrics.map(m => [m.label, String(m.value), m.note ?? ""]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(metricsRows);
    ws["!cols"] = [{ wch: 32 }, { wch: 18 }, { wch: 60 }];
    styleTable(ws, { rows: metricsRows.length, cols: 3 });
    XLSX.utils.book_append_sheet(wb, ws, "Key Metrics");
  }

  // ── Sheet 3: Financial Data (section sub-headers + line items) ────────────────

  const dataRows: (string | number)[][] = [["Line Item", "Value"]];
  const sectionRowIdx: number[] = [];
  for (const [section, items] of Object.entries(data.financialData)) {
    sectionRowIdx.push(dataRows.length);
    dataRows.push([section.toUpperCase(), ""]);
    for (const [label, val] of Object.entries(items)) {
      dataRows.push([label, val]);
    }
  }
  const wsData = XLSX.utils.aoa_to_sheet(dataRows);
  wsData["!cols"] = [{ wch: 40 }, { wch: 20 }];
  styleTable(wsData, { rows: dataRows.length, cols: 2, currencyCols: [1] });
  // Re-style section sub-header rows on top of the zebra base.
  for (const r of sectionRowIdx) {
    for (let c = 0; c < 2; c++) {
      const cell = wsData[XLSX.utils.encode_cell({ r, c })];
      if (cell) cell.s = {
        font: { bold: true, sz: 10, color: { rgb: C.labelFg } },
        fill: { fgColor: { rgb: C.sectionBg } },
        alignment: { vertical: "center", horizontal: "left" },
        border: ALL_BORDERS,
      };
    }
  }
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
    const ws = XLSX.utils.aoa_to_sheet(riskRows);
    ws["!cols"] = [{ wch: 56 }, { wch: 12 }, { wch: 12 }, { wch: 60 }];
    styleTable(ws, { rows: riskRows.length, cols: 4 });
    XLSX.utils.book_append_sheet(wb, ws, "Risks");
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
    const ws = XLSX.utils.aoa_to_sheet(oppRows);
    ws["!cols"] = [{ wch: 46 }, { wch: 22 }, { wch: 62 }];
    styleTable(ws, { rows: oppRows.length, cols: 3 });
    XLSX.utils.book_append_sheet(wb, ws, "Opportunities");
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
    const ws = XLSX.utils.aoa_to_sheet(recRows);
    ws["!cols"] = [{ wch: 22 }, { wch: 52 }, { wch: 12 }, { wch: 62 }];
    styleTable(ws, { rows: recRows.length, cols: 4 });
    XLSX.utils.book_append_sheet(wb, ws, "Recommendations");
  }

  // ── Sheet 7: Outlook & Expectations (cash-flow forecast) ──────────────────────

  if (data.report.cash_flow_forecast?.length) {
    const cfRows: (string | number)[][] = [
      ["Period", "Projected Inflow", "Projected Outflow", "Net Cash Flow", "Ending Balance", "Commentary"],
      ...data.report.cash_flow_forecast.map(cf => [
        cf.period,
        toNum(cf.projected_inflow),
        toNum(cf.projected_outflow),
        toNum(cf.net_cash_flow),
        toNum(cf.ending_balance),
        cf.commentary ?? "",
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(cfRows);
    ws["!cols"] = [{ wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 56 }];
    styleTable(ws, { rows: cfRows.length, cols: 6, currencyCols: [1, 2, 3, 4] });
    XLSX.utils.book_append_sheet(wb, ws, "Outlook");
  }

  // ── Write & Download ─────────────────────────────────────────────────────────

  const fileName = `financial-analysis-${data.period.replace(/\s+/g, "-").toLowerCase()}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
