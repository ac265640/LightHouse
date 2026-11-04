"use client";

import clsx from "clsx";
import { Info } from "lucide-react";
import type { ReactNode } from "react";

import SpotlightCard from "./bits/SpotlightCard";
import { Figure, Reveal } from "./motion";

/** A flat panel one tone above the ground. Under the cursor it catches a faint lamp light. */
export function Card({ className, children, lit = true }: { className?: string; children: ReactNode; lit?: boolean }) {
  if (!lit) return <div className={clsx("card p-5", className)}>{children}</div>;
  return (
    <SpotlightCard className={clsx("rounded-lg p-5", className)} intensity={0.06} borderGlow={0.35}
      spotlightSize={340} proximity={60} flare={false}>
      {children}
    </SpotlightCard>
  );
}

export function CardTitle({ label, title, hint, right }: {
  label?: string; title: ReactNode; hint?: string; right?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 text-[16px] font-medium leading-snug text-text">
          {title}
          {hint && (
            <span title={hint} className="cursor-help text-faint">
              <Info size={13} />
            </span>
          )}
        </h3>
        {label && <div className="mt-0.5 text-[13px] text-faint">{label}</div>}
      </div>
      {right}
    </div>
  );
}

/** Page header: the screen's name in the display face and one plain sentence. No eyebrow, no index. */
export function PageHeader({ title, subtitle, right }: {
  index?: string; label?: string; title: string; subtitle?: string; right?: ReactNode;
}) {
  return (
    <Reveal className="mb-8 flex flex-wrap items-end justify-between gap-6" scroll={false} y={14}>
      <div className="max-w-3xl">
        <h1 className="font-display text-[34px] font-normal leading-[1.05] tracking-[-0.02em] text-text md:text-[40px]">{title}</h1>
        {subtitle && <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">{subtitle}</p>}
      </div>
      {right && <div>{right}</div>}
    </Reveal>
  );
}

/**
 * A KPI set as type: label, a figure in the display face that rolls into place, and one line under it.
 * Pass `figure` for an animated number, or `value` for preformatted text.
 */
export function Stat({ label, value, figure, sub, tone = "default" }: {
  label: string; value?: ReactNode; sub?: ReactNode;
  figure?: { value: number | null | undefined; format?: Intl.NumberFormatOptions; suffix?: ReactNode; prefix?: ReactNode };
  tone?: "default" | "beam" | "bad" | "good" | "sky"; icon?: ReactNode;
}) {
  const color = { default: "text-text", beam: "text-lamp", bad: "text-bad", good: "text-good", sky: "text-sky" }[tone];
  return (
    <div className="min-w-0">
      <div className="text-[13px] text-faint">{label}</div>
      <div className={clsx("font-display num mt-2 text-[40px] font-normal leading-none tracking-[-0.02em]", color)}>
        {figure ? <Figure {...figure} /> : value}
      </div>
      {sub && <div className="mt-2 text-[13px] leading-snug text-muted">{sub}</div>}
    </div>
  );
}

const DOT: Record<string, string> = {
  bad: "bg-bad", warn: "bg-lamp", good: "bg-good", sky: "bg-sky", violet: "bg-muted", muted: "bg-faint",
};

/** Status as a word with a small coloured mark; the colour carries the meaning, the chip stays neutral. */
export function Badge({ tone = "muted", children }: { tone?: keyof typeof DOT; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-panel-2 px-2 py-0.5 text-[12.5px] text-muted">
      <span className={clsx("h-1.5 w-1.5 shrink-0 rounded-[2px]", DOT[tone])} />
      {children}
    </span>
  );
}

export const priorityTone = (p: string) =>
  ({ "Save now": "bad", "Low-cost save": "warn", Grow: "sky", Maintain: "good" } as const)[p as "Grow"] ?? "muted";

export const riskTone = (b: string) =>
  ({ Critical: "bad", High: "warn", Medium: "sky", Low: "good" } as const)[b as "Low"] ?? "muted";

/** Risk as lamp intensity: the brighter the bar, the likelier the customer leaves. */
export function RiskBar({ p }: { p: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1 w-16 overflow-hidden rounded-full bg-panel-2">
        <div className="h-full rounded-full transition-[width] duration-700"
          style={{ width: `${Math.max(3, p * 100)}%`, background: p >= 0.5 ? "var(--bad)" : "var(--lamp)", opacity: 0.35 + p * 0.65 }} />
      </div>
      <span className="num text-[13px] text-text">{(p * 100).toFixed(0)}%</span>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse rounded-lg bg-panel", className)} />;
}

export function ErrorBox({ error }: { error: string }) {
  return (
    <div className="card p-5 text-[14px] text-muted">
      <div className="mb-1 font-medium text-bad">The Lighthouse API isn&apos;t answering.</div>
      {error}. Start it from the project root with{" "}
      <code className="rounded bg-panel-2 px-1.5 py-0.5 font-mono text-[12.5px] text-text">uvicorn backend.app.main:app --port 8000</code>
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-md bg-panel p-0.5" role="tablist">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)} role="tab" aria-selected={value === o.value}
          className={clsx("rounded-[5px] px-3 py-1.5 text-[13px] transition-colors duration-200",
            value === o.value ? "bg-panel-2 text-text" : "text-muted hover:text-text")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const tooltipStyle = {
  contentStyle: {
    background: "#151a24", border: "1px solid #262d3d", borderRadius: 6,
    fontSize: 13, color: "#eceef2", boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
  },
  labelStyle: { color: "#a3aab8" },
  itemStyle: { color: "#eceef2" },
  cursor: { fill: "rgba(245,181,71,0.05)" },
};
