"use client";

import { ArrowLeft, ArrowRight, CalendarClock, Gift, Loader2, RotateCcw, Sparkles, Wand2 } from "lucide-react";
import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from "recharts";

import { Badge, Card, CardTitle, ErrorBox, Skeleton, priorityTone, riskTone, tooltipStyle } from "@/components/ui";
import { api, type Reason } from "@/lib/api";
import { money, num, pct, riskColor } from "@/lib/format";
import { useApi } from "@/lib/useApi";

type Detail = Record<string, unknown> & {
  customer_id: string; city: string; age: number; gender: string; contract: string;
  tenure_in_months: number; monthly_charge: number; internet_type: string; payment_method: string;
  churn_probability: number; risk_band: string; confidence: string; clv: number; value_at_risk: number;
  median_months_left: number; expected_remaining_months: number; priority: string;
  best_offer: string; offer_net_value: number; offer_churn_reduction: number; churn: number;
  churn_category: string; churn_reason: string; number_of_referrals: number;
  premium_tech_support: number; online_security: number; unlimited_data: number;
  top_reasons: Reason[]; offer_uplift: Record<string, number | null>;
  playbook: { name: string; secondary: string | null; why: string; actions: string[]; channel: string;
    kpi: string; urgency: string; triggered_by: string[] };
  peer_churn_rate: number; peer_count: number;
};

type SimResult = {
  before: { churn_probability: number; clv: number; median_months_left: number };
  after: { churn_probability: number; clv: number; median_months_left: number; top_reasons: Reason[] };
  delta_probability: number; delta_clv: number;
};

function Gauge({ p, size = 150 }: { p: number; size?: number }) {
  const r = size / 2 - 12;
  const c = Math.PI * r;
  return (
    <svg width={size} height={size / 2 + 18} viewBox={`0 0 ${size} ${size / 2 + 18}`}>
      <path d={`M 12 ${size / 2} A ${r} ${r} 0 0 1 ${size - 12} ${size / 2}`} stroke="#151a24" strokeWidth="12" fill="none" strokeLinecap="round" />
      <path d={`M 12 ${size / 2} A ${r} ${r} 0 0 1 ${size - 12} ${size / 2}`} stroke={riskColor(p)} strokeWidth="12" fill="none"
        strokeLinecap="round" strokeDasharray={`${c * p} ${c}`} style={{ transition: "stroke-dasharray 0.6s ease" }} />
      <text x="50%" y={size / 2 - 4} textAnchor="middle" className="num font-display" fill="#eceef2" fontSize="34" fontWeight="400">
        {(p * 100).toFixed(0)}%
      </text>
      <text x="50%" y={size / 2 + 16} textAnchor="middle" fill="#a3aab8" fontSize="13">churn risk</text>
    </svg>
  );
}

const SIM_FIELDS: { key: string; label: string }[] = [
  { key: "contract", label: "Contract" },
  { key: "premium_tech_support", label: "Premium tech support" },
  { key: "online_security", label: "Online security" },
  { key: "unlimited_data", label: "Unlimited data" },
  { key: "payment_method", label: "Payment method" },
  { key: "internet_type", label: "Internet type" },
  { key: "number_of_referrals", label: "Referrals" },
  { key: "monthly_charge", label: "Monthly charge ($)" },
];

export default function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: c, error } = useApi<Detail>(`/api/customers/${id}`);
  const { data: options } = useApi<Record<string, (string | number)[] | "number">>("/api/simulate/options");

  const [changes, setChanges] = useState<Record<string, string | number>>({});
  const [sim, setSim] = useState<SimResult | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [msg, setMsg] = useState<{ text?: string; error?: string; loading?: boolean }>({});

  useEffect(() => {
    if (!c || Object.keys(changes).length === 0) { setSim(null); return; }
    setSimLoading(true);
    const t = setTimeout(() => {
      api<SimResult>("/api/simulate", { method: "POST", body: JSON.stringify({ customer_id: id, changes }) })
        .then(setSim).catch(() => setSim(null)).finally(() => setSimLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [changes, c, id]);

  const upliftData = useMemo(() => c ? Object.entries(c.offer_uplift)
    .map(([offer, v]) => ({ offer: offer.replace("Offer ", ""), name: offer, value: v == null ? 0 : v * 100, missing: v == null }))
    : [], [c]);

  if (error) return <ErrorBox error={error} />;
  if (!c) return <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-80" /></div>;

  const value = (k: string) => (k in changes ? changes[k] : (c[k] as string | number));
  const p = sim ? sim.after.churn_probability : c.churn_probability;

  const draftMessage = async () => {
    setMsg({ loading: true });
    try {
      const r = await api<{ message: string }>("/api/ai/message", { method: "POST", body: JSON.stringify({ customer_id: id }) });
      setMsg({ text: r.message });
    } catch (e) { setMsg({ error: (e as Error).message }); }
  };

  return (
    <div className="fade-up">
      <Link href="/customers" className="mb-5 inline-flex items-center gap-1.5 text-xs text-muted hover:text-text">
        <ArrowLeft size={14} /> All customers
      </Link>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label mb-2">Customer profile</div>
          <h1 className="text-3xl font-semibold tracking-tight">{c.customer_id}</h1>
          <p className="mt-1.5 text-sm text-muted">
            {c.age}-year-old in {c.city} · {c.contract} · {c.tenure_in_months} months · {c.internet_type === "None" ? "No internet" : c.internet_type} · {money(c.monthly_charge, false)}/mo
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={priorityTone(c.priority)}>{c.priority}</Badge>
          <Badge tone={riskTone(c.risk_band)}>{c.risk_band} risk</Badge>
          <Badge tone={c.confidence === "Uncertain" ? "warn" : "muted"}>Conformal: {c.confidence}</Badge>
          {c.churn === 1 && <Badge tone="bad">Churned · {c.churn_category}</Badge>}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="flex flex-col items-center justify-center">
          <Gauge p={p} size={190} />
          {sim && (
            <div className="mt-1 text-xs">
              <span className="text-muted">was {pct(c.churn_probability, 0)} </span>
              <span className={sim.delta_probability < 0 ? "text-good" : "text-bad"}>
                ({sim.delta_probability > 0 ? "+" : ""}{(sim.delta_probability * 100).toFixed(1)} pts)
              </span>
            </div>
          )}
          <div className="mt-5 grid w-full grid-cols-3 gap-2 border-t border-line pt-4 text-center">
            <div>
              <div className="label !text-[9px]">CLV</div>
              <div className="num mt-1 text-lg font-semibold">{money(sim ? sim.after.clv : c.clv)}</div>
            </div>
            <div>
              <div className="label !text-[9px]">At risk</div>
              <div className="num mt-1 text-lg font-semibold text-beam">{money((sim ? sim.after.clv : c.clv) * p)}</div>
            </div>
            <div>
              <div className="label !text-[9px]">Months left</div>
              <div className="num mt-1 text-lg font-semibold">
                {(() => { const m = sim ? sim.after.median_months_left : c.median_months_left; return m >= 60 ? "60+" : m; })()}
              </div>
            </div>
          </div>
          <div className="mt-4 w-full rounded-lg bg-white/[0.03] px-3 py-2 text-[11px] text-muted">
            Similar customers ({c.contract}, {c.internet_type}): <span className="text-text">{pct(c.peer_churn_rate)}</span> churned · n={num(c.peer_count)}
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <CardTitle label="Why" title="What is pushing this customer away"
            hint="SHAP contributions from the gradient-boosted member of the ensemble, in log-odds." />
          <div className="space-y-3">
            {c.top_reasons.length === 0 && <div className="text-sm text-muted">No strong churn drivers. This customer looks stable.</div>}
            {c.top_reasons.map((r) => {
              const max = c.top_reasons[0]?.impact || 1;
              return (
                <div key={r.feature}>
                  <div className="mb-1.5 flex items-baseline justify-between text-sm">
                    <span className="text-text">{r.label}
                      <span className="ml-2 text-xs text-faint">= {Number.isInteger(r.value) ? r.value : r.value.toFixed(2)}</span>
                    </span>
                    <span className="num text-xs text-bad">+{r.impact.toFixed(2)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/5">
                    <div className="h-full rounded-full bg-bad/80" style={{ width: `${(r.impact / max) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 grid gap-4 border-t border-line pt-5 md:grid-cols-2">
            <div>
              <div className="label mb-2">Recommended play</div>
              <div className="text-lg font-semibold text-beam">{c.playbook.name}</div>
              {c.playbook.secondary && <div className="text-xs text-muted">then {c.playbook.secondary}</div>}
              <p className="mt-2 text-sm text-muted">{c.playbook.why}</p>
              <p className="mt-2 text-xs text-faint">{c.playbook.urgency}</p>
            </div>
            <div>
              <ul className="space-y-2">
                {c.playbook.actions.map((a) => (
                  <li key={a} className="flex gap-2 text-sm text-text"><ArrowRight size={14} className="mt-0.5 shrink-0 text-beam" />{a}</li>
                ))}
              </ul>
              <div className="mt-3 text-xs text-muted">Channel: <span className="text-text">{c.playbook.channel}</span></div>
              <div className="text-xs text-muted">Measure: <span className="text-text">{c.playbook.kpi}</span></div>
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card>
          <CardTitle label="Offer uplift" title="Churn reduction by offer"
            hint="T-learner estimate of how much each offer changes this customer's churn probability, after propensity adjustment. Observational: validate with an A/B test." />
          <div className="h-48">
            <ResponsiveContainer>
              <BarChart data={upliftData} margin={{ left: -22, top: 8 }}>
                <XAxis dataKey="offer" tickLine={false} axisLine={false} />
                <YAxis tickFormatter={(v) => `${v.toFixed(0)}`} tickLine={false} axisLine={false} />
                <ReferenceLine y={0} stroke="#262d3d" />
                <Tooltip {...tooltipStyle} formatter={(v: number, _n, item) =>
                  item.payload.missing ? ["Not eligible at this tenure", "Offer tier"] : [`${v.toFixed(1)} pts`, "Churn reduction"]} />
                <Bar dataKey="value" radius={[5, 5, 5, 5]}>
                  {upliftData.map((d) => <Cell key={d.offer} fill={d.name === c.best_offer ? "#f5b547" : d.value > 0 ? "#8da4c4" : "#f2685c"} fillOpacity={d.missing ? 0.2 : 0.85} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mb-2 text-[11px] text-faint">
            Offers are tenure-gated tiers; faded bars are not available at {c.tenure_in_months} months.
          </div>
          <div className="flex items-center gap-2 rounded-md bg-panel-2 px-3 py-2 text-sm">
            <Gift size={15} className="text-beam" />
            {c.best_offer === "No offer"
              ? <span className="text-muted">No offer pays for itself here. Save the budget.</span>
              : <span className="text-text">Send <b>{c.best_offer}</b>: expected net value <b className="text-beam">{money(c.offer_net_value)}</b></span>}
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <CardTitle label="What-if simulator" title="Change the relationship, watch the risk move"
            right={Object.keys(changes).length > 0 && (
              <button onClick={() => setChanges({})} className="inline-flex items-center gap-1 text-xs text-muted hover:text-text">
                <RotateCcw size={12} /> Reset
              </button>
            )} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {SIM_FIELDS.map(({ key, label }) => {
              const opt = options?.[key];
              const v = value(key);
              const changed = key in changes;
              return (
                <label key={key} className={`rounded-lg border p-3 transition ${changed ? "border-beam/50 bg-beam/5" : "border-line bg-bg-2"}`}>
                  <div className="label !text-[9px] mb-1.5">{label}</div>
                  {opt === "number" ? (
                    <input type="number" value={v as number} min={0}
                      onChange={(e) => setChanges({ ...changes, [key]: Number(e.target.value) })}
                      className="w-full bg-transparent text-sm text-text outline-none" />
                  ) : (
                    <select value={String(v)} onChange={(e) => {
                      const raw = e.target.value;
                      const parsed = Array.isArray(opt) && typeof opt[0] === "number" ? Number(raw) : raw;
                      setChanges({ ...changes, [key]: parsed });
                    }} className="w-full bg-transparent text-sm text-text outline-none">
                      {Array.isArray(opt) && opt.map((o) => (
                        <option key={String(o)} value={String(o)} className="bg-bg-2">
                          {typeof o === "number" ? (o ? "Yes" : "No") : o}
                        </option>
                      ))}
                    </select>
                  )}
                </label>
              );
            })}
          </div>
          <div className="mt-4 flex min-h-[44px] items-center gap-3 rounded-lg border border-line bg-bg-2 px-4 py-2.5 text-sm">
            {simLoading ? <Loader2 size={16} className="animate-spin text-muted" /> : <Wand2 size={16} className="text-beam" />}
            {sim ? (
              <span>
                Risk {pct(sim.before.churn_probability, 0)} → <b>{pct(sim.after.churn_probability, 0)}</b>
                <span className={sim.delta_probability < 0 ? " text-good" : " text-bad"}> ({sim.delta_probability > 0 ? "+" : ""}{(sim.delta_probability * 100).toFixed(1)} pts)</span>
                {" · "}CLV {money(sim.before.clv)} → <b>{money(sim.after.clv)}</b>
                <span className={sim.delta_clv > 0 ? " text-good" : " text-bad"}> ({sim.delta_clv > 0 ? "+" : ""}{money(sim.delta_clv)})</span>
              </span>
            ) : <span className="text-muted">Try moving this customer to a one-year contract or adding tech support.</span>}
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardTitle label="AI outreach" title="Personalised retention message"
          right={<button onClick={draftMessage} disabled={msg.loading}
            className="inline-flex items-center gap-2 rounded-lg border border-line-2 bg-panel-2 px-3 py-1.5 text-xs font-medium text-text transition hover:bg-panel-2 disabled:opacity-50">
            {msg.loading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Draft with AI
          </button>} />
        {msg.text ? <div className="whitespace-pre-wrap rounded-lg bg-bg-2 p-4 text-sm leading-relaxed text-text">{msg.text}</div>
          : msg.error ? <div className="text-sm text-bad">{msg.error}</div>
          : <div className="flex items-center gap-2 text-sm text-muted"><CalendarClock size={14} />Generates an email grounded in this customer&apos;s drivers, play and best offer.</div>}
      </Card>
    </div>
  );
}
