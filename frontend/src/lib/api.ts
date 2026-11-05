export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/**
 * Hosted mode: read-only data comes from static files exported by scripts/export_snapshot.py,
 * so pages load instantly; only live features (simulator, scoring, copilot) call the API.
 */
export const SNAPSHOT = process.env.NEXT_PUBLIC_SNAPSHOT === "1";

const STATIC: Record<string, string> = {
  "/api/summary": "summary", "/api/map": "map", "/api/model": "model", "/api/playbook": "playbook",
  "/api/monitoring": "monitoring", "/api/simulate/options": "simulate-options",
  "/api/campaign/budget-curve": "budget-curve",
};
const DEFAULT_COSTS: Record<string, number> = { "Offer A": 60, "Offer B": 45, "Offer C": 35, "Offer D": 25, "Offer E": 15 };

const cache = new Map<string, Promise<unknown>>();
function staticJson<T>(file: string): Promise<T> {
  if (!cache.has(file)) {
    cache.set(file, fetch(`/snapshot/${file}.json`).then((r) => {
      if (!r.ok) throw new Error(`Snapshot ${file} not found`);
      return r.json();
    }).catch((e) => { cache.delete(file); throw e; }));
  }
  return cache.get(file) as Promise<T>;
}

type Listing = { columns: string[]; rows: unknown[][] };

async function listCustomers(params: URLSearchParams) {
  const { columns, rows } = await staticJson<Listing>("customers");
  let list = rows.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i]])) as Record<string, unknown>);
  const status = params.get("status") ?? "active";
  if (status === "active") list = list.filter((r) => r.churn === 0);
  else if (status === "churned") list = list.filter((r) => r.churn === 1);
  const q = params.get("q")?.toLowerCase();
  if (q) list = list.filter((r) => String(r.customer_id).toLowerCase().includes(q) || String(r.city).toLowerCase().includes(q));
  for (const col of ["priority", "risk_band", "play", "contract"]) {
    const v = params.get(col);
    if (v) list = list.filter((r) => r[col] === v);
  }
  const sort = params.get("sort") ?? "value_at_risk";
  const desc = (params.get("desc") ?? "true") !== "false";
  if (columns.includes(sort)) {
    list.sort((a, b) => {
      const x = a[sort] as number | string, y = b[sort] as number | string;
      const cmp = x < y ? -1 : x > y ? 1 : 0;
      return desc ? -cmp : cmp;
    });
  }
  const page = Math.max(1, Number(params.get("page") ?? 1));
  const size = Math.min(500, Math.max(1, Number(params.get("page_size") ?? 25)));
  return { total: list.length, page, page_size: size, rows: list.slice((page - 1) * size, page * size) };
}

// Two-sided test at alpha 0.05 with 80% power, as in the API's /api/abtest.
function abTest(params: URLSearchParams) {
  const p1 = Number(params.get("baseline_churn") ?? 0.3);
  const p2 = Math.max(1e-4, p1 - Number(params.get("expected_reduction") ?? 0.05));
  const zA = 1.959963984540054, zB = 0.8416212335729143, pbar = (p1 + p2) / 2;
  const n = (zA * Math.sqrt(2 * pbar * (1 - pbar)) + zB * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) ** 2 / (p1 - p2) ** 2;
  return { per_arm: Math.ceil(n), total: Math.ceil(n) * 2, baseline_churn: p1, treated_churn: p2, alpha: 0.05, power: 0.8 };
}

/** The snapshot answer for a request, or undefined when it needs the live API. */
function fromSnapshot(path: string, init?: RequestInit): Promise<unknown> | undefined {
  const [route, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  const method = (init?.method ?? "GET").toUpperCase();
  if (method === "GET") {
    if (STATIC[route]) return staticJson(STATIC[route]);
    if (route === "/api/customers") return listCustomers(params);
    if (route.startsWith("/api/customers/")) return staticJson(`customers/${encodeURIComponent(route.slice(15))}`);
    if (route === "/api/abtest") return Promise.resolve(abTest(params));
  }
  if (method === "POST" && route === "/api/campaign" && typeof init?.body === "string") {
    const body = JSON.parse(init.body) as { budget: number; offer_costs?: Record<string, number>; min_risk?: number };
    const defaultCosts = !body.offer_costs || Object.entries(DEFAULT_COSTS).every(([k, v]) => body.offer_costs?.[k] === v);
    if (defaultCosts && !body.min_risk && body.budget % 1000 === 0 && body.budget >= 1000 && body.budget <= 80000) {
      return staticJson(`campaign/${body.budget}`);
    }
  }
  return undefined;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  if (SNAPSHOT) {
    const hit = fromSnapshot(path, init);
    if (hit) return hit as Promise<T>;
  }
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: init?.body instanceof FormData ? init.headers : {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {}
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export type Reason = { feature: string; label: string; value: number; impact: number };

export type CustomerRow = {
  customer_id: string;
  city: string;
  age: number;
  gender: string;
  contract: string;
  tenure_in_months: number;
  monthly_charge: number;
  internet_type: string;
  churn_probability: number;
  risk_band: string;
  confidence: string;
  clv: number;
  value_at_risk: number;
  median_months_left: number;
  play: string;
  secondary_play: string;
  best_offer: string;
  offer_net_value: number;
  priority: string;
  churn: number;
  split: string;
};

export type Summary = {
  customers: number;
  active_customers: number;
  active_value_at_risk: number;
  active_priority_counts: Record<string, number>;
  active_clv: number;
  top_at_risk: CustomerRow[];
  play_counts: Record<string, number>;
  churn_rate: number;
  avg_risk: number;
  total_clv: number;
  value_at_risk: number;
  monthly_revenue_lost: number;
  priority_counts: Record<string, number>;
  risk_band_counts: Record<string, number>;
  churn_by_reason: Record<string, number>;
  risk_distribution: number[];
  by_contract: { contract: string; customers: number; churn_rate: number; avg_risk: number }[];
  by_tenure: { bucket: string; customers: number; churn_rate: number }[];
  top_cities: { city: string; customers: number; avg_risk: number; value_at_risk: number; lat: number; lon: number }[];
  model_auc: number;
  uplift_targeting_value: number;
  decision_threshold: number;
};

export type Strategy = {
  customers: number;
  spend: number;
  expected_customers_saved: number;
  expected_value_retained: number;
  net_value: number;
  roi: number;
};
