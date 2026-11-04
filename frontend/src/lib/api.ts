export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
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
