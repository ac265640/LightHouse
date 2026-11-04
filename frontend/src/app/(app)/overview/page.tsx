"use client";

import { ArrowUpRight, Coins, ShieldAlert, Target, TrendingDown, Users } from "lucide-react";
import Link from "next/link";
import {
  Area, AreaChart, Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Scatter, ScatterChart,
  Tooltip, XAxis, YAxis, ZAxis, CartesianGrid,
} from "recharts";

import {
  Badge, Card, CardTitle, ErrorBox, PageHeader, RiskBar, Skeleton, Stat, priorityTone, tooltipStyle,
} from "@/components/ui";
import type { Summary } from "@/lib/api";
import { PRIORITY_COLORS, money, num, pct } from "@/lib/format";
import { useApi } from "@/lib/useApi";

const PRIORITY_ORDER = ["Save now", "Low-cost save", "Grow", "Maintain"];

export default function CommandCenter() {
  const { data: s, error } = useApi<Summary>("/api/summary");

  if (error) return <ErrorBox error={error} />;
  if (!s) return <LoadingGrid />;

  const priority = PRIORITY_ORDER.map((k) => ({ name: k, value: s.active_priority_counts[k] ?? 0 }));
  const riskHist = s.risk_distribution.map((v, i) => ({ bin: `${i * 5}%`, customers: v }));
  const reasons = Object.entries(s.churn_by_reason).map(([k, v]) => ({ reason: k, customers: v }))
    .sort((a, b) => b.customers - a.customers);
  const plays = Object.entries(s.play_counts).map(([k, v]) => ({ play: k, customers: v }))
    .sort((a, b) => b.customers - a.customers);

  return (
    <div>
      <PageHeader
        index="01" label="Command Center"
        title="Who is drifting away, and what it costs"
        subtitle="Every score below is out-of-sample: customers are scored by models that never saw them in training."
        right={<Link href="/campaign" className="inline-flex items-center gap-2 rounded-lg bg-beam px-4 py-2.5 text-sm font-medium text-bg transition hover:brightness-110">
          Plan a retention campaign <ArrowUpRight size={16} />
        </Link>}
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="Active customers" value={num(s.active_customers)} icon={<Users size={15} />}
          sub={`${num(s.customers)} in portfolio`} />
        <Stat label="Quarterly churn" value={pct(s.churn_rate)} tone="bad" icon={<TrendingDown size={15} />}
          sub={`${money(s.monthly_revenue_lost)} MRR lost`} />
        <Stat label="Value at risk" value={money(s.active_value_at_risk)} tone="beam" icon={<Coins size={15} />}
          sub="Risk × survival CLV, active base" />
        <Stat label="Save now" value={num(s.active_priority_counts["Save now"])} tone="bad" icon={<ShieldAlert size={15} />}
          sub="High risk and high value" />
        <Stat label="Uplift-targeted value" value={money(s.uplift_targeting_value)} tone="good" icon={<Target size={15} />}
          sub="Net value of best-offer targeting" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardTitle label="Risk distribution" title="Calibrated churn probability, all customers"
            hint="Isotonic-calibrated stacked ensemble. A 30% score means roughly 30 in 100 such customers churn."
            right={<Badge tone="sky">AUC {s.model_auc.toFixed(3)}</Badge>} />
          <div className="h-56">
            <ResponsiveContainer>
              <AreaChart data={riskHist} margin={{ left: -18, right: 6, top: 6 }}>
                <defs>
                  <linearGradient id="riskFill" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#3ddc97" stopOpacity={0.5} />
                    <stop offset="45%" stopColor="#f6b54a" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#ff6b81" stopOpacity={0.6} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="bin" tickLine={false} axisLine={false} interval={3} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip {...tooltipStyle} />
                <Area type="monotone" dataKey="customers" stroke="#f6b54a" strokeWidth={2} fill="url(#riskFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardTitle label="Priority matrix" title="Active customers by action"
            hint="Risk above the profit-optimal threshold × CLV above median." />
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <div className="h-44 w-44 shrink-0">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={priority} dataKey="value" innerRadius={48} outerRadius={78} paddingAngle={2} stroke="none">
                    {priority.map((p) => <Cell key={p.name} fill={PRIORITY_COLORS[p.name]} />)}
                  </Pie>
                  <Tooltip {...tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-full space-y-2.5">
              {priority.map((p) => (
                <div key={p.name} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-muted">
                    <span className="h-2 w-2 rounded-full" style={{ background: PRIORITY_COLORS[p.name] }} />
                    {p.name}
                  </span>
                  <span className="num text-text">{num(p.value)}</span>
                </div>
              ))}
              <div className="pt-1 text-[11px] text-faint">Threshold {pct(s.decision_threshold)} chosen to maximise net retained value.</div>
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card>
          <CardTitle label="Contract" title="Churn rate by contract type" />
          <div className="h-48">
            <ResponsiveContainer>
              <BarChart data={s.by_contract} margin={{ left: -18, top: 6 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="contract" tickLine={false} axisLine={false} />
                <YAxis tickFormatter={(v) => `${Math.round(v * 100)}%`} tickLine={false} axisLine={false} />
                <Tooltip {...tooltipStyle} formatter={(v: number) => pct(v)} />
                <Bar dataKey="churn_rate" name="Churn rate" radius={[6, 6, 0, 0]}>
                  {s.by_contract.map((c) => <Cell key={c.contract} fill={c.churn_rate > 0.3 ? "#ff6b81" : "#5fc6ff"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardTitle label="Lifecycle" title="Churn rate by tenure (months)" />
          <div className="h-48">
            <ResponsiveContainer>
              <BarChart data={s.by_tenure} margin={{ left: -18, top: 6 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="bucket" tickLine={false} axisLine={false} />
                <YAxis tickFormatter={(v) => `${Math.round(v * 100)}%`} tickLine={false} axisLine={false} />
                <Tooltip {...tooltipStyle} formatter={(v: number) => pct(v)} />
                <Bar dataKey="churn_rate" name="Churn rate" fill="#f6b54a" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardTitle label="Exit interviews" title="Why customers left last quarter" />
          <div className="space-y-3 pt-1">
            {reasons.map((r) => (
              <div key={r.reason}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-muted">{r.reason}</span>
                  <span className="num text-text">{num(r.customers)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/5">
                  <div className="h-full rounded-full bg-bad/70" style={{ width: `${(r.customers / reasons[0].customers) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardTitle label="Geography" title="Value at risk across California"
            hint="Cities with 15+ customers. Bubble size = value at risk, colour = average risk." />
          <div className="h-72">
            <ResponsiveContainer>
              <ScatterChart margin={{ left: -10, right: 10, top: 6 }}>
                <XAxis type="number" dataKey="lon" domain={["dataMin - 0.5", "dataMax + 0.5"]} hide />
                <YAxis type="number" dataKey="lat" domain={["dataMin - 0.5", "dataMax + 0.5"]} hide />
                <ZAxis type="number" dataKey="value_at_risk" range={[40, 900]} />
                <Tooltip {...tooltipStyle} content={({ payload }) => {
                  const c = payload?.[0]?.payload;
                  return c ? (
                    <div className="card px-3 py-2 text-xs">
                      <div className="font-medium text-text">{c.city}</div>
                      <div className="text-muted">{c.customers} customers · avg risk {pct(c.avg_risk)}</div>
                      <div className="text-beam">{money(c.value_at_risk)} at risk</div>
                    </div>
                  ) : null;
                }} />
                <Scatter data={s.top_cities}>
                  {s.top_cities.map((c) => (
                    <Cell key={c.city} fill={c.avg_risk > 0.3 ? "#ff6b81" : c.avg_risk > 0.2 ? "#f6b54a" : "#5fc6ff"} fillOpacity={0.55} stroke="none" />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="xl:col-span-3">
          <CardTitle label="Act today" title="Highest value at risk"
            right={<Link href="/customers" className="text-xs text-sky hover:underline">All customers →</Link>} />
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-faint">
                  <th className="pb-2 font-medium">Customer</th>
                  <th className="pb-2 font-medium">Risk</th>
                  <th className="pb-2 text-right font-medium">CLV</th>
                  <th className="pb-2 font-medium pl-4">Play</th>
                  <th className="pb-2 font-medium">Offer</th>
                </tr>
              </thead>
              <tbody>
                {s.top_at_risk.map((c) => (
                  <tr key={c.customer_id} className="border-t border-line/70 hover:bg-white/[0.02]">
                    <td className="py-2.5">
                      <Link href={`/customers/${c.customer_id}`} className="font-medium text-text hover:text-beam">{c.customer_id}</Link>
                      <div className="text-[11px] text-faint">{c.city} · {c.contract}</div>
                    </td>
                    <td><RiskBar p={c.churn_probability} /></td>
                    <td className="num text-right">{money(c.clv)}</td>
                    <td className="pl-4"><Badge tone={priorityTone(c.priority)}>{c.play}</Badge></td>
                    <td className="text-xs text-muted">{c.best_offer}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardTitle label="Where to focus" title="At-risk customers by recommended play"
          hint="Each at-risk customer's play is chosen from their strongest churn drivers (SHAP)." />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {plays.map((p) => (
            <Link key={p.play} href={`/customers?play=${encodeURIComponent(p.play)}&priority=Save+now`}
              className="card card-hover !rounded-xl p-4">
              <div className="num text-2xl font-semibold text-text">{num(p.customers)}</div>
              <div className="mt-1 text-xs text-muted">{p.play}</div>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}

function LoadingGrid() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-16 w-1/2" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Skeleton className="h-72 xl:col-span-2" /><Skeleton className="h-72" />
      </div>
    </div>
  );
}
