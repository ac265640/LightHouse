"use client";

import { ArrowUp, FileText, KeyRound, Loader2, Sparkles, Wrench } from "lucide-react";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";

import { Card, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";

type ToolCall = { tool: string; args: Record<string, unknown> };
type Msg = { role: "user" | "assistant"; content: string; tool_calls?: ToolCall[]; error?: boolean };

const SUGGESTIONS = [
  "Which customers should we call this week, and what should we offer them?",
  "Why is churn so high on month-to-month contracts, and what's the fix?",
  "If I have $20,000 for retention, how should I spend it?",
  "Does Offer A actually work? Be honest about the evidence.",
  "Which California cities have the most revenue at risk?",
  "How trustworthy is the churn model, and is it fair?",
];

const TOOL_LABEL: Record<string, string> = {
  get_portfolio_summary: "Portfolio summary",
  search_customers: "Customer search",
  get_customer: "Customer profile",
  plan_campaign: "Campaign optimiser",
  get_offer_evidence: "Offer causal evidence",
  get_model_quality: "Model validation",
};

/** Minimal markdown: headings, bullets, numbered lists, bold. */
function Markdown({ text }: { text: string }) {
  const inline = (s: string): ReactNode[] =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") ? <b key={i} className="font-semibold text-text">{part.slice(2, -2)}</b> : <Fragment key={i}>{part}</Fragment>);
  return (
    <div className="space-y-2 text-sm leading-relaxed text-text/90">
      {text.split("\n").map((line, i) => {
        const t = line.trim();
        if (!t) return null;
        if (/^#{1,3}\s/.test(t)) return <div key={i} className="pt-2 font-semibold text-beam">{inline(t.replace(/^#+\s/, ""))}</div>;
        if (/^[-*•]\s/.test(t)) return <div key={i} className="flex gap-2 pl-1"><span className="text-beam">•</span><span>{inline(t.slice(2))}</span></div>;
        if (/^\d+[.)]\s/.test(t)) {
          const [, n, rest] = t.match(/^(\d+)[.)]\s(.*)$/) ?? [];
          return <div key={i} className="flex gap-2 pl-1"><span className="num text-beam">{n}.</span><span>{inline(rest)}</span></div>;
        }
        return <p key={i}>{inline(t)}</p>;
      })}
    </div>
  );
}

export default function CopilotPage() {
  const { data: status } = useApi<{ configured: boolean; model: string }>("/api/ai/status");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    const history = msgs.filter((m) => !m.error).map(({ role, content }) => ({ role, content }));
    setMsgs((m) => [...m, { role: "user", content: text }]);
    setInput("");
    setBusy(true);
    try {
      const r = await api<{ answer: string; tool_calls: ToolCall[] }>("/api/ai/chat", {
        method: "POST", body: JSON.stringify({ message: text, history }),
      });
      setMsgs((m) => [...m, { role: "assistant", content: r.answer, tool_calls: r.tool_calls }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", content: (e as Error).message, error: true }]);
    } finally { setBusy(false); }
  };

  const brief = async () => {
    setMsgs((m) => [...m, { role: "user", content: "Generate this month's executive retention brief." }]);
    setBusy(true);
    try {
      const r = await api<{ answer: string; tool_calls: ToolCall[] }>("/api/ai/brief", { method: "POST" });
      setMsgs((m) => [...m, { role: "assistant", content: r.answer, tool_calls: r.tool_calls }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", content: (e as Error).message, error: true }]);
    } finally { setBusy(false); }
  };

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col">
      <PageHeader index="05" label="Copilot" title="Ask your retention data anything"
        subtitle="Gemini with function calling over the Lighthouse API. Every number in an answer comes from a tool call you can inspect, never from the model's memory."
        right={<button onClick={brief} disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg border border-line-2 bg-panel px-4 py-2.5 text-sm font-medium text-text transition hover:bg-panel-2 disabled:opacity-50">
          <FileText size={15} /> Executive brief
        </button>} />

      {status && !status.configured && (
        <div className="mb-4 flex items-start gap-3 rounded-lg bg-panel-2 p-4 text-sm">
          <KeyRound size={16} className="mt-0.5 shrink-0 text-warn" />
          <div>
            <div className="font-medium text-text">AI key not configured</div>
            <div className="text-muted">Add <code className="font-mono text-text">GEMINI_API_KEY=…</code> to <code className="font-mono text-text">backend/.env</code> and restart the API. All analytics pages work without it.</div>
          </div>
        </div>
      )}

      <Card className="flex flex-1 flex-col !p-0">
        <div className="flex-1 space-y-5 overflow-y-auto p-5 scrollbar-thin" style={{ maxHeight: "calc(100vh - 22rem)" }}>
          {msgs.length === 0 && (
            <div className="py-6">
              <div className="mb-5 flex items-center gap-2 text-muted"><Sparkles size={16} className="text-text" /> Try asking</div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)}
                    className="card card-hover p-4 text-left text-sm text-text/90 transition hover:text-text">{s}</button>
                ))}
              </div>
            </div>
          )}
          {msgs.map((m, i) => m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[80%] rounded-lg bg-panel-2 px-4 py-2.5 text-sm">{m.content}</div>
            </div>
          ) : (
            <div key={i} className="flex gap-3">
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-panel-2"><Sparkles size={14} className="text-text" /></div>
              <div className="min-w-0 max-w-[85%]">
                {m.tool_calls && m.tool_calls.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {m.tool_calls.map((t, j) => (
                      <span key={j} title={JSON.stringify(t.args)}
                        className="inline-flex items-center gap-1 rounded-md border border-line-2 bg-bg-2 px-2 py-0.5 text-[11px] text-muted">
                        <Wrench size={10} /> {TOOL_LABEL[t.tool] ?? t.tool}
                        {Object.keys(t.args).length > 0 && <span className="text-faint">({Object.values(t.args).join(", ")})</span>}
                      </span>
                    ))}
                  </div>
                )}
                {m.error ? <div className="text-sm text-bad">{m.content}</div> : <Markdown text={m.content} />}
              </div>
            </div>
          ))}
          {busy && <div className="flex items-center gap-2 text-sm text-muted"><Loader2 size={14} className="animate-spin" /> Querying Lighthouse…</div>}
          <div ref={end} />
        </div>
        <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex items-center gap-2 border-t border-line p-3">
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about customers, offers, budgets or the model…"
            className="flex-1 rounded-lg border border-line bg-bg-2 px-4 py-2.5 text-sm text-text outline-none placeholder:text-faint focus:border-line-2" />
          <button type="submit" disabled={busy || !input.trim()}
            className="rounded-lg bg-beam p-2.5 text-bg transition hover:brightness-110 disabled:opacity-40"><ArrowUp size={16} /></button>
        </form>
      </Card>
    </div>
  );
}
