"use client";

import clsx from "clsx";
import { Info } from "lucide-react";
import type { ReactNode } from "react";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx("card p-5", className)}>{children}</div>;
}

export function CardTitle({ label, title, hint, right }: {
  label?: string; title: ReactNode; hint?: string; right?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        {label && <div className="label mb-1">{label}</div>}
        <h3 className="flex items-center gap-2 text-[15px] font-medium text-text">
          {title}
          {hint && (
            <span title={hint} className="cursor-help text-faint">
              <Info size={13} />
            </span>
          )}
        </h3>
      </div>
      {right}
    </div>
  );
}

export function PageHeader({ index, label, title, subtitle, right }: {
  index: string; label: string; title: string; subtitle?: string; right?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-6 fade-up">
      <div>
        <div className="label mb-3">{index} / {label}</div>
        <h1 className="text-3xl font-semibold tracking-tight text-text md:text-[34px]">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-sm text-muted">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function Stat({ label, value, sub, tone = "default", icon }: {
  label: string; value: ReactNode; sub?: ReactNode;
  tone?: "default" | "beam" | "bad" | "good" | "sky"; icon?: ReactNode;
}) {
  const color = {
    default: "text-text", beam: "beam-text", bad: "text-bad", good: "text-good", sky: "text-sky",
  }[tone];
  return (
    <div className="card card-hover p-5 fade-up">
      <div className="flex items-center justify-between">
        <span className="label">{label}</span>
        {icon && <span className="text-faint">{icon}</span>}
      </div>
      <div className={clsx("num mt-3 text-[clamp(22px,2vw,28px)] font-semibold leading-none tracking-tight", color)}>
        {value}
      </div>
      {sub && <div className="mt-2 text-xs text-muted">{sub}</div>}
    </div>
  );
}

const BADGE_TONES: Record<string, string> = {
  bad: "bg-bad/10 text-bad border-bad/25",
  warn: "bg-warn/10 text-warn border-warn/25",
  good: "bg-good/10 text-good border-good/25",
  sky: "bg-sky/10 text-sky border-sky/25",
  violet: "bg-violet/10 text-violet border-violet/25",
  muted: "bg-white/5 text-muted border-line-2",
};

export function Badge({ tone = "muted", children }: { tone?: keyof typeof BADGE_TONES; children: ReactNode }) {
  return (
    <span className={clsx("inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-medium", BADGE_TONES[tone])}>
      {children}
    </span>
  );
}

export const priorityTone = (p: string) =>
  ({ "Save now": "bad", "Low-cost save": "warn", Grow: "sky", Maintain: "good" } as const)[p as "Grow"] ?? "muted";

export const riskTone = (b: string) =>
  ({ Critical: "bad", High: "warn", Medium: "sky", Low: "good" } as const)[b as "Low"] ?? "muted";

export function RiskBar({ p }: { p: number }) {
  const color = p >= 0.75 ? "var(--bad)" : p >= 0.5 ? "#ff9f6b" : p >= 0.2 ? "var(--warn)" : "var(--good)";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/5">
        <div className="h-full rounded-full" style={{ width: `${Math.max(3, p * 100)}%`, background: color }} />
      </div>
      <span className="num text-xs text-text">{(p * 100).toFixed(0)}%</span>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse rounded-lg bg-white/[0.04]", className)} />;
}

export function ErrorBox({ error }: { error: string }) {
  return (
    <div className="card border-bad/30 p-5 text-sm text-bad">
      Could not reach the Lighthouse API: {error}. Start it with{" "}
      <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-xs">uvicorn backend.app.main:app --port 8000</code>
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-bg-2 p-0.5">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={clsx("rounded-md px-3 py-1.5 text-xs transition",
            value === o.value ? "bg-panel-2 text-text shadow" : "text-muted hover:text-text")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const tooltipStyle = {
  contentStyle: {
    background: "#0b1430", border: "1px solid #263866", borderRadius: 10,
    fontSize: 12, color: "#e8edf9",
  },
  labelStyle: { color: "#8b98bd" },
  itemStyle: { color: "#e8edf9" },
  cursor: { fill: "rgba(255,255,255,0.03)" },
};
