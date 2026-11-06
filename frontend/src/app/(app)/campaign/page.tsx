"use client";

import { Download, FlaskConical, Loader2, Trophy } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, ErrorBar, Legend, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import { Badge, Card, CardTitle, ErrorBox, PageHeader, RiskBar, Skeleton, tooltipStyle } from "@/components/ui";
import { api, type Strategy } from "@/lib/api";
import { money, num, pct } from "@/lib/format";
import { useApi } from "@/lib/useApi";

type CampaignResult = {
  strategies: Record<"uplift_optimised" | "risk_ranked" | "random", Strategy>;
  strategy_notes: Record<string, string>;
  offer_mix: Record<string, number>;
  targets: { customer_id: string; city: string; churn_probability: number; clv: number; play: string;
    recommended_offer: string; expected_net_value: number; priority: string }[];
};

type OfferEvidence = {
  offer: string; window: string; n_received: number; naive_effect: number; window_naive_effect: number;
  dr_effect: number; dr_ci_low: number; dr_ci_high: number; significant: boolean;
  share_cate_beneficial: number; cost: number;
};

const DEFAULT_COSTS = { "Offer A": 60, "Offer B": 45, "Offer C": 35, "Offer D": 25, "Offer E": 15 };
const STRATS = [
  { key: "uplift_optimised", label: "Lighthouse targeting", color: "#f5b547" },
  { key: "risk_ranked", label: "Business as usual", color: "#8da4c4" },
  { key: "random", label: "Random outreach", color: "#4a5263" },
] as const;

function downloadCsv(rows: CampaignResult["targets"]) {
  const header = ["customer_id", "city", "churn_probability", "clv", "play", "recommended_offer", "expected_net_value", "priority"];
  const csv = [header.join(","), ...rows.map((r) => header.map((h) => JSON.stringify(r[h as keyof typeof r] ?? "")).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "lighthouse_campaign_targets.csv" });
  a.click();
  URL.revokeObjectURL(url);
}

export default function CampaignPage() {
  const [budget, setBudget] = useState(15000);
  const [costs, setCosts] = useState<Record<string, number>>(DEFAULT_COSTS);
  const [result, setResult] = useState<CampaignResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const { data: curve } = useApi<{ budget: number; uplift_optimised: number; risk_ranked: number; random: number }[]>(
    "/api/campaign/budget-curve?points=10&max_budget=60000");
  const { data: model } = useApi<{ uplift: { offers: OfferEvidence[] } }>("/api/model");

  useEffect(() => {
    setRunning(true);
    const t = setTimeout(() => {
      api<CampaignResult>("/api/campaign", { method: "POST", body: JSON.stringify({ budget, offer_costs: costs }) })
        .then((r) => { setResult(r); setError(null); })
        .catch((e: Error) => setError(e.message))
        .finally(() => setRunning(false));
    }, 250);
    return () => clearTimeout(t);
  }, [budget, costs]);

  const smart = result?.strategies.uplift_optimised;
  const bau = result?.strategies.risk_ranked;
  // Size the test conservatively: baseline = targets' mean risk, effect capped at 10 pts
  const targetRisk = result?.targets.length
    ? result.targets.reduce((s, t) => s + t.churn_probability, 0) / result.targets.length : 0.3;
  const effect = smart && smart.customers ? Math.max(0.02, Math.min(0.1, smart.expected_customers_saved / smart.customers)) : 0.05;
  const ab = useApi<{ per_arm: number; total: number }>(
    smart && smart.customers ? `/api/abtest?baseline_churn=${targetRisk.toFixed(3)}&expected_reduction=${effect.toFixed(3)}` : null);

  // Plotted as churn *reduction* (positive = good), so the CI flips sign too.
  const evidence = useMemo(() => (model?.uplift.offers ?? []).map((o) => {
    const dr = -o.dr_effect * 100;
    const lo = -o.dr_ci_high * 100;
    const hi = -o.dr_ci_low * 100;
    return { ...o, naive: -o.naive_effect * 100, dr, err: [dr - lo, hi - dr] };
  }).sort((a, b) => a.offer.localeCompare(b.offer)), [model]);

  const mix = Object.entries(result?.offer_mix ?? {}).map(([k, v]) => ({ offer: k, customers: v }))
    .sort((a, b) => a.offer.localeCompare(b.offer));

  if (error) return <ErrorBox error={error} />;

  return (
    <div>
      <PageHeader index="03" label="Campaign Planner" title="Spend the retention budget where it changes outcomes"
        subtitle="Lighthouse ranks every active customer by expected net value: estimated offer uplift × CLV protected − offer cost. Then it compares that plan with what most teams do today." />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardTitle label="Inputs" title="Campaign budget" />
          <div className="font-display num text-4xl font-normal text-lamp">{money(budget, false)}</div>
          <input type="range" min={1000} max={60000} step={1000} value={budget}
            onChange={(e) => setBudget(Number(e.target.value))} className="mt-4 w-full" />
          <div className="mt-1 flex justify-between text-[11px] text-faint"><span>$1k</span><span>$60k</span></div>

          <div className="label mb-2 mt-6">Offer cost per customer</div>
          <div className="grid grid-cols-5 gap-2">
            {Object.entries(costs).map(([k, v]) => (
              <label key={k} className="rounded-lg border border-line bg-bg-2 px-2 py-1.5 text-center">
                <div className="text-[10px] text-faint">{k.replace("Offer ", "")}</div>
                <input type="number" min={0} value={v} onChange={(e) => setCosts({ ...costs, [k]: Number(e.target.value) })}
                  className="num w-full bg-transparent text-center text-sm text-text outline-none" />
              </label>
            ))}
          </div>
          <p className="mt-4 text-[11px] leading-relaxed text-faint">
            Value uses survival CLV conditional on retention (60-month horizon, 60% margin, 10% annual discount).
            Offers are only sent within their tenure tier.
          </p>
        </Card>

        <div className="grid gap-4 sm:grid-cols-3 xl:col-span-2">
          {STRATS.map((s) => {
            const r = result?.strategies[s.key];
            const best = s.key === "uplift_optimised";
            return (
              <div key={s.key} className={`card p-5 ${best ? "!border-lamp/60" : ""}`}>
                <div className="flex items-center justify-between">
                  <span className="label" style={{ color: s.color }}>{s.label}</span>
                  {best && <Trophy size={15} className="text-beam" />}
                </div>
                {!r ? <Skeleton className="mt-4 h-28" /> : (
                  <>
                    <div className={`font-display num mt-4 text-3xl font-normal ${r.net_value >= 0 ? (best ? "text-lamp" : "text-text") : "text-bad"}`}>
                      {money(r.net_value)}
                    </div>
                    <div className="text-xs text-muted">net value retained</div>
                    <dl className="mt-4 space-y-1.5 text-xs">
                      <div className="flex justify-between"><dt className="text-muted">Customers contacted</dt><dd className="num">{num(r.customers)}</dd></div>
                      <div className="flex justify-between"><dt className="text-muted">Expected saves</dt><dd className="num">{num(r.expected_customers_saved, 1)}</dd></div>
                      <div className="flex justify-between"><dt className="text-muted">Spend</dt><dd className="num">{money(r.spend)}</dd></div>
                      <div className="flex justify-between"><dt className="text-muted">ROI</dt>
                        <dd className={`num ${r.roi >= 0 ? "text-good" : "text-bad"}`}>{r.roi >= 0 ? "+" : ""}{(r.roi * 100).toFixed(0)}%</dd></div>
                    </dl>
                    <p className="mt-3 border-t border-line pt-3 text-[11px] leading-relaxed text-faint">{result?.strategy_notes[s.key]}</p>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {smart && bau && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-panel-2 px-5 py-4 text-sm">
          {running ? <Loader2 size={16} className="animate-spin text-beam" /> : <Trophy size={16} className="text-beam" />}
          <span>
            With the same {money(budget, false)}, Lighthouse retains <b className="text-beam">{money(smart.net_value - bau.net_value)}</b> more net value than business as usual,
            and saves <b>{num(smart.expected_customers_saved - bau.expected_customers_saved, 0)}</b> more customers.
          </span>
        </div>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardTitle label="Budget curve" title="Net value retained as budget grows"
            hint="Diminishing returns show where the next dollar stops paying for itself." />
          <div className="h-64">
            {!curve ? <Skeleton className="h-full" /> : (
              <ResponsiveContainer>
                <LineChart data={curve} margin={{ left: 0, right: 10, top: 6 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="budget" tickFormatter={(v) => `$${Math.round(v / 1000)}k`} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={(v) => money(v)} tickLine={false} axisLine={false} width={60} />
                  <ReferenceLine y={0} stroke="#262d3d" />
                  <ReferenceLine x={budget} stroke="#f5b547" strokeDasharray="4 4" />
                  <Tooltip {...tooltipStyle} formatter={(v: number) => money(v)} labelFormatter={(v) => `Budget ${money(Number(v), false)}`} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {STRATS.map((s) => <Line key={s.key} dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2.2} dot={false} />)}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
        <Card className="xl:col-span-2">
          <CardTitle label="Offer mix" title="Which offers the plan sends" />
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={mix} layout="vertical" margin={{ left: 10, right: 20 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="offer" tickLine={false} axisLine={false} width={64} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="customers" fill="#f5b547" radius={[0, 6, 6, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardTitle label="Causal evidence" title="Naive comparison vs causal estimate, per offer"
            hint="Naive: churn of recipients vs all non-recipients. Causal: doubly-robust estimate within the offer's tenure tier, with 95% CI. Positive = churn reduced." />
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={evidence} margin={{ left: -10, top: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="offer" tickLine={false} axisLine={false} />
                <YAxis tickFormatter={(v) => `${v}`} tickLine={false} axisLine={false} unit=" pt" width={52} />
                <ReferenceLine y={0} stroke="#262d3d" />
                <Tooltip {...tooltipStyle} formatter={(v: number, n) => [`${v.toFixed(1)} pts`, n]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="naive" name="Naive churn reduction" fill="#4a5263" radius={[4, 4, 0, 0]} />
                <Bar dataKey="dr" name="Causal (DR, within tier)" radius={[4, 4, 0, 0]}>
                  {evidence.map((e) => <Cell key={e.offer} fill={e.dr > 0 ? "#4fc48a" : "#f2685c"} />)}
                  <ErrorBar dataKey="err" width={5} stroke="#eceef2" strokeOpacity={0.6} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-muted">
            Offer A looks like a 20-point win until you compare like with like: it is only given to 66+ month customers, who rarely churn anyway.
            Offer E, sent to every new customer, trends <span className="text-bad">harmful</span>. No offer works on average; value comes from targeting the customers each one helps.
          </p>
        </Card>
        <Card className="xl:col-span-2">
          <CardTitle label="Validate" title="A/B test to confirm the plan" right={<FlaskConical size={16} className="text-text" />} />
          {ab.data ? (
            <div>
              <div className="font-display num text-3xl font-normal text-text">{num(ab.data.total)}</div>
              <div className="text-xs text-muted">customers needed ({num(ab.data.per_arm)} per arm)</div>
              <ul className="mt-4 space-y-2 text-sm text-muted">
                <li>• Randomise eligible targets into offer vs hold-out</li>
                <li>• 80% power, 5% significance, two-sided</li>
                <li>• Primary metric: 90-day churn; secondary: net revenue</li>
                <li>• Re-train uplift models on the experiment data</li>
              </ul>
            </div>
          ) : <Skeleton className="h-32" />}
        </Card>
      </div>

      <Card className="mt-4 !p-0">
        <div className="flex items-center justify-between p-5 pb-3">
          <div>
            <div className="label mb-1">Target list</div>
            <h3 className="text-[15px] font-medium">Who to contact, with which offer</h3>
          </div>
          <button onClick={() => result && downloadCsv(result.targets)}
            className="inline-flex items-center gap-2 rounded-lg border border-line-2 px-3 py-1.5 text-xs text-text hover:bg-white/5">
            <Download size={14} /> Export CSV for CRM
          </button>
        </div>
        <div className="max-h-[420px] overflow-auto scrollbar-thin">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="sticky top-0 bg-panel">
              <tr className="text-left text-[13px] text-faint">
                <th className="px-5 py-2 font-medium">Customer</th>
                <th className="px-3 py-2 font-medium">Risk</th>
                <th className="px-3 py-2 text-right font-medium">CLV</th>
                <th className="px-3 py-2 font-medium">Play</th>
                <th className="px-3 py-2 font-medium">Offer</th>
                <th className="px-5 py-2 text-right font-medium">Net value</th>
              </tr>
            </thead>
            <tbody>
              {result?.targets.slice(0, 100).map((t) => (
                <tr key={t.customer_id} className="border-t border-line/70 hover:bg-white/[0.02]">
                  <td className="px-5 py-2.5">
                    <Link href={`/customers/${t.customer_id}`} className="font-medium hover:text-beam">{t.customer_id}</Link>
                    <div className="text-[11px] text-faint">{t.city}</div>
                  </td>
                  <td className="px-3"><RiskBar p={t.churn_probability} /></td>
                  <td className="num px-3 text-right">{money(t.clv)}</td>
                  <td className="px-3 text-xs text-muted">{t.play}</td>
                  <td className="px-3"><Badge tone="warn">{t.recommended_offer}</Badge></td>
                  <td className="num px-5 text-right text-good">{money(t.expected_net_value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-line px-5 py-3 text-xs text-muted">
          Showing top {Math.min(100, result?.targets.length ?? 0)} of {num(smart?.customers ?? 0)} targets · {pct(smart ? smart.customers / 5174 : 0)} of the active base
        </div>
      </Card>
    </div>
  );
}
