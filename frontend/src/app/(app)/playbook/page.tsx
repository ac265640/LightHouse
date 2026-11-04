"use client";

import { ArrowRight, Megaphone, Target } from "lucide-react";
import Link from "next/link";

import { Badge, Card, CardTitle, ErrorBox, PageHeader, Skeleton } from "@/components/ui";
import { money, num, pct, PRIORITY_COLORS } from "@/lib/format";
import { useApi } from "@/lib/useApi";

type Play = { why: string; actions: string[]; channel: string; kpi: string };
type Segment = { play: string; priority: string; customers: number; avg_risk: number; value_at_risk: number; avg_clv: number };
type PlaybookData = {
  plays: Record<string, Play>;
  priority_guide: Record<string, string>;
  segments: Segment[];
  historic_reasons: Record<string, Record<string, number>>;
  reason_model: { oof_accuracy: number; majority_baseline: number; top2_accuracy: number; verdict: string };
};

const PRIORITIES = ["Save now", "Low-cost save", "Grow", "Maintain"];

export default function PlaybookPage() {
  const { data, error } = useApi<PlaybookData>("/api/playbook");
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Skeleton className="h-96" />;

  const byPlay = Object.keys(data.plays).map((name) => {
    const segs = data.segments.filter((s) => s.play === name);
    const atRisk = segs.filter((s) => s.priority === "Save now" || s.priority === "Low-cost save");
    return {
      name, play: data.plays[name], segs,
      atRisk: atRisk.reduce((a, s) => a + s.customers, 0),
      var: atRisk.reduce((a, s) => a + s.value_at_risk, 0),
      total: segs.reduce((a, s) => a + s.customers, 0),
    };
  }).sort((a, b) => b.var - a.var);

  return (
    <div>
      <PageHeader index="04" label="Retention Playbook" title="One play per churn driver, ready to run"
        subtitle="Each active customer is mapped to a play by the strongest levers in their SHAP explanation, then sized by priority. Plays are owned by a team, a channel and a KPI." />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {PRIORITIES.map((p) => (
          <div key={p} className="card p-4">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: PRIORITY_COLORS[p] }} />
              <span className="text-sm font-medium">{p}</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted">{data.priority_guide[p]}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {byPlay.map(({ name, play, segs, atRisk, var: v, total }) => (
          <Card key={name} className="card-hover flex flex-col">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="label mb-1">Play</div>
                <h3 className="text-xl font-semibold text-beam">{name}</h3>
              </div>
              <div className="text-right">
                <div className="font-display num text-2xl font-normal">{num(atRisk)}</div>
                <div className="text-[11px] text-muted">at-risk customers · {money(v)} at risk</div>
              </div>
            </div>
            <p className="mt-3 text-sm text-muted">{play.why}</p>
            <ul className="mt-4 space-y-2">
              {play.actions.map((a) => (
                <li key={a} className="flex gap-2 text-sm"><ArrowRight size={14} className="mt-0.5 shrink-0 text-beam" />{a}</li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <Badge tone="sky"><Megaphone size={11} /> {play.channel}</Badge>
              <Badge tone="muted"><Target size={11} /> {play.kpi}</Badge>
            </div>
            {total > 0 && (
              <div className="mt-auto pt-5">
                <div className="flex h-2 overflow-hidden rounded-full bg-white/5">
                  {PRIORITIES.map((p) => {
                    const n = segs.find((s) => s.priority === p)?.customers ?? 0;
                    return <div key={p} style={{ width: `${(n / total) * 100}%`, background: PRIORITY_COLORS[p] }} title={`${p}: ${n}`} />;
                  })}
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-faint">
                  <span>{num(total)} active customers mapped</span>
                  <Link href={`/customers?play=${encodeURIComponent(name)}`} className="text-sky hover:underline">View customers →</Link>
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardTitle label="Exit interviews" title="What churned customers said, by category" />
          <div className="grid gap-4 md:grid-cols-2">
            {Object.entries(data.historic_reasons).map(([cat, reasons]) => (
              <div key={cat} className="rounded-lg border border-line bg-bg-2 p-4">
                <div className="mb-2 text-sm font-medium">{cat}</div>
                {Object.entries(reasons).map(([r, n]) => (
                  <div key={r} className="flex justify-between py-0.5 text-xs">
                    <span className="text-muted">{r}</span><span className="num">{num(n)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardTitle label="Honest finding" title="Why plays use drivers, not predicted exit reasons" />
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-bg-2 p-3">
              <div className="font-display num text-2xl font-normal">{pct(data.reason_model.oof_accuracy, 0)}</div>
              <div className="text-[11px] text-muted">reason-model accuracy</div>
            </div>
            <div className="rounded-lg bg-bg-2 p-3">
              <div className="font-display num text-2xl font-normal text-muted">{pct(data.reason_model.majority_baseline, 0)}</div>
              <div className="text-[11px] text-muted">always guess &ldquo;Competitor&rdquo;</div>
            </div>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-muted">{data.reason_model.verdict}</p>
          <p className="mt-3 text-xs text-faint">Recommendation: add a 1-question pulse survey at month 3 and after every support ticket so exit reasons become predictable.</p>
        </Card>
      </div>
    </div>
  );
}
