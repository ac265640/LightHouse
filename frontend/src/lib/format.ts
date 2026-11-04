export const money = (v: number | null | undefined, compact = true) => {
  if (v == null || Number.isNaN(v)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: compact && Math.abs(v) >= 10000 ? "compact" : "standard",
    maximumFractionDigits: compact && Math.abs(v) >= 10000 ? 1 : 0,
  }).format(v);
};

export const pct = (v: number | null | undefined, digits = 1) =>
  v == null || Number.isNaN(v) ? "—" : `${(v * 100).toFixed(digits)}%`;

export const num = (v: number | null | undefined, digits = 0) =>
  v == null || Number.isNaN(v)
    ? "—"
    : new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(v);

export const riskColor = (p: number) =>
  p >= 0.5 ? "var(--bad)" : p >= 0.2 ? "var(--lamp)" : "var(--dim)";

export const PRIORITY_COLORS: Record<string, string> = {
  "Save now": "#f2685c",
  "Low-cost save": "#f5b547",
  Grow: "#8da4c4",
  Maintain: "#4a5263",
};
