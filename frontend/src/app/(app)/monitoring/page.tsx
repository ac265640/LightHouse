"use client";

import { CheckCircle2, FileUp, Loader2, ServerCog, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Badge, Card, CardTitle, ErrorBox, PageHeader, RiskBar, Skeleton, Stat, tooltipStyle } from "@/components/ui";
import { api, API_URL, type Reason } from "@/lib/api";
import { money, num, pct } from "@/lib/format";
import { useApi } from "@/lib/useApi";

type Monitoring = {
  psi_top: Record<string, number>;
  score_mean_train: number; score_mean_holdout: number; model_version: string;
  holdout: Record<string, number>;
};
type ScoreResult = {
  rows: number;
  summary: { avg_risk: number; value_at_risk: number; high_risk: number };
  drift: { psi: Record<string, number>; flagged: Record<string, number>; status: "stable" | "watch" | "drift" };
  scored: { customer_id: string; churn_probability: number; clv: number; value_at_risk: number;
    median_months_left: number; predicted_reason: string; top_reasons: Reason[] }[];
};

const psiColor = (v: number) => (v > 0.25 ? "#f2685c" : v > 0.1 ? "#f5b547" : "#4fc48a");

function PsiChart({ psi }: { psi: Record<string, number> }) {
  const data = Object.entries(psi).sort((a, b) => b[1] - a[1]).slice(0, 12)
    .map(([feature, value]) => ({ feature, value })).reverse();
  return (
    <div className="h-72">
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 60, right: 16 }}>
          <XAxis type="number" tickLine={false} axisLine={false} domain={[0, (max: number) => Math.max(0.3, max)]} />
          <YAxis type="category" dataKey="feature" width={150} tickLine={false} axisLine={false} />
          <ReferenceLine x={0.1} stroke="#f5b547" strokeDasharray="3 3" />
          <ReferenceLine x={0.25} stroke="#f2685c" strokeDasharray="3 3" />
          <Tooltip {...tooltipStyle} formatter={(v: number) => v.toFixed(4)} />
          <Bar dataKey="value" name="PSI" barSize={11} radius={[0, 4, 4, 0]}>
            {data.map((d) => <Cell key={d.feature} fill={psiColor(d.value)} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function MonitoringPage() {
  const { data: m, error } = useApi<Monitoring>("/api/monitoring");
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setUploading(true); setUploadError(null);
    const fd = new FormData(); fd.append("file", file);
    try { setResult(await api<ScoreResult>("/api/score", { method: "POST", body: fd })); }
    catch (e) { setUploadError((e as Error).message); }
    finally { setUploading(false); }
  };

  if (error) return <ErrorBox error={error} />;
  if (!m) return <Skeleton className="h-96" />;

  return (
    <div>
      <PageHeader index="07" label="Monitoring & Scoring" title="Keep the model honest after go-live"
        subtitle="Population Stability Index tracks whether incoming customers still look like the training data. Upload a fresh customer extract to score it and check drift in one step." />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label="Model version" value={`v${m.model_version}`} icon={<ServerCog size={15} />} sub="Calibrated stacked ensemble" />
        <Stat label="Holdout AUC" value={m.holdout.auc.toFixed(3)} tone="beam" sub={`ECE ${pct(m.holdout.ece)}`} />
        <Stat label="Mean score, train" value={pct(m.score_mean_train)} sub="Out-of-fold" />
        <Stat label="Mean score, holdout" value={pct(m.score_mean_holdout)} tone="good" sub="Stable across splits" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardTitle label="Reference drift" title="Holdout vs training feature stability (PSI)"
            hint="PSI < 0.10 stable, 0.10–0.25 watch, > 0.25 retrain." right={<Badge tone="good">Stable</Badge>} />
          <PsiChart psi={m.psi_top} />
        </Card>

        <Card>
          <CardTitle label="Batch scoring" title="Score a new customer file" />
          <div onClick={() => input.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) upload(f); }}
            className="flex h-44 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-line-2 bg-bg-2 text-center transition hover:border-beam/50">
            {uploading ? <Loader2 className="animate-spin text-beam" /> : <UploadCloud className="text-beam" />}
            <div className="text-sm">{uploading ? "Scoring…" : "Drop a CSV here or click to upload"}</div>
            <div className="text-[11px] text-faint">IBM Telco schema · outcome columns optional and ignored</div>
            <input ref={input} type="file" accept=".csv" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-muted">
            <span className="flex items-center gap-1.5"><FileUp size={13} /> Or call <code className="font-mono text-text">POST /api/score</code></span>
            <a href={`${API_URL}/docs`} target="_blank" rel="noreferrer" className="text-sky hover:underline">Open API docs →</a>
          </div>
          {uploadError && <div className="mt-3 rounded-lg border border-bad/30 bg-bad/5 p-3 text-xs text-bad">{uploadError}</div>}
        </Card>
      </div>

      {result && (
        <div className="mt-4 space-y-4 fade-up">
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <Stat label="Rows scored" value={num(result.rows)} icon={<CheckCircle2 size={15} />} />
            <Stat label="Average risk" value={pct(result.summary.avg_risk)} />
            <Stat label="High risk (≥50%)" value={num(result.summary.high_risk)} tone="bad" />
            <Stat label="Drift status" value={result.drift.status.toUpperCase()}
              tone={result.drift.status === "stable" ? "good" : result.drift.status === "watch" ? "beam" : "bad"}
              sub={`${Object.keys(result.drift.flagged).length} features above PSI 0.10`} />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <Card><CardTitle label="Upload drift" title="Feature stability vs training" /><PsiChart psi={result.drift.psi} /></Card>
            <Card className="!p-0">
              <div className="p-5 pb-2"><CardTitle label="Scores" title="Highest-risk customers in the file" /></div>
              <div className="max-h-72 overflow-auto scrollbar-thin">
                <table className="w-full text-sm">
                  <tbody>
                    {[...result.scored].sort((a, b) => b.value_at_risk - a.value_at_risk).slice(0, 25).map((s) => (
                      <tr key={s.customer_id} className="border-t border-line/70">
                        <td className="px-5 py-2 font-medium">{s.customer_id}</td>
                        <td className="px-3"><RiskBar p={s.churn_probability} /></td>
                        <td className="num px-3 text-right">{money(s.clv)}</td>
                        <td className="px-5 text-xs text-muted">{s.top_reasons[0]?.label ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
