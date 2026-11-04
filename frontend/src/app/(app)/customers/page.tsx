"use client";

import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

import { Badge, Card, ErrorBox, PageHeader, RiskBar, Segmented, Skeleton, priorityTone, riskTone } from "@/components/ui";
import type { CustomerRow } from "@/lib/api";
import { money, num } from "@/lib/format";
import { useApi } from "@/lib/useApi";

const PRIORITIES = ["Save now", "Low-cost save", "Grow", "Maintain"];
const BANDS = ["Critical", "High", "Medium", "Low"];
const PLAYS = ["Contract lock-in", "Early-life onboarding", "Community & referral", "Value reframe",
  "Service quality", "Payment friction", "Lifecycle care"];
const CONTRACTS = ["Month-to-Month", "One Year", "Two Year"];

const COLUMNS: { key: keyof CustomerRow; label: string; align?: "right" }[] = [
  { key: "customer_id", label: "Customer" },
  { key: "churn_probability", label: "Churn risk" },
  { key: "clv", label: "CLV", align: "right" },
  { key: "value_at_risk", label: "Value at risk", align: "right" },
  { key: "median_months_left", label: "Months left", align: "right" },
  { key: "priority", label: "Priority" },
  { key: "play", label: "Play" },
  { key: "best_offer", label: "Best offer" },
];

function Select({ value, onChange, options, placeholder }: {
  value: string; onChange: (v: string) => void; options: string[]; placeholder: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-line bg-bg-2 px-3 py-2 text-sm text-text outline-none focus:border-line-2">
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function CustomersInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [debounced, setDebounced] = useState(q);

  const filters = {
    status: params.get("status") ?? "active",
    priority: params.get("priority") ?? "",
    risk_band: params.get("risk_band") ?? "",
    play: params.get("play") ?? "",
    contract: params.get("contract") ?? "",
    sort: params.get("sort") ?? "value_at_risk",
    desc: params.get("desc") ?? "true",
    page: params.get("page") ?? "1",
  };

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!("page" in patch)) next.delete("page");
    router.replace(`/customers?${next.toString()}`, { scroll: false });
  };

  const query = useMemo(() => {
    const u = new URLSearchParams({ ...filters, page_size: "25" });
    if (debounced) u.set("q", debounced);
    [...u.entries()].forEach(([k, v]) => { if (!v) u.delete(k); });
    return `/api/customers?${u.toString()}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, debounced]);

  const { data, error, loading } = useApi<{ total: number; rows: CustomerRow[] }>(query);
  const page = Number(filters.page);
  const pages = data ? Math.max(1, Math.ceil(data.total / 25)) : 1;

  const toggleSort = (key: string) => {
    if (filters.sort === key) set({ desc: filters.desc === "true" ? "false" : "true", sort: key });
    else set({ sort: key, desc: "true" });
  };

  return (
    <div>
      <PageHeader index="02" label="Customers" title="Every customer, scored and explained"
        subtitle="Search, filter and open any customer to see why they are at risk and what to do about it."
        right={<Segmented value={filters.status as "active"} onChange={(v) => set({ status: v })}
          options={[{ value: "active", label: "Active" }, { value: "churned", label: "Churned" }, { value: "all", label: "All" }]} />} />

      <Card className="!p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer ID or city"
              className="w-full rounded-lg border border-line bg-bg-2 py-2 pl-9 pr-3 text-sm text-text outline-none placeholder:text-faint focus:border-line-2" />
          </div>
          <Select value={filters.priority} onChange={(v) => set({ priority: v })} options={PRIORITIES} placeholder="All priorities" />
          <Select value={filters.risk_band} onChange={(v) => set({ risk_band: v })} options={BANDS} placeholder="All risk bands" />
          <Select value={filters.play} onChange={(v) => set({ play: v })} options={PLAYS} placeholder="All plays" />
          <Select value={filters.contract} onChange={(v) => set({ contract: v })} options={CONTRACTS} placeholder="All contracts" />
        </div>

        {error ? <div className="p-4"><ErrorBox error={error} /></div> : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="text-left text-[13px] text-faint">
                  {COLUMNS.map((c) => (
                    <th key={c.key} className={`px-4 py-3 font-medium ${c.align === "right" ? "text-right" : ""}`}>
                      <button onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 hover:text-muted">
                        {c.label}
                        {filters.sort === c.key && (filters.desc === "true" ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && !data ? Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i}><td colSpan={8} className="px-4 py-2"><Skeleton className="h-8" /></td></tr>
                )) : data?.rows.map((c) => (
                  <tr key={c.customer_id} onClick={() => router.push(`/customers/${c.customer_id}`)}
                    className="cursor-pointer border-t border-line/70 transition hover:bg-white/[0.025]">
                    <td className="px-4 py-3">
                      <Link href={`/customers/${c.customer_id}`} className="font-medium text-text hover:text-beam">{c.customer_id}</Link>
                      <div className="text-[11px] text-faint">{c.city} · {c.contract} · {c.tenure_in_months} mo</div>
                    </td>
                    <td className="px-4">
                      <div className="flex items-center gap-2">
                        <RiskBar p={c.churn_probability} />
                        <Badge tone={riskTone(c.risk_band)}>{c.risk_band}</Badge>
                      </div>
                    </td>
                    <td className="num px-4 text-right">{money(c.clv)}</td>
                    <td className="num px-4 text-right text-beam">{money(c.value_at_risk)}</td>
                    <td className="num px-4 text-right">{c.median_months_left >= 60 ? "60+" : c.median_months_left}</td>
                    <td className="px-4"><Badge tone={priorityTone(c.priority)}>{c.priority}</Badge></td>
                    <td className="px-4 text-xs text-muted">{c.play}</td>
                    <td className="px-4 text-xs">{c.best_offer === "No offer" ? <span className="text-faint">—</span> : <span className="text-sky">{c.best_offer}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-line px-4 py-3 text-xs text-muted">
          <span>{data ? `${num(data.total)} customers` : "…"}</span>
          <div className="flex items-center gap-2">
            <button disabled={page <= 1} onClick={() => set({ page: String(page - 1) })}
              className="rounded-md border border-line p-1.5 disabled:opacity-30 hover:border-line-2"><ChevronLeft size={14} /></button>
            <span className="num">Page {page} of {pages}</span>
            <button disabled={page >= pages} onClick={() => set({ page: String(page + 1) })}
              className="rounded-md border border-line p-1.5 disabled:opacity-30 hover:border-line-2"><ChevronRight size={14} /></button>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default function CustomersPage() {
  return <Suspense fallback={<Skeleton className="h-96" />}><CustomersInner /></Suspense>;
}
