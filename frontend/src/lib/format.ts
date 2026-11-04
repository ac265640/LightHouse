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
  p >= 0.75 ? "var(--bad)" : p >= 0.5 ? "#ff9f6b" : p >= 0.2 ? "var(--warn)" : "var(--good)";

export const PRIORITY_COLORS: Record<string, string> = {
  "Save now": "#ff6b81",
  "Low-cost save": "#f6b54a",
  Grow: "#5fc6ff",
  Maintain: "#3ddc97",
};
