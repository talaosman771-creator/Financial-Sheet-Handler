import { Router, Request, Response } from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const chatRouter = Router();

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface FinancialContext {
  period: string;
  healthScore: number;
  healthLabel: string;
  performanceSummary?: string;
  financialPosition?: string;
  keyMetrics?: Array<{ label: string; value: string | number; note?: string }>;
  risks?: Array<{ risk?: string; severity?: string } | string>;
  financialData?: Record<string, Record<string, number>>;
}

function buildSystemPrompt(ctx: FinancialContext): string {
  const metricsText = ctx.keyMetrics?.length
    ? ctx.keyMetrics
        .map((m) => `  • ${m.label}: ${m.value}${m.note ? ` (${m.note})` : ""}`)
        .join("\n")
    : "  Not available";

  const risksText = ctx.risks?.length
    ? ctx.risks
        .map((r) => {
          const text = typeof r === "string" ? r : r.risk ?? "";
          const sev = typeof r === "object" && r.severity ? ` [${r.severity}]` : "";
          return `  • ${text}${sev}`;
        })
        .join("\n")
    : "  None identified";

  const dataText = ctx.financialData
    ? Object.entries(ctx.financialData)
        .map(([section, rows]) => {
          const lines = Object.entries(rows)
            .map(([k, v]) => `    ${k}: $${Number(v).toLocaleString()}`)
            .join("\n");
          return `  ${section}:\n${lines}`;
        })
        .join("\n")
    : "  Not available";

  return `You are a sharp, friendly CFO-level financial analyst assistant embedded in a Financial Statement Analyser tool.

The user has just received an AI-generated analysis for the period: ${ctx.period}.

FINANCIAL HEALTH SCORE: ${ctx.healthScore}/100 (${ctx.healthLabel})

PERFORMANCE SUMMARY:
${ctx.performanceSummary ?? "Not available"}

FINANCIAL POSITION:
${ctx.financialPosition ?? "Not available"}

KEY METRICS:
${metricsText}

RISK FACTORS:
${risksText}

FINANCIAL DATA:
${dataText}

Your role:
- Answer questions about this specific financial report clearly and concisely
- Highlight what the numbers mean in practical business terms
- Suggest actionable improvements when relevant
- Flag any concerns you spot in the data
- Keep responses focused — 2-4 short paragraphs max unless the user asks for more detail
- Use plain language; avoid jargon unless the user clearly understands it
- Never make up numbers not present in the data above

If the user asks something unrelated to finance or this report, politely redirect them.`;
}

chatRouter.post("/", async (req: Request, res: Response) => {
  const { messages, financialContext } = req.body as {
    messages: ChatMessage[];
    financialContext: FinancialContext;
  };

  if (!messages?.length || !financialContext) {
    res.status(400).json({ error: "messages and financialContext are required" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "GEMINI_API_KEY is not configured" });
    return;
  }

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: buildSystemPrompt(financialContext),
    });

    // Convert messages to Gemini format (map assistant→model)
    const history = messages.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? ("model" as const) : ("user" as const),
      parts: [{ text: m.content }],
    }));

    const chat = model.startChat({
      history,
      generationConfig: { maxOutputTokens: 8192 },
    });

    const lastMessage = messages[messages.length - 1].content;
    const stream = await chat.sendMessageStream(lastMessage);

    for await (const chunk of stream.stream) {
      const text = chunk.text();
      if (text) {
        res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
    res.end();
  }
});
