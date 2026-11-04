"use client";

import { AlertTriangle, CheckCircle2, Scale, ShieldCheck } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Line, ReferenceLine, ResponsiveContainer, Scatter,
  ComposedChart, Tooltip, XAxis, YAxis,
} from "recharts";

import { Badge, Card, CardTitle, ErrorBox, PageHeader, Skeleton, Stat, tooltipStyle } from "@/components/ui";
import { num, pct } from "@/lib/format";
import { useApi } from "@/lib/useApi";

type Row = Record<string, number | string>;
type Report = {
  dataset: { name: string; rows: number; features: number; churn_rate: number };
  leakage: { audit: { column: string; single_feature_auc: number | null; excluded: boolean }[]; leaky_auc: number };
  leaderboard: Row[];
  holdout: Record<string, Record<string, number>>;
  significance: Record<string, { auc_diff_mean: number; ci_low: number; ci_high: number; p_a_better: number }>;
  calibration_curve: { bin: number; mean_pred: number; actual: number; n: number }[];
  conformal: { alpha: number; holdout_coverage: number; holdout_share_uncertain: number; coverage_churners: number; coverage_stayers: number };
  survival: { c_index_holdout: number; quarter_churn_auc_holdout: number; quarter_churn_mean_pred: number; quarter_churn_actual: number;
    hazard_ratios: { feature: string; label: string; hazard_ratio: number; p: number }[]; design: string };
  global_importance: { label: string; mean_abs_shap: number; direction: number }[];
  fairness: { groups: { attribute: string; group: string; n: number; actual_churn_rate: number; mean_predicted_risk: number;
    tpr: number; fpr: number; auc: number | null; tpr_gap_for_attribute: number }[];
    gender_ablation: { auc_with_gender: number; auc_without_gender: number } };
};

const f3 = (v: unknown) => (typeof v === "number" ? v.toFixed(3) : "—");
const ATTR_LABEL: Record<string, string> = { gender: "Gender", senior_citizen: "Senior citizen", under_30: "Under 30" };
const GROUP_LABEL = (a: string, g: string) => (a === "gender" ? g : g === "1" ? "Yes" : "No");

export default function ModelLab() {
  const { data: r, error } = useApi<Report>("/api/model");
  if (error) return <ErrorBox error={error} />;
  if (!r) return <Skeleton className="h-96" />;

  const stack = r.holdout["Calibrated Stack"];
  const calib = r.calibration_curve.map((c) => ({ ...c, ideal: c.mean_pred }));
  const hr = [...r.survival.hazard_ratios].filter((h) => h.p < 0.05)
    .sort((a, b) => b.hazard_ratio - a.hazard_ratio)
    .map((h) => ({ ...h, log: Math.log2(h.hazard_ratio) }));
  const imp = r.global_importance.slice(0, 12).reverse();

  return (
    <div>
      <PageHeader index="06" label="Model Lab" title="Evidence, not a single lucky model"
        subtitle={`${r.dataset.name}. ${num(r.dataset.rows)} customers, ${r.dataset.features} leakage-free features. Five model families on identical folds, a calibrated stack, a locked 20% holdout.`} />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Holdout AUC" value={stack.auc.toFixed(3)} tone="beam" sub="Calibrated stack" />
        <Stat label="PR-AUC" value={stack.pr_auc.toFixed(3)} sub={`Base rate ${pct(r.dataset.churn_rate)}`} />
        <Stat label="Calibration error" value={pct(stack.ece)} tone="good" sub="Expected calibration error" />
        <Stat label="Top-decile lift" value={`${stack.top_decile_lift.toFixed(2)}×`} sub="Churners in top 10%" />
        <Stat label="Conformal coverage" value={pct(r.conformal.holdout_coverage)} tone="sky" sub={`Target ${pct(1 - r.conformal.alpha, 0)}`} />
        <Stat label="Survival C-index" value={r.survival.c_index_holdout.toFixed(3)} sub="Time-to-churn ranking" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2 !p-0">
          <div className="p-5 pb-2"><CardTitle label="Benchmark" title="5-fold cross-validation leaderboard (mean ± sd)"
            hint="All models see identical stratified folds of the training split. The stack is evaluated out-of-fold too." /></div>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-[13px] text-faint">
                  <th className="px-5 py-2 font-medium">Model</th>
                  <th className="px-3 py-2 text-right font-medium">ROC-AUC</th>
                  <th className="px-3 py-2 text-right font-medium">PR-AUC</th>
                  <th className="px-3 py-2 text-right font-medium">Brier ↓</th>
                  <th className="px-3 py-2 text-right font-medium">ECE ↓</th>
                  <th className="px-3 py-2 text-right font-medium">Lift@10%</th>
                  <th className="px-5 py-2 text-right font-medium">Holdout AUC</th>
                </tr>
              </thead>
              <tbody>
                {r.leaderboard.map((m, i) => {
                  const name = m.model as string;
                  const hold = r.holdout[name === "Stacked Ensemble" ? "Calibrated Stack" : name];
                  return (
                    <tr key={name} className={`border-t border-line/70 ${i === 0 ? "bg-beam/[0.05]" : ""}`}>
                      <td className="whitespace-nowrap px-5 py-2.5 font-medium">{name} {i === 0 && <Badge tone="warn">best</Badge>}</td>
                      <td className="num whitespace-nowrap px-3 text-right">{f3(m.auc_mean)} <span className="text-faint">± {f3(m.auc_std)}</span></td>
                      <td className="num px-3 text-right">{f3(m.pr_auc_mean)}</td>
                      <td className="num px-3 text-right">{f3(m.brier_mean)}</td>
                      <td className="num px-3 text-right">{f3(m.ece_mean)}</td>
                      <td className="num px-3 text-right">{(m.top_decile_lift_mean as number).toFixed(2)}×</td>
                      <td className="num px-5 text-right text-beam">{f3(hold?.auc)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-line px-5 py-3 text-xs text-muted">
            Paired bootstrap on the holdout: the calibrated stack beats{" "}
            {Object.entries(r.significance).map(([k, s], i, arr) => (
              <span key={k}>{k} in <span className="text-text">{pct(s.p_a_better, 0)}</span> of resamples{i < arr.length - 1 ? ", " : "."}</span>
            ))}
          </div>
        </Card>

        <Card>
          <CardTitle label="Leakage audit" title="The trap we avoided" right={<AlertTriangle size={16} className="text-warn" />} />
          <div className="rounded-lg border border-bad/25 bg-bad/[0.06] p-4">
            <div className="font-display num text-3xl font-normal text-bad">{r.leakage.leaky_auc.toFixed(3)}</div>
            <div className="text-xs text-muted">AUC if post-churn fields are kept. Too good to be true.</div>
          </div>
          <div className="mt-3 space-y-1.5">
            {r.leakage.audit.map((a) => (
              <div key={a.column} className="flex items-center justify-between text-xs">
                <span className="font-mono text-muted">{a.column}</span>
                <span className="flex items-center gap-2">
                  <span className="num">{a.single_feature_auc != null ? a.single_feature_auc.toFixed(2) : "—"}</span>
                  <Badge tone="bad">excluded</Badge>
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-faint">Single-feature AUC shown. Satisfaction 1–2 ⇒ 100% churn; 4–5 ⇒ 0%. Exit fields exist only after a customer leaves.</p>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card>
          <CardTitle label="Calibration" title="Predicted vs actual churn (holdout)" hint="Points on the diagonal mean a 30% score really means 30%." />
          <div className="h-60">
            <ResponsiveContainer>
              <ComposedChart data={calib} margin={{ left: -16, right: 8, top: 6 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" dataKey="mean_pred" domain={[0, 1]} tickFormatter={(v) => `${v * 100}%`} tickLine={false} axisLine={false} />
                <YAxis type="number" domain={[0, 1]} tickFormatter={(v) => `${v * 100}%`} tickLine={false} axisLine={false} />
                <Tooltip {...tooltipStyle} formatter={(v: number) => pct(v)} />
                <Line dataKey="ideal" stroke="#4a5263" strokeDasharray="4 4" dot={false} name="Perfect" />
                <Line dataKey="actual" stroke="#f5b547" strokeWidth={2} dot={{ r: 3 }} name="Actual" />
                <Scatter dataKey="actual" fill="#f5b547" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardTitle label="Drivers" title="Global feature importance (mean |SHAP|)" />
          <div className="h-60">
            <ResponsiveContainer>
              <BarChart data={imp} layout="vertical" margin={{ left: 0, right: 10 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="label" width={150} tickLine={false} axisLine={false} interval={0} />
                <Tooltip {...tooltipStyle} formatter={(v: number) => v.toFixed(3)} />
                <Bar dataKey="mean_abs_shap" radius={[0, 5, 5, 0]} barSize={11}>
                  {imp.map((d) => <Cell key={d.label} fill={d.direction > 0 ? "#f2685c" : "#8da4c4"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 flex gap-4 text-[11px] text-faint">
            <span><span className="text-bad">■</span> higher value → more churn</span>
            <span><span className="text-sky">■</span> higher value → less churn</span>
          </div>
        </Card>

        <Card>
          <CardTitle label="Time to churn" title="Survival hazard ratios (p < 0.05)"
            hint={r.survival.design} />
          <div className="h-60">
            <ResponsiveContainer>
              <BarChart data={hr} layout="vertical" margin={{ left: 0, right: 10 }}>
                <XAxis type="number" tickFormatter={(v) => `${(2 ** v).toFixed(1)}×`} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="label" width={150} tickLine={false} axisLine={false} interval={0} />
                <ReferenceLine x={0} stroke="#262d3d" />
                <Tooltip {...tooltipStyle} formatter={(_v, _n, item) => [`${item.payload.hazard_ratio.toFixed(2)}× hazard`, item.payload.label]} />
                <Bar dataKey="log" barSize={11} radius={4}>
                  {hr.map((d) => <Cell key={d.feature} fill={d.log > 0 ? "#f2685c" : "#4fc48a"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] text-faint">
            Implied quarterly churn {pct(r.survival.quarter_churn_mean_pred)} vs observed {pct(r.survival.quarter_churn_actual)} · independent AUC {r.survival.quarter_churn_auc_holdout.toFixed(3)}
          </p>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2 !p-0">
          <div className="p-5 pb-2"><CardTitle label="Responsible AI" title="Fairness audit on the holdout (threshold 50%)"
            right={<Scale size={16} className="text-text" />}
            hint="TPR = share of real churners the model catches. Equal opportunity asks for similar TPR across groups." /></div>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-[13px] text-faint">
                  <th className="px-5 py-2 font-medium">Group</th>
                  <th className="px-3 py-2 text-right font-medium">n</th>
                  <th className="px-3 py-2 text-right font-medium">Actual churn</th>
                  <th className="px-3 py-2 text-right font-medium">Mean predicted</th>
                  <th className="px-3 py-2 text-right font-medium">TPR</th>
                  <th className="px-3 py-2 text-right font-medium">FPR</th>
                  <th className="px-5 py-2 text-right font-medium">AUC</th>
                </tr>
              </thead>
              <tbody>
                {r.fairness.groups.map((g) => (
                  <tr key={g.attribute + g.group} className="border-t border-line/70">
                    <td className="px-5 py-2"><span className="text-muted">{ATTR_LABEL[g.attribute]}:</span> {GROUP_LABEL(g.attribute, g.group)}</td>
                    <td className="num px-3 text-right">{num(g.n)}</td>
                    <td className="num px-3 text-right">{pct(g.actual_churn_rate)}</td>
                    <td className="num px-3 text-right">{pct(g.mean_predicted_risk)}</td>
                    <td className="num px-3 text-right">{pct(g.tpr)}</td>
                    <td className="num px-3 text-right">{pct(g.fpr)}</td>
                    <td className="num px-5 text-right">{g.auc != null ? g.auc.toFixed(3) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card>
          <CardTitle label="Design choices" title="How we kept it trustworthy" right={<ShieldCheck size={16} className="text-good" />} />
          <ul className="space-y-3 text-sm">
            {[
              `Gender removed from the model: AUC ${r.fairness.gender_ablation.auc_with_gender.toFixed(4)} with vs ${r.fairness.gender_ablation.auc_without_gender.toFixed(4)} without. Kept only for auditing.`,
              "Class weighting instead of SMOTE: no synthetic customers.",
              "Every displayed score is out-of-fold or holdout, never in-sample.",
              `Conformal sets flag ${pct(r.conformal.holdout_share_uncertain, 0)} of customers as "uncertain" so humans review them.`,
              "Survival model corrects for left truncation in the one-quarter snapshot.",
              "Offer effects estimated within tenure tiers with doubly-robust adjustment.",
            ].map((t) => (
              <li key={t} className="flex gap-2 text-muted"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-good" />{t}</li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
