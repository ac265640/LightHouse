"use client";

import clsx from "clsx";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import LightRays from "./bits/LightRays";
import Magnet from "./bits/Magnet";
import ScrollReveal from "./bits/ScrollReveal";
import SplitText from "./bits/SplitText";
import { Coastline, type MapData } from "./Coastline";
import { Decrypt, Figure, Reveal, fmt, reducedMotion } from "./motion";
import { API_URL, api, type CustomerRow, type Summary } from "@/lib/api";
import { money, num, pct } from "@/lib/format";
import { useApi } from "@/lib/useApi";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

const GUTTER = "px-[max(20px,env(safe-area-inset-left))] md:px-8";

/* ── Buttons ──────────────────────────────────────────────────────────────── */

export function LampButton({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Magnet padding={60} magnetStrength={4} maxOffset={10} className="inline-block">
      <Link href={href}
        className={clsx("group inline-flex h-12 items-center gap-2.5 bg-lamp px-6 text-[16px] font-medium text-[var(--lamp-ink)] transition-[filter] duration-200 hover:brightness-110 active:brightness-95", className)}>
        {children}
        <ArrowRight size={17} className="transition-transform duration-300 group-hover:translate-x-1" />
      </Link>
    </Magnet>
  );
}

/* ── Hero: the coastline with the name under it ───────────────────────────── */

export function Hero({ map, summary }: { map?: MapData | null; summary?: Summary | null }) {
  const word = useRef<HTMLDivElement>(null);
  const [lit, setLit] = useState({ atRisk: 0, value: 0 });

  useLayoutEffect(() => {
    if (!word.current || reducedMotion()) return;
    const t = gsap.to(word.current, {
      scale: 0.93, yPercent: -6, ease: "none", transformOrigin: "50% 100%",
      scrollTrigger: { trigger: word.current, start: "top 70%", end: "bottom top", scrub: true },
    });
    return () => { t.scrollTrigger?.kill(); t.kill(); };
  }, []);

  return (
    <section className="relative flex min-h-[100svh] flex-col">
      <nav className={clsx("absolute inset-x-0 top-0 z-20 flex items-center justify-between py-5", GUTTER)} aria-label="Main">
        <span className="text-[15px] text-muted">Retention intelligence</span>
        <div className="flex items-center gap-6 text-[15px]">
          <a href="#how" className="hidden text-muted transition-colors hover:text-text sm:inline">How it works</a>
          <a href="#evidence" className="hidden text-muted transition-colors hover:text-text sm:inline">Evidence</a>
          <Link href="/watch" className="text-muted transition-colors hover:text-text">Watch</Link>
          <a href="https://github.com/ac265640/LightHouse" className="hidden text-muted transition-colors hover:text-text sm:inline">GitHub</a>
          <Link href="/overview" className="text-text underline decoration-lamp decoration-2 underline-offset-[6px] transition-colors hover:text-lamp">Open workspace</Link>
        </div>
      </nav>

      <div className="relative h-[40svh] min-h-[260px] w-full md:h-[52svh] md:min-h-[340px]">
        {map ? (
          <Coastline data={map} orient="horizontal" className="absolute inset-0" onLit={setLit} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[15px] text-faint">Plotting 7,043 customers…</div>
        )}
        <div className={clsx("pointer-events-none absolute -bottom-10 left-0 flex flex-wrap items-baseline gap-x-3 gap-y-0 text-[14px] md:bottom-4 md:gap-x-6 md:text-[15px]", GUTTER)}>
          <span className="text-muted">In the beam now</span>
          <span className="font-display num text-[22px] text-bad"><Figure value={lit.atRisk} format={fmt.int} /></span>
          <span className="text-muted">customers likely to leave, worth</span>
          <span className="font-display num text-[22px] text-lamp"><Figure value={lit.value} format={fmt.money(lit.value)} /></span>
        </div>
      </div>

      <div className={clsx("flex flex-1 flex-col justify-end pb-2 pt-16 md:pt-6", GUTTER)}>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <p className="max-w-[34ch] text-[17px] leading-[1.5] text-text md:text-[20px]">
            See which customers are about to leave, what each one is worth, and the offer that will actually keep them.
          </p>
          <LampButton href="/overview">Open the workspace</LampButton>
        </div>
        <div ref={word} className="mt-4 will-change-transform">
          <SplitText tag="h1" text="Lighthouse" splitType="chars" trigger="load" effect="rise" mask delay={60} duration={1.1}
            className="font-display block select-none whitespace-nowrap pb-[0.08em] text-[clamp(84px,17.5vw,290px)] font-normal leading-[0.85] tracking-[-0.05em] text-text" />
        </div>
      </div>
      <span className="sr-only">{summary ? `${num(summary.customers)} customers scored.` : ""}</span>
    </section>
  );
}

/* ── The cost of doing nothing ────────────────────────────────────────────── */

export function Cost({ s }: { s?: Summary | null }) {
  const gone = s ? s.customers - s.active_customers : 1869;
  return (
    <section className={clsx("py-[clamp(120px,18vw,240px)]", GUTTER)} aria-labelledby="cost-h">
      <h2 id="cost-h" className="sr-only">What churn cost last quarter</h2>
      <div className="grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <ScrollReveal mode="scrub" splitBy="words" effect="fade" baseOpacity={0.14} enableBlur blurStrength={3}
            textClassName="font-display text-[clamp(24px,2.6vw,36px)] font-normal leading-[1.2] tracking-[-0.015em] text-text">
            {`Last quarter ${num(gone)} of ${num(s?.customers ?? 7043)} customers left, and ${money(s?.monthly_revenue_lost ?? 139131)} of monthly revenue went with them. Most of them could have been seen coming.`}
          </ScrollReveal>
        </div>
        <Reveal className="flex flex-col justify-end gap-6 lg:col-span-4">
          {[
            [pct(s?.churn_rate ?? 0.265), "of customers left in a single quarter"],
            [pct(s?.by_contract.find((c) => c.contract === "Month-to-Month")?.churn_rate ?? 0.458), "churn on month-to-month contracts, against 2.5% on two-year"],
            [money(s?.active_value_at_risk ?? 389458), "of lifetime value still at risk in the customers who stayed"],
          ].map(([v, l]) => (
            <div key={l} className="grid grid-cols-[132px_1fr] items-baseline gap-6">
              <span className="font-display num text-right text-[32px] text-text">{v}</span>
              <span className="text-[16px] leading-snug text-muted">{l}</span>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

/* ── Three questions: call and response ───────────────────────────────────── */

type CampaignResult = { strategies: Record<string, { net_value: number; customers: number; roi: number; expected_customers_saved: number }> };

export function Questions({ s }: { s?: Summary | null }) {
  const top = s?.top_at_risk ?? [];
  const lead = top[0];
  const [budget, setBudget] = useState(15000);
  const [res, setRes] = useState<CampaignResult | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      api<CampaignResult>("/api/campaign", { method: "POST", body: JSON.stringify({ budget }) }).then(setRes).catch(() => {});
    }, 160);
    return () => clearTimeout(t);
  }, [budget]);
  const strat = res?.strategies;
  const rows = strat ? [
    { k: "Lighthouse targeting", v: strat.uplift_optimised.net_value, main: true },
    { k: "Business as usual", v: strat.risk_ranked.net_value },
    { k: "Random outreach", v: strat.random.net_value },
  ] : [];
  const span = Math.max(1, ...rows.map((r) => Math.abs(r.v)));

  return (
    <section id="how" className={clsx("pb-[clamp(120px,16vw,220px)]", GUTTER)} aria-labelledby="how-h">
      <div className="max-w-[980px]">
        <div>
          <h2 id="how-h" className="font-display text-[clamp(32px,3.4vw,48px)] font-normal leading-[1.05] tracking-[-0.02em]">Ask it three questions</h2>
        </div>

        <Exchange n="First, ask who is leaving." call="Who is most likely to leave, and worth keeping?">
          <div data-ui className="w-full max-w-[560px] rounded-lg bg-panel p-2">
            {top.slice(0, 5).map((c) => (
              <div key={c.customer_id} className="flex items-center justify-between gap-4 rounded-md px-3 py-2.5 transition-colors hover:bg-panel-2">
                <div className="min-w-0">
                  <div className="num text-[15px] text-text">{c.customer_id}</div>
                  <div className="truncate text-[13px] text-faint">{c.city} · {c.contract} · {c.tenure_in_months} months</div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-1 w-20 overflow-hidden rounded-full bg-panel-2">
                    <div className="h-full rounded-full bg-bad" style={{ width: `${c.churn_probability * 100}%` }} />
                  </div>
                  <span className="num w-10 text-right text-[15px] text-bad">{pct(c.churn_probability, 0)}</span>
                </div>
              </div>
            ))}
          </div>
        </Exchange>

        <Exchange n="Then, ask what each one is worth." call={lead ? `How long will ${lead.customer_id} stay, and what is that worth?` : "How long will they stay?"}>
          {lead && (
            <div data-ui className="grid w-full max-w-[560px] grid-cols-3 gap-px overflow-hidden rounded-lg bg-line">
              {[
                ["Expected months left", lead.median_months_left, fmt.dec(0), "text-text"],
                ["Worth if kept", lead.clv, fmt.money(lead.clv), "text-text"],
                ["Value at risk", lead.value_at_risk, fmt.money(lead.value_at_risk), "text-lamp"],
              ].map(([l, v, f, c]) => (
                <div key={l as string} className="bg-panel p-4">
                  <div className="text-[13px] text-faint">{l as string}</div>
                  <div className={clsx("font-display num mt-2 text-[30px] leading-none", c as string)}>
                    <Figure value={v as number} format={f as Intl.NumberFormatOptions} />
                  </div>
                </div>
              ))}
              <div className="col-span-3 bg-panel px-4 pb-4 text-[13px] leading-relaxed text-muted">
                From a survival model corrected for the quarterly snapshot, at a 60% margin over five years.
                The recommended play is <span className="text-text">{lead.play.toLowerCase()}</span>.
              </div>
            </div>
          )}
        </Exchange>

        <Exchange n="Finally, ask what will keep them." call={`I have ${money(budget, false)}. Who should we contact, and with which offer?`} wide>
          <div data-ui className="w-full rounded-lg bg-panel p-5">
            <div className="flex flex-wrap items-center gap-4">
              <label htmlFor="budget" className="text-[14px] text-muted">Budget</label>
              <input id="budget" type="range" min={2000} max={50000} step={1000} value={budget}
                onChange={(e) => setBudget(Number(e.target.value))} className="min-w-[180px] flex-1" />
              <span className="font-display num w-28 text-right text-[24px] text-text">{money(budget, false)}</span>
            </div>
            <div className="mt-6 flex flex-col gap-4">
              {rows.map((r) => (
                <div key={r.k} className="grid grid-cols-[150px_1fr_110px] items-center gap-4 md:grid-cols-[190px_1fr_120px]">
                  <span className={clsx("text-[14px]", r.main ? "text-text" : "text-muted")}>{r.k}</span>
                  <div className="relative h-7">
                    <div className="absolute inset-y-0 left-1/2 w-px bg-line-2" />
                    <div className="absolute inset-y-0 transition-[left,width] duration-700 ease-[cubic-bezier(.16,1,.3,1)]"
                      style={{
                        left: r.v >= 0 ? "50%" : `${50 - (Math.abs(r.v) / span) * 50}%`,
                        width: `${(Math.abs(r.v) / span) * 50}%`,
                        background: r.main ? "var(--lamp)" : r.v < 0 ? "var(--bad)" : "var(--dim)",
                        opacity: r.main ? 1 : 0.75,
                      }} />
                  </div>
                  <span className={clsx("font-display num text-right text-[22px]", r.v < 0 ? "text-bad" : "text-lamp")}>
                    <Figure value={r.v} format={fmt.money(r.v)} />
                  </span>
                </div>
              ))}
            </div>
            {strat && (
              <p className="mt-5 text-[14px] leading-relaxed text-muted">
                Lighthouse contacts {num(strat.uplift_optimised.customers)} customers and expects to keep{" "}
                {num(strat.uplift_optimised.expected_customers_saved)} who would otherwise leave, a {strat.uplift_optimised.roi.toFixed(1)}× return.
                Sending the standard offer to the riskiest customers loses money, because most of them leave anyway.
              </p>
            )}
          </div>
        </Exchange>
      </div>
    </section>
  );
}

function Exchange({ n, call, children, wide }: { n: string; call: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <Reveal className="mt-[88px]" stagger={0.09}>
      <p data-reveal className="text-[20px] font-medium text-text">{n}</p>
      <div data-reveal className="mt-4 max-w-[560px] rounded-lg bg-panel-2 px-5 py-4 text-[16px] text-muted">
        <span className="text-faint">›</span> <span className="text-text">{call}</span>
      </div>
      <div data-reveal className={clsx("mt-4 md:pl-14", wide && "max-w-[860px]")}>{children}</div>
    </Reveal>
  );
}

/* ── Rows as a departure board ────────────────────────────────────────────── */

const STATUS: Record<string, string> = { "Save now": "bg-bad text-[#1d0805]", "Low-cost save": "bg-lamp text-[var(--lamp-ink)]", Grow: "bg-sky text-[#0b1220]", Maintain: "bg-[#3a4252] text-text" };

export function Board({ rows }: { rows: CustomerRow[] }) {
  const [open, setOpen] = useState(3);
  return (
    <section className="relative overflow-hidden py-[clamp(80px,10vw,140px)]" aria-labelledby="board-h">
      <h2 id="board-h" className={clsx("font-display mb-8 text-[clamp(32px,3.4vw,48px)] font-normal leading-[1.05] tracking-[-0.02em]", GUTTER)}>
        Next to leave
      </h2>
      <Reveal className="flex flex-col gap-1 px-3" stagger={0.05} y={16}>
        {rows.slice(0, 9).map((c, i) => {
          const isOpen = i === open;
          return (
            <button key={c.customer_id} onClick={() => setOpen(i)} aria-expanded={isOpen}
              className={clsx("grid w-full grid-cols-[1fr_auto] items-center gap-4 px-4 text-left transition-[height,background-color] duration-500 ease-[cubic-bezier(.16,1,.3,1)] md:grid-cols-12",
                isOpen ? "h-[216px] bg-lamp text-[var(--lamp-ink)]" : "h-[72px] bg-panel text-text hover:bg-panel-2")}>
              <span className="num text-[20px] md:col-span-4 md:text-[28px]">
                {isOpen ? <Decrypt text={c.customer_id} /> : c.customer_id}
                {isOpen && (
                  <span className="mt-3 block max-w-[46ch] text-[17px] leading-relaxed">
                    {c.city}, {c.contract.toLowerCase()}, {c.tenure_in_months} months with us. Worth {money(c.clv)} if kept.
                    Play: {c.play.toLowerCase()}. Best offer: {c.best_offer}.
                  </span>
                )}
              </span>
              <span className="hidden text-[28px] md:col-span-3 md:block">{isOpen ? "" : c.city}</span>
              <span className="num hidden text-right text-[28px] md:col-span-2 md:block">{pct(c.churn_probability, 0)}</span>
              <span className="num hidden text-right text-[28px] md:col-span-1 md:block">{money(c.value_at_risk)}</span>
              <span className="flex justify-end md:col-span-2">
                <span className={clsx("px-3 py-1.5 text-[15px] font-medium", isOpen ? "bg-[var(--lamp-ink)] text-lamp" : STATUS[c.priority])}>{c.priority}</span>
              </span>
            </button>
          );
        })}
      </Reveal>
      <p className={clsx("mt-6 text-[15px] text-faint", GUTTER)}>Real customers from the holdout, scored by a model that never saw them. Columns: city, churn risk, value at risk, priority.</p>
    </section>
  );
}

/* ── The reversal: naive vs causal ─────────────────────────────────────────── */

type Offer = { offer: string; window: string; naive_effect: number; dr_effect: number; dr_ci_low: number; dr_ci_high: number; cost: number };

export function Reversal({ offers }: { offers: Offer[] }) {
  const [causal, setCausal] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const max = 30;

  useEffect(() => {
    if (!ref.current || reducedMotion()) return;
    const st = ScrollTrigger.create({ trigger: ref.current, start: "top 55%", once: true, onEnter: () => setTimeout(() => setCausal(true), 1600) });
    return () => st.kill();
  }, []);

  return (
    <section id="evidence" className={clsx("py-[clamp(120px,16vw,220px)]", GUTTER)} aria-labelledby="rev-h">
      <div className="grid gap-12 lg:grid-cols-12">
        <Reveal className="lg:col-span-5">
          <h2 id="rev-h" className="font-display text-[clamp(32px,3.4vw,48px)] font-normal leading-[1.05] tracking-[-0.02em]">
            The best-looking offer did nothing
          </h2>
          <p className="mt-6 max-w-[44ch] text-[17px] leading-relaxed text-muted">
            A plain comparison says Offer A cuts churn by 20 points. But Offer A only ever went to customers past 66 months, who rarely
            leave anyway. Compared fairly, inside each tenure window with a doubly-robust estimator, the effect disappears.
            No offer works on average. The value is in choosing who receives it.
          </p>
          <div className="mt-8 inline-flex bg-panel p-1" role="tablist" aria-label="Estimate">
            {[["Plain comparison", false], ["Causal estimate", true]].map(([l, v]) => (
              <button key={l as string} role="tab" aria-selected={causal === v} onClick={() => setCausal(v as boolean)}
                className={clsx("px-4 py-2 text-[15px] transition-colors duration-300", causal === v ? "bg-lamp text-[var(--lamp-ink)]" : "text-muted hover:text-text")}>
                {l as string}
              </button>
            ))}
          </div>
        </Reveal>
        <div ref={ref} data-ui className="lg:col-span-7" aria-live="polite">
          <div className="flex flex-col gap-5">
            {offers.map((o) => {
              const v = (causal ? o.dr_effect : o.naive_effect) * 100;
              const lo = o.dr_ci_low * 100, hi = o.dr_ci_high * 100;
              const x = (val: number) => `${50 + (Math.max(-max, Math.min(max, val)) / max) * 50}%`;
              return (
                <div key={o.offer} className="grid grid-cols-[96px_1fr_72px] items-center gap-4">
                  <div>
                    <div className="text-[16px] text-text">{o.offer}</div>
                    <div className="text-[13px] text-faint">{o.window}</div>
                  </div>
                  <div className="relative h-9 bg-panel">
                    <div className="absolute inset-y-0 left-1/2 w-px bg-line-2" />
                    {causal && <div className="absolute top-1/2 h-px -translate-y-1/2 bg-text/60 transition-[left,width] duration-700" style={{ left: x(lo), width: `calc(${x(hi)} - ${x(lo)})` }} />}
                    <div className="absolute inset-y-1.5 transition-[left,width,opacity] duration-[900ms] ease-[cubic-bezier(.16,1,.3,1)]"
                      style={{ left: v < 0 ? x(v) : "50%", width: `${(Math.min(max, Math.abs(v)) / max) * 50}%`, background: v < 0 ? "var(--lamp)" : "var(--bad)", opacity: causal ? 0.95 : 0.55 }} />
                  </div>
                  <span className={clsx("font-display num text-right text-[22px]", v < 0 ? "text-lamp" : "text-bad")}>
                    <Figure value={v} format={{ minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: "always" }} />
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-5 grid grid-cols-[96px_1fr_72px] gap-4 text-[13px] text-faint">
            <span /><span className="flex justify-between"><span>fewer leave</span><span>more leave</span></span><span className="text-right">points</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Methods, as one sentence with one lit name ───────────────────────────── */

const METHODS = ["a leakage audit", "five model families", "a calibrated stack", "conformal prediction", "Cox survival with left truncation",
  "survival lifetime value", "doubly-robust uplift", "SHAP drivers", "a budget optimiser", "a fairness audit", "drift monitoring", "a Gemini copilot that cites its tools"];

export function Methods() {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reducedMotion()) return;
    const t = setInterval(() => setI((v) => (v + 1) % METHODS.length), 2000);
    return () => clearInterval(t);
  }, []);
  return (
    <section className={clsx("py-[clamp(100px,12vw,180px)]", GUTTER)} aria-labelledby="m-h">
      <h2 id="m-h" className="sr-only">How it is built</h2>
      <Reveal>
        <p className="max-w-[1100px] text-[clamp(20px,2vw,28px)] leading-[1.4] tracking-[-0.01em]">
          <span className="text-text">Built from </span>
          {METHODS.map((m, k) => (
            <span key={m} className={clsx("transition-colors duration-500", k === i ? "text-lamp" : "text-faint")}>
              {m}{k === METHODS.length - 1 ? "." : k === METHODS.length - 2 ? " and " : ", "}
            </span>
          ))}
        </p>
      </Reveal>
    </section>
  );
}

/* ── Quiet figure lines ───────────────────────────────────────────────────── */

export function Figures() {
  const lines: [number, Intl.NumberFormatOptions, string, string][] = [
    [0.923, fmt.dec(3), "", "AUC on a locked holdout of 1,409 customers the model never saw. A leaky version scores 0.998; we removed six columns that give the answer away."],
    [0.014, fmt.pct(1), "", "calibration error. When Lighthouse says 30%, about 30 in 100 of those customers leave."],
    [0.83, fmt.dec(2), "", "concordance of the survival model, which independently predicts this quarter's churn at 0.90 AUC."],
    [3.7, fmt.dec(1), "×", "return on a $15,000 campaign, where business as usual loses $11,500."],
    [28, fmt.int, "", "automated tests across the models and the API, all passing."],
  ];
  return (
    <section className={clsx("py-[clamp(120px,14vw,200px)]", GUTTER)} aria-labelledby="f-h">
      <div className="grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <h2 id="f-h" className="font-display mb-14 text-[clamp(28px,2.6vw,36px)] font-normal leading-[1.1] tracking-[-0.02em] md:pl-[156px]">Checked, not claimed</h2>
          <Reveal className="flex flex-col gap-7" stagger={0.08}>
            {lines.map(([v, f, suf, text]) => (
              <div key={text} className="grid grid-cols-[88px_1fr] items-baseline gap-6 md:grid-cols-[132px_1fr]">
                <span className="font-display num text-right text-[28px] text-text md:text-[32px]"><Figure value={v} format={f} suffix={suf} /></span>
                <span className="max-w-[46ch] text-[16px] leading-relaxed text-muted">{text}</span>
              </div>
            ))}
          </Reveal>
        </div>
        <Reveal className="lg:col-span-4 lg:col-start-9 lg:pt-24">
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="https://picsum.photos/id/870/900/1125" width={900} height={1125} loading="lazy"
              alt="A white lighthouse with its lamp lit against a deep blue night sky"
              className="aspect-[4/5] w-full object-cover [filter:brightness(0.85)_contrast(1.05)]" />
            <figcaption className="mt-3 text-[13px] text-faint">Photograph: Joshua Hibbert, Unsplash licence.</figcaption>
          </figure>
        </Reveal>
      </div>
    </section>
  );
}

/* ── Close ─────────────────────────────────────────────────────────────────── */

export function Close() {
  return (
    <section className="relative overflow-hidden" aria-labelledby="c-h">
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <LightRays raysOrigin="top-center" raysColor="#f5b547" raysSpeed={0.6} lightSpread={0.9} rayLength={1.4}
          followMouse mouseInfluence={0.08} noiseAmount={0.05} distortion={0.04} />
      </div>
      <div className={clsx("relative pb-[20svh] pt-[34svh]", GUTTER)}>
        <h2 id="c-h" className="max-w-[34ch] text-[clamp(19px,1.6vw,22px)] leading-[1.5] text-text">
          Open the workspace and see who to call today, what to offer them, and what it is worth.
        </h2>
        <div className="mt-6 flex flex-wrap items-center gap-6">
          <LampButton href="/overview">Open the workspace</LampButton>
          <a href="https://github.com/ac265640/LightHouse" className="text-[16px] text-muted underline-offset-4 transition-colors hover:text-text hover:underline">Read the code</a>
        </div>
      </div>
      <footer className={clsx("relative grid grid-cols-1 gap-2 pb-8 text-[14px] text-faint md:grid-cols-[1fr_auto_1fr]", GUTTER)}>
        <span>Lighthouse, retention intelligence</span>
        <span className="flex gap-6 text-text">
          <Link href="/overview" className="hover:text-lamp">Workspace</Link>
          <Link href="/model" className="hover:text-lamp">Model lab</Link>
          <a href="https://github.com/ac265640/LightHouse" className="hover:text-lamp">GitHub</a>
        </span>
        <span className="md:text-right">DataNova 2026 · IBM Telco churn data, California</span>
      </footer>
    </section>
  );
}

export function useLandingData() {
  // The live API sleeps when idle on the free tier; nudge it awake while the visitor reads.
  useEffect(() => { fetch(`${API_URL}/api/health`).catch(() => {}); }, []);
  const { data: map } = useApi<MapData>("/api/map");
  const { data: summary } = useApi<Summary>("/api/summary");
  const { data: model } = useApi<{ uplift: { offers: Offer[] } }>("/api/model");
  const offers = useMemo(() => model?.uplift.offers ?? [], [model]);
  return { map, summary, offers };
}
