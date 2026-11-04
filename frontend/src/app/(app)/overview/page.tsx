"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Coastline, type MapData } from "@/components/Coastline";
import { Figure, Reveal, fmt } from "@/components/motion";
import { Badge, Card, CardTitle, ErrorBox, PageHeader, RiskBar, Skeleton, Stat, priorityTone, tooltipStyle } from "@/components/ui";
import type { Summary } from "@/lib/api";
import { PRIORITY_COLORS, money, num, pct } from "@/lib/format";
import { useApi } from "@/lib/useApi";

const PRIORITY_ORDER = ["Save now", "Low-cost save", "Grow", "Maintain"];
const PRIORITY_NOTE: Record<string, string> = {
  "Save now": "high risk, high value: call",
  "Low-cost save": "at risk, lower value: digital touch",
  Grow: "safe and valuable: upsell",
  Maintain: "no action needed",
};

export default function Overview() {
  const { data: s, error } = useApi<Summary>("/api/summary");
  const { data: map } = useApi<MapData>("/api/map");
  const [lit, setLit] = useState({ atRisk: 0, value: 0 });

  if (error) return <ErrorBox error={error} />;
  if (!s) return <Loading />;

  const reasons = Object.entries(s.churn_by_reason).sort((a, b) => b[1] - a[1]);
  const plays = Object.entries(s.play_counts).sort((a, b) => b[1] - a[1]);
  const totalActive = PRIORITY_ORDER.reduce((a, k) => a + (s.active_priority_counts[k] ?? 0), 0);
  const worstContract = s.by_contract.reduce((a, b) => (b.churn_rate > a.churn_rate ? b : a));
  const worstTenure = s.by_tenure.reduce((a, b) => (b.churn_rate > a.churn_rate ? b : a));

  return (
    <div>
      <PageHeader title="Who is leaving, and what it costs"
        subtitle={`${num(s.active_customers)} customers are still with you. ${num(s.active_priority_counts["Save now"])} of them are worth a call this week.`}
        right={<Link href="/campaign"
          className="group inline-flex h-10 items-center gap-2 rounded-md bg-lamp px-4 text-[14px] font-medium text-[var(--lamp-ink)] transition-transform duration-200 hover:-translate-y-px active:translate-y-0">
          Plan a campaign <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>} />

      <Reveal className="grid grid-cols-2 gap-x-6 gap-y-8 border-y border-line py-7 md:grid-cols-3 xl:grid-cols-5" scroll={false} delay={0.1}>
        <Stat label="Active customers" figure={{ value: s.active_customers, format: fmt.int }} sub={`of ${num(s.customers)} at quarter start`} />
        <Stat label="Churned this quarter" figure={{ value: s.churn_rate, format: fmt.pct(1) }} tone="bad"
          sub={`${money(s.monthly_revenue_lost)} a month walked out`} />
        <Stat label="Value at risk" figure={{ value: s.active_value_at_risk, format: fmt.money(s.active_value_at_risk) }} tone="beam"
          sub="risk × lifetime value, active customers" />
        <Stat label="Worth a call" figure={{ value: s.active_priority_counts["Save now"], format: fmt.int }}
          sub="high risk and high value" />
        <Stat label="Model accuracy" figure={{ value: s.model_auc, format: fmt.dec(3) }}
          sub="AUC on customers it never saw" />
      </Reveal>

      <Reveal className="mt-6 grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-8 !p-0" lit={false}>
          <div className="flex flex-wrap items-start justify-between gap-4 p-5 pb-0">
            <CardTitle title="Your customers, on the map"
              label="Every point is a customer. Move the pointer to aim the lamp; click a point to open them." />
            <div className="text-right">
              <div className="font-display num text-[28px] leading-none text-bad"><Figure value={lit.atRisk} format={fmt.int} /></div>
              <div className="mt-1 text-[13px] text-faint">high-risk customers in the beam</div>
            </div>
          </div>
          {map ? <Coastline data={map} className="h-[440px] w-full" onLit={setLit} /> : <Skeleton className="m-5 h-[400px]" />}
          <div className="flex flex-wrap gap-x-5 gap-y-1 px-5 pb-4 text-[13px] text-faint">
            <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-[2px] bg-bad" />50% risk or more</span>
            <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-[2px] bg-lamp" />20 to 50%</span>
            <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-[2px] bg-[#bec9dc]" />under 20%</span>
            <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-[2px] bg-[#3a404e]" />left this quarter</span>
          </div>
        </Card>

        <div className="flex flex-col gap-4 xl:col-span-4">
          <Card>
            <CardTitle title="What to do with each customer" label={`Threshold ${pct(s.decision_threshold)} risk, chosen to maximise retained value`} />
            <div className="flex h-2 overflow-hidden rounded-full">
              {PRIORITY_ORDER.map((p) => (
                <div key={p} style={{ width: `${((s.active_priority_counts[p] ?? 0) / totalActive) * 100}%`, background: PRIORITY_COLORS[p] }} />
              ))}
            </div>
            <div className="mt-4 flex flex-col gap-3">
              {PRIORITY_ORDER.map((p) => (
                <Link key={p} href={`/customers?priority=${encodeURIComponent(p)}`}
                  className="group flex items-baseline justify-between gap-3 rounded-md transition-colors">
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-[14px] text-text group-hover:text-lamp">
                      <i className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: PRIORITY_COLORS[p] }} />{p}
                    </span>
                    <span className="block pl-4 text-[13px] text-faint">{PRIORITY_NOTE[p]}</span>
                  </span>
                  <span className="font-display num text-[22px] text-text">{num(s.active_priority_counts[p])}</span>
                </Link>
              ))}
            </div>
          </Card>
          <Card className="flex-1">
            <CardTitle title="Plays for at-risk customers" label="Chosen from each customer's own churn drivers" />
            <div className="flex flex-col gap-2.5">
              {plays.map(([play, n]) => (
                <Link key={play} href={`/customers?play=${encodeURIComponent(play)}`} className="group">
                  <div className="mb-1 flex justify-between text-[13px]">
                    <span className="text-muted group-hover:text-text">{play}</span><span className="num text-text">{num(n)}</span>
                  </div>
                  <div className="h-1 rounded-full bg-panel-2">
                    <div className="h-full rounded-full bg-lamp/80 transition-[width] duration-700" style={{ width: `${(n / plays[0][1]) * 100}%` }} />
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </Reveal>

      <Reveal className="mt-4">
        <Card>
          <CardTitle title="Call these customers first" label="Highest value at risk among customers still with you"
            right={<Link href="/customers" className="text-[13px] text-muted transition-colors hover:text-text">All customers →</Link>} />
          <div className="-mx-5 overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[760px] text-[14px]">
              <thead>
                <tr className="text-left text-[13px] text-faint">
                  <th className="px-5 pb-2 font-normal">Customer</th>
                  <th className="pb-2 font-normal">Churn risk</th>
                  <th className="pb-2 text-right font-normal">Worth if kept</th>
                  <th className="pb-2 text-right font-normal">At risk</th>
                  <th className="pb-2 pl-8 font-normal">Play</th>
                  <th className="px-5 pb-2 font-normal">Offer</th>
                </tr>
              </thead>
              <tbody>
                {s.top_at_risk.map((c) => (
                  <tr key={c.customer_id} className="group border-t border-line transition-colors hover:bg-panel-2/60">
                    <td className="px-5 py-2.5">
                      <Link href={`/customers/${c.customer_id}`} className="num font-medium text-text group-hover:text-lamp">{c.customer_id}</Link>
                      <div className="text-[13px] text-faint">{c.city} · {c.contract}</div>
                    </td>
                    <td><RiskBar p={c.churn_probability} /></td>
                    <td className="num text-right">{money(c.clv)}</td>
                    <td className="num text-right text-lamp">{money(c.value_at_risk)}</td>
                    <td className="pl-8"><Badge tone={priorityTone(c.priority)}>{c.play}</Badge></td>
                    <td className="px-5 text-[13px] text-muted">{c.best_offer}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </Reveal>

      <Reveal className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card>
          <CardTitle title="Churn by contract" label={`${worstContract.contract} customers leave at ${pct(worstContract.churn_rate)}`} />
          <Bars data={s.by_contract.map((c) => ({ k: c.contract, v: c.churn_rate }))} hot={worstContract.contract} />
        </Card>
        <Card>
          <CardTitle title="Churn by tenure" label={`Months ${worstTenure.bucket} are the riskiest: ${pct(worstTenure.churn_rate)}`} />
          <Bars data={s.by_tenure.map((c) => ({ k: c.bucket, v: c.churn_rate }))} hot={worstTenure.bucket} />
        </Card>
        <Card>
          <CardTitle title="Why customers left" label="Exit interviews, last quarter" />
          <div className="flex flex-col gap-3 pt-1">
            {reasons.map(([r, n], i) => (
              <div key={r}>
                <div className="mb-1 flex justify-between text-[13px]">
                  <span className="text-muted">{r}</span><span className="num text-text">{num(n)}</span>
                </div>
                <div className="h-1 rounded-full bg-panel-2">
                  <div className="h-full rounded-full" style={{ width: `${(n / reasons[0][1]) * 100}%`, background: i === 0 ? "var(--lamp)" : "var(--dim)" }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </Reveal>
    </div>
  );
}

function Bars({ data, hot }: { data: { k: string; v: number }[]; hot: string }) {
  return (
    <div className="h-44">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ left: -22, top: 6, right: 4 }}>
          <XAxis dataKey="k" tickLine={false} axisLine={{ stroke: "var(--rule-2)" }} />
          <YAxis tickFormatter={(v) => `${Math.round(v * 100)}%`} tickLine={false} axisLine={false} tickCount={4} />
          <Tooltip {...tooltipStyle} formatter={(v: number) => pct(v)} />
          <Bar dataKey="v" name="Churn rate" radius={[3, 3, 0, 0]} maxBarSize={44}>
            {data.map((d) => <Cell key={d.k} fill={d.k === hot ? "#f5b547" : "#3a4252"} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Loading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-16 w-1/2" />
      <Skeleton className="h-28" />
      <div className="grid gap-4 xl:grid-cols-12">
        <Skeleton className="h-[520px] xl:col-span-8" /><Skeleton className="h-[520px] xl:col-span-4" />
      </div>
    </div>
  );
}
