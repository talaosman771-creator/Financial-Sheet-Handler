import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type FinancialData = Record<string, Record<string, number>>;
interface KeyMetric { label: string; value: string | number; note?: string; }
interface Risk { risk?: string; severity?: string; }

interface ReportData {
  period: string;
  generated_at: string;
  email_sent_to?: string;
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

// ── Palette ──────────────────────────────────────────────────────────────────

const BG        = [10, 31, 19]   as [number, number, number]; // dark green
const CARD      = [14, 40, 24]   as [number, number, number];
const AMBER     = [212, 146, 15] as [number, number, number];
const AMBER_L   = [232, 170, 42] as [number, number, number];
const TEXT      = [200, 215, 207]as [number, number, number];
const MUTED     = [110, 140, 120]as [number, number, number];
const GREEN_CHK = [74, 222, 128] as [number, number, number];
const RED_CHK   = [248, 113, 113]as [number, number, number];
const WHITE     = [255, 255, 255]as [number, number, number];

function scoreColor(score: number): [number, number, number] {
  if (score >= 70) return [74, 222, 128];
  if (score >= 40) return [212, 146, 15];
  return [248, 113, 113];
}

function fmtCurrency(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

// ── Draw helpers ─────────────────────────────────────────────────────────────

function setFill(doc: jsPDF, rgb: [number, number, number]) {
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
}
function setDraw(doc: jsPDF, rgb: [number, number, number]) {
  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
}
function setTxt(doc: jsPDF, rgb: [number, number, number]) {
  doc.setTextColor(rgb[0], rgb[1], rgb[2]);
}

// ── Main Export ───────────────────────────────────────────────────────────────

export function exportPDF(data: ReportData) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const PW = doc.internal.pageSize.getWidth();   // 210
  const PH = doc.internal.pageSize.getHeight();  // 297
  const M  = 18; // margin

  // ── Background ──
  setFill(doc, BG);
  doc.rect(0, 0, PW, PH, "F");

  // ── Hero band ──
  setFill(doc, CARD);
  doc.rect(0, 0, PW, 68, "F");

  // Subtle grid lines
  setDraw(doc, [255, 255, 255]);
  doc.setLineWidth(0.05);
  for (let x = 0; x < PW; x += 10) doc.line(x, 0, x, 68);
  for (let y = 0; y < 68; y += 10) doc.line(0, y, PW, y);

  // ── Amber top rule ──
  setFill(doc, AMBER);
  doc.rect(0, 0, PW, 1.5, "F");

  // ── Brand label ──
  setTxt(doc, AMBER_L);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("AI-POWERED FINANCIAL INTELLIGENCE", M, 14, { charSpace: 1.2 });

  // ── Title ──
  setTxt(doc, WHITE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("Financial Statement", M, 30);
  setTxt(doc, AMBER_L);
  doc.text("Analyser", M + doc.getTextWidth("Financial Statement "), 30);

  // ── Period ──
  setTxt(doc, TEXT);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Report Period: ${data.period}`, M, 40);

  // ── Generated timestamp ──
  setTxt(doc, MUTED);
  doc.setFontSize(8);
  const ts = new Date(data.generated_at).toLocaleString();
  doc.text(`Generated: ${ts}`, M, 48);
  if (data.email_sent_to) {
    doc.text(`Emailed to: ${data.email_sent_to}`, M, 54);
  }

  // ── Health Score Circle ──
  const cx = PW - 38, cy = 34, r = 18;
  const col = scoreColor(data.healthScore);

  // outer ring track
  setDraw(doc, [255, 255, 255]);
  doc.setLineWidth(0.3);
  doc.circle(cx, cy, r, "S");

  // colored ring (approximate arc with thick stroke)
  setDraw(doc, col);
  doc.setLineWidth(3.5);
  const pct = data.healthScore / 100;
  const startAngle = -90;
  const endAngle   = startAngle + pct * 360;
  // jsPDF arc via bezier approximation for the filled portion
  doc.setFillColor(col[0], col[1], col[2]);
  // Draw thin colored circle scaled to coverage
  const steps = Math.max(4, Math.round(pct * 32));
  for (let i = 0; i < steps; i++) {
    const a1 = ((startAngle + (i / steps) * (endAngle - startAngle)) * Math.PI) / 180;
    const a2 = ((startAngle + ((i + 1) / steps) * (endAngle - startAngle)) * Math.PI) / 180;
    const x1 = cx + (r - 1.75) * Math.cos(a1);
    const y1 = cy + (r - 1.75) * Math.sin(a1);
    const x2 = cx + (r - 1.75) * Math.cos(a2);
    const y2 = cy + (r - 1.75) * Math.sin(a2);
    doc.setLineWidth(3.5);
    setDraw(doc, col);
    doc.line(x1, y1, x2, y2);
  }

  // score number
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  setTxt(doc, col);
  const scoreStr = `${data.healthScore}`;
  doc.text(scoreStr, cx - doc.getTextWidth(scoreStr) / 2, cy + 2);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  setTxt(doc, TEXT);
  doc.text("/100", cx - doc.getTextWidth("/100") / 2, cy + 7);
  doc.setFontSize(7.5);
  setTxt(doc, col);
  doc.text(data.healthLabel, cx - doc.getTextWidth(data.healthLabel) / 2, cy + 13.5);

  // ── Section helper ──
  let y = 80;

  function sectionLabel(label: string) {
    setTxt(doc, AMBER_L);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text(label.toUpperCase(), M, y);
    setDraw(doc, AMBER);
    doc.setLineWidth(0.2);
    doc.line(M, y + 1.5, PW - M, y + 1.5);
    y += 7;
  }

  function bodyText(text: string, indent = 0) {
    setTxt(doc, TEXT);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const maxW = PW - M * 2 - indent;
    const lines = doc.splitTextToSize(text, maxW);
    doc.text(lines, M + indent, y);
    y += lines.length * 5 + 2;
  }

  function checkPage(needed = 20) {
    if (y + needed > PH - 15) {
      doc.addPage();
      setFill(doc, BG);
      doc.rect(0, 0, PW, PH, "F");
      y = 18;
    }
  }

  // ── Performance Summary ──
  if (data.report.performance_summary) {
    sectionLabel("Performance Summary");
    bodyText(data.report.performance_summary);
    y += 4;
  }

  // ── Financial Position ──
  checkPage(30);
  if (data.report.financial_position) {
    sectionLabel("Financial Position");
    bodyText(data.report.financial_position);
    y += 4;
  }

  // ── Key Metrics ──
  if (data.report.key_metrics?.length) {
    checkPage(40);
    sectionLabel("Key Metrics");

    const rows = data.report.key_metrics.map(m => [m.label, String(m.value), m.note ?? ""]);
    autoTable(doc, {
      startY: y,
      head: [["Metric", "Value", "Note"]],
      body: rows,
      theme: "plain",
      styles: {
        fontSize: 9,
        textColor: [200, 215, 207],
        fillColor: [14, 40, 24],
        lineColor: [255, 255, 255],
        lineWidth: 0.1,
        cellPadding: 2.5,
      },
      headStyles: {
        fillColor: [26, 60, 38],
        textColor: [212, 146, 15],
        fontStyle: "bold",
        fontSize: 8,
      },
      alternateRowStyles: { fillColor: [10, 31, 19] },
      margin: { left: M, right: M },
      tableWidth: PW - M * 2,
    });
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  // ── Risks ──
  if (data.report.risks?.length) {
    checkPage(30);
    sectionLabel("Risk Factors");
    for (const r of data.report.risks) {
      checkPage(10);
      const text = typeof r === "string" ? r : (r.risk ?? "");
      const sev  = typeof r === "object" ? r.severity : undefined;
      setFill(doc, AMBER);
      doc.circle(M + 1.5, y - 1.5, 1, "F");
      setTxt(doc, TEXT);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      const label = sev ? `${text}  [${sev}]` : text;
      const lines = doc.splitTextToSize(label, PW - M * 2 - 6);
      doc.text(lines, M + 5, y);
      y += lines.length * 5 + 1;
    }
    y += 4;
  }

  // ── Financial Data ──
  for (const [section, rows] of Object.entries(data.financialData)) {
    if (!Object.keys(rows).length) continue;
    checkPage(40);
    sectionLabel(section);

    const tableRows = Object.entries(rows).map(([label, val]) => [label, fmtCurrency(val)]);
    autoTable(doc, {
      startY: y,
      head: [["Line Item", "Value"]],
      body: tableRows,
      theme: "plain",
      styles: {
        fontSize: 9,
        textColor: [200, 215, 207],
        fillColor: [14, 40, 24],
        lineColor: [255, 255, 255],
        lineWidth: 0.1,
        cellPadding: 2.5,
      },
      headStyles: {
        fillColor: [26, 60, 38],
        textColor: [212, 146, 15],
        fontStyle: "bold",
        fontSize: 8,
      },
      alternateRowStyles: { fillColor: [10, 31, 19] },
      columnStyles: { 1: { halign: "right" } },
      margin: { left: M, right: M },
      tableWidth: PW - M * 2,
    });
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  // ── Footer on every page ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const total = (doc.internal as any).getNumberOfPages() as number;
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    setFill(doc, AMBER);
    doc.rect(0, PH - 1, PW, 1, "F");
    setTxt(doc, MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(`Financial Statement Analyser  ·  ${data.period}  ·  Page ${p} of ${total}`, M, PH - 4);
  }

  const fileName = `financial-report-${data.period.replace(/\s+/g, "-").toLowerCase()}.pdf`;
  doc.save(fileName);
}
