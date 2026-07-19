export interface RatioMeta {
  description: string;
  benchmark: (v: number) => string;
}

const RATIO_LIBRARY: Array<{ terms: string[]; meta: RatioMeta }> = [
  {
    terms: ["current ratio"],
    meta: {
      description: "Current assets ÷ current liabilities — ability to cover short-term debts",
      benchmark: v => v >= 2 ? "Strong liquidity" : v >= 1 ? "Adequate liquidity" : "Liquidity risk",
    },
  },
  {
    terms: ["quick ratio", "acid test"],
    meta: {
      description: "Liquid assets ÷ current liabilities — tighter liquidity excluding inventory",
      benchmark: v => v >= 1.5 ? "Very liquid" : v >= 1 ? "Liquid" : "Liquidity concern",
    },
  },
  {
    terms: ["gross margin", "gross profit margin"],
    meta: {
      description: "Revenue minus cost of goods ÷ revenue — production profitability",
      benchmark: v => v >= 50 ? "Excellent margins" : v >= 30 ? "Healthy margins" : v >= 15 ? "Thin margins" : "Margin pressure",
    },
  },
  {
    terms: ["net margin", "net profit margin", "profit margin"],
    meta: {
      description: "Net profit ÷ revenue — how much of each dollar of sales becomes profit",
      benchmark: v => v >= 20 ? "Highly profitable" : v >= 10 ? "Good profitability" : v >= 5 ? "Moderate profit" : v >= 0 ? "Breakeven zone" : "Loss-making",
    },
  },
  {
    terms: ["operating margin", "ebit margin"],
    meta: {
      description: "Operating income ÷ revenue — profitability from core business operations",
      benchmark: v => v >= 20 ? "Strong operations" : v >= 10 ? "Efficient ops" : v >= 5 ? "Moderate ops" : "Operational pressure",
    },
  },
  {
    terms: ["ebitda margin", "ebitda"],
    meta: {
      description: "EBITDA ÷ revenue — cash earnings power before financing & tax",
      benchmark: v => v >= 25 ? "High cash generation" : v >= 15 ? "Good cash flow" : v >= 8 ? "Moderate cash flow" : "Low cash generation",
    },
  },
  {
    terms: ["return on equity", "roe"],
    meta: {
      description: "Net profit ÷ shareholders' equity — return generated on invested equity",
      benchmark: v => v >= 20 ? "Excellent return" : v >= 12 ? "Good return" : v >= 8 ? "Adequate return" : "Below-average return",
    },
  },
  {
    terms: ["return on asset", "roa"],
    meta: {
      description: "Net profit ÷ total assets — how efficiently assets generate earnings",
      benchmark: v => v >= 10 ? "Highly efficient" : v >= 5 ? "Efficient" : v >= 2 ? "Moderate efficiency" : "Low asset efficiency",
    },
  },
  {
    terms: ["return on capital", "roic", "roce"],
    meta: {
      description: "Net profit ÷ invested capital — return on all capital deployed",
      benchmark: v => v >= 15 ? "Excellent return" : v >= 10 ? "Strong return" : v >= 6 ? "Adequate return" : "Low return on capital",
    },
  },
  {
    terms: ["debt to equity", "d/e ratio", "leverage ratio"],
    meta: {
      description: "Total debt ÷ shareholders' equity — how much the business is financed by debt",
      benchmark: v => v <= 0.5 ? "Low leverage" : v <= 1 ? "Moderate leverage" : v <= 2 ? "High leverage" : "Very high leverage",
    },
  },
  {
    terms: ["debt ratio", "debt to asset"],
    meta: {
      description: "Total liabilities ÷ total assets — share of assets funded by debt",
      benchmark: v => v <= 0.3 ? "Low debt load" : v <= 0.5 ? "Manageable debt" : v <= 0.7 ? "Elevated debt" : "Heavy debt burden",
    },
  },
  {
    terms: ["interest coverage", "times interest"],
    meta: {
      description: "EBIT ÷ interest expense — capacity to service debt interest",
      benchmark: v => v >= 5 ? "Comfortably covered" : v >= 3 ? "Adequately covered" : v >= 1.5 ? "Thinly covered" : "Coverage at risk",
    },
  },
  {
    terms: ["inventory turnover"],
    meta: {
      description: "COGS ÷ average inventory — how quickly inventory is sold and replaced",
      benchmark: v => v >= 8 ? "Fast-moving stock" : v >= 4 ? "Normal turnover" : v >= 2 ? "Slow turnover" : "Excess inventory",
    },
  },
  {
    terms: ["asset turnover"],
    meta: {
      description: "Revenue ÷ total assets — revenue generated per dollar of assets",
      benchmark: v => v >= 2 ? "High asset efficiency" : v >= 1 ? "Good efficiency" : "Low asset productivity",
    },
  },
  {
    terms: ["receivable", "debtor day", "days outstanding", "dso"],
    meta: {
      description: "Average days to collect payment from customers",
      benchmark: v => v <= 30 ? "Fast collection" : v <= 45 ? "Normal collection" : v <= 60 ? "Slow collection" : "Collection concern",
    },
  },
  {
    terms: ["payable day", "dpo", "creditor day"],
    meta: {
      description: "Average days the business takes to pay its suppliers",
      benchmark: v => v <= 30 ? "Paying quickly" : v <= 60 ? "Normal payment terms" : "Extended payment",
    },
  },
  {
    terms: ["cash ratio"],
    meta: {
      description: "Cash & equivalents ÷ current liabilities — most conservative liquidity measure",
      benchmark: v => v >= 1 ? "Very liquid" : v >= 0.5 ? "Adequate cash" : "Low cash buffer",
    },
  },
  {
    terms: ["working capital"],
    meta: {
      description: "Current assets minus current liabilities — short-term operational buffer",
      benchmark: v => v > 0 ? "Positive working capital" : "Negative working capital",
    },
  },
  {
    terms: ["eps", "earnings per share"],
    meta: {
      description: "Net profit ÷ shares outstanding — profit attributable to each share",
      benchmark: v => v > 0 ? "Earnings positive" : "Loss per share",
    },
  },
  {
    terms: ["p/e", "price to earn", "pe ratio"],
    meta: {
      description: "Share price ÷ EPS — how much investors pay per dollar of earnings",
      benchmark: v => v <= 10 ? "Value priced" : v <= 20 ? "Fairly valued" : v <= 35 ? "Growth premium" : "High premium",
    },
  },
];

export function getRatioMeta(label: string): RatioMeta | null {
  if (!label) return null;
  const k = label.toLowerCase();
  for (const entry of RATIO_LIBRARY) {
    if (entry.terms.some(t => k.includes(t))) return entry.meta;
  }
  return null;
}

/** Parse a metric value string like "12.3%", "1.5x", or "42" into a number */
export function parseRatioValue(v: string | number): number {
  if (v === undefined || v === null) return 0;
  const s = String(v).replace(/[%x$,\s]/g, "").trim();
  return parseFloat(s) || 0;
}
