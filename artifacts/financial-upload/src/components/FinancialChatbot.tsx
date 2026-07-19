import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, X, Send, Loader2, Sparkles, ChevronDown } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Role = "user" | "assistant";

interface Message {
  role: Role;
  content: string;
  streaming?: boolean;
}

interface KeyMetric { label: string; value: string | number; note?: string; }
interface Risk { risk?: string; severity?: string; }

interface FinancialContext {
  period: string;
  healthScore: number;
  healthLabel: string;
  performanceSummary?: string;
  financialPosition?: string;
  keyMetrics?: KeyMetric[];
  risks?: (Risk | string)[];
  financialData?: Record<string, Record<string, number>>;
}

interface Props {
  context: FinancialContext;
}

// ── Suggested questions ───────────────────────────────────────────────────────

function buildSuggestions(ctx: FinancialContext): string[] {
  const base = [
    "What are the biggest risks I should address first?",
    "How can I improve my profit margins?",
    "Is my current liquidity position healthy?",
    "What does my debt level mean for future borrowing?",
  ];
  if (ctx.healthScore < 50) {
    base.unshift(`My health score is ${ctx.healthScore}/100 — what should I fix immediately?`);
    base.pop();
  } else if (ctx.healthScore >= 75) {
    base.unshift("What are my key strengths to maintain and build on?");
    base.pop();
  }
  return base.slice(0, 4);
}

// ── Markdown-lite renderer ────────────────────────────────────────────────────

function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^#{1,3} (.+)$/gm, "<strong>$1</strong>")
    .replace(/^• /gm, "· ")
    .replace(/\n/g, "<br/>");
}

// ── Chat bubble ───────────────────────────────────────────────────────────────

function Bubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
          isUser ? "rounded-br-sm" : "rounded-bl-sm"
        }`}
        style={
          isUser
            ? { background: "hsl(38,88%,44%)", color: "#fff" }
            : { background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(232,237,233,0.92)" }
        }
      >
        {msg.streaming && msg.content === "" ? (
          <span className="flex gap-1 items-center h-4">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: "rgba(232,237,233,0.5)" }}
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
              />
            ))}
          </span>
        ) : (
          <span dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
        )}
        {msg.streaming && msg.content !== "" && (
          <motion.span
            className="inline-block w-0.5 h-3.5 ml-0.5 rounded-full align-middle"
            style={{ background: "rgba(232,237,233,0.6)" }}
            animate={{ opacity: [1, 0] }}
            transition={{ duration: 0.6, repeat: Infinity }}
          />
        )}
      </div>
    </motion.div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function FinancialChatbot({ context }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: `Hi! I've read the full analysis for **${context.period}**. Your financial health score is **${context.healthScore}/100** (${context.healthLabel}). What would you like to explore?`,
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const suggestions = buildSuggestions(context);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 200);
  }, [open]);

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return;
    setShowSuggestions(false);
    setInput("");

    const userMsg: Message = { role: "user", content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setLoading(true);

    // Placeholder streaming bubble
    const assistantIdx = newMessages.length;
    setMessages((prev) => [...prev, { role: "assistant", content: "", streaming: true }]);

    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
          financialContext: context,
        }),
      });

      if (!res.ok || !res.body) throw new Error(`Chat API returned ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.done) break;
            if (payload.error) throw new Error(payload.error);
            if (payload.content) {
              setMessages((prev) => {
                const next = [...prev];
                next[assistantIdx] = {
                  role: "assistant",
                  content: (next[assistantIdx]?.content ?? "") + payload.content,
                  streaming: true,
                };
                return next;
              });
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    } catch (err) {
      setMessages((prev) => {
        const next = [...prev];
        next[assistantIdx] = {
          role: "assistant",
          content: err instanceof Error ? err.message : "Something went wrong. Please try again.",
          streaming: false,
        };
        return next;
      });
    } finally {
      // Mark streaming done
      setMessages((prev) => {
        const next = [...prev];
        if (next[assistantIdx]) next[assistantIdx] = { ...next[assistantIdx], streaming: false };
        return next;
      });
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  return (
    <>
      {/* Floating toggle button */}
      <motion.button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-50 w-13 h-13 rounded-full flex items-center justify-center shadow-2xl"
        style={{
          width: 52, height: 52,
          background: open ? "rgba(30,50,35,0.95)" : "hsl(38,88%,44%)",
          border: open ? "1px solid rgba(212,146,15,0.4)" : "none",
        }}
        whileHover={{ scale: 1.07 }}
        whileTap={{ scale: 0.95 }}
        animate={{ rotate: open ? 90 : 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
      >
        {open
          ? <X className="w-5 h-5 text-amber-400" />
          : <MessageSquare className="w-5 h-5 text-white" />
        }
      </motion.button>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="chat-panel"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 340, damping: 28 }}
            className="fixed bottom-[72px] right-6 z-50 flex flex-col rounded-2xl overflow-hidden shadow-2xl"
            style={{
              width: 360,
              height: 520,
              background: "hsl(148,55%,7%)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center gap-2.5 px-4 py-3 shrink-0"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", background: "rgba(0,0,0,0.25)" }}
            >
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: "rgba(212,146,15,0.18)", border: "1px solid rgba(212,146,15,0.3)" }}
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-serif text-[15px] font-semibold text-foreground truncate leading-tight">AI Financial Analyst</p>
                <p className="text-[10px] text-muted-foreground truncate">Powered by Gemini · {context.period}</p>
              </div>
              <button onClick={() => setOpen(false)}>
                <ChevronDown className="w-4 h-4 text-muted-foreground hover:text-foreground transition-colors" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
              {messages.map((m, i) => <Bubble key={i} msg={m} />)}

              {/* Suggestion chips — shown until first user message */}
              <AnimatePresence>
                {showSuggestions && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col gap-1.5 pt-1"
                  >
                    <p className="text-[10px] text-muted-foreground px-1">Suggested questions</p>
                    {suggestions.map((s, i) => (
                      <motion.button
                        key={i}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.06 }}
                        onClick={() => sendMessage(s)}
                        className="text-left text-[12px] rounded-xl px-3 py-2 transition-all hover:opacity-80 active:scale-[0.98]"
                        style={{
                          background: "rgba(212,146,15,0.08)",
                          border: "1px solid rgba(212,146,15,0.2)",
                          color: "rgba(232,237,233,0.8)",
                        }}
                      >
                        {s}
                      </motion.button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div
              className="shrink-0 px-3 py-2.5"
              style={{ borderTop: "1px solid rgba(255,255,255,0.07)", background: "rgba(0,0,0,0.2)" }}
            >
              <div
                className="flex items-end gap-2 rounded-xl px-3 py-2"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Ask about your financials…"
                  disabled={loading}
                  rows={1}
                  className="flex-1 resize-none bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground outline-none leading-relaxed"
                  style={{ maxHeight: 80, minHeight: 20 }}
                  onInput={(e) => {
                    const t = e.currentTarget;
                    t.style.height = "auto";
                    t.style.height = `${Math.min(t.scrollHeight, 80)}px`;
                  }}
                />
                <button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || loading}
                  className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all disabled:opacity-30"
                  style={{ background: "hsl(38,88%,44%)" }}
                >
                  {loading
                    ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                    : <Send className="w-3.5 h-3.5 text-white" />
                  }
                </button>
              </div>
              <p className="text-[9px] text-muted-foreground text-center mt-1.5">
                Enter to send · Shift+Enter for new line
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
