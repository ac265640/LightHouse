"""
End-to-end training run. Produces everything the API and dashboard serve:

  artifacts/model.joblib            calibrated stacked ensemble + helpers
  artifacts/customers_scored.parquet one row per customer, honest scores
  artifacts/report.json             leaderboard, holdout, survival, uplift,
                                    fairness, conformal, leakage, economics

Run:  .venv/bin/python -m ml.retention.pipeline
"""
from __future__ import annotations

import json
import time

import joblib
import numpy as np
import pandas as pd
from lightgbm import LGBMClassifier
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.metrics import roc_auc_score

from ml.retention import data, insights, models, survival, uplift
from ml.retention.data import PROJECT_ROOT

ARTIFACTS = PROJECT_ROOT / "artifacts"

# Economics assumptions (surfaced in the UI and editable via the API)
DEFAULT_SAVE_RATE = 0.30     # share of contacted would-be churners retained by a generic offer
DEFAULT_CONTACT_COST = 25.0  # USD per contacted customer (generic offer + outreach)


def _log(msg: str, t0: float) -> None:
    print(f"[{time.time() - t0:6.1f}s] {msg}", flush=True)


def leaky_model_demo(customers: pd.DataFrame, X: pd.DataFrame, y: np.ndarray) -> dict:
    """What a naive team gets by keeping post-churn columns."""
    Xl = X.copy()
    Xl["satisfaction_score"] = customers["satisfaction_score"].values
    Xl["churn_score"] = customers["churn_score"].values
    skf = StratifiedKFold(5, shuffle=True, random_state=42)
    clf = LGBMClassifier(n_estimators=300, verbose=-1, random_state=42)
    p = cross_val_predict(clf, Xl, y, cv=skf, method="predict_proba")[:, 1]
    return {"leaky_auc": float(roc_auc_score(y, p))}


def profit_curve(p: np.ndarray, clv: np.ndarray, save_rate: float, cost: float,
                 n_points: int = 100) -> list[dict]:
    """Expected net value of contacting the top-k% customers ranked by p × CLV."""
    gain = p * clv * save_rate - cost
    order = np.argsort(-(p * clv))
    cum = np.cumsum(gain[order])
    n = len(p)
    pts = []
    for frac in np.linspace(0.01, 1.0, n_points):
        k = int(frac * n)
        pts.append({"share_contacted": float(frac), "customers": k,
                    "net_value": float(cum[k - 1]), "cost": float(k * cost)})
    return pts


def run() -> dict:
    t0 = time.time()
    ARTIFACTS.mkdir(exist_ok=True)

    customers = data.build_customer_table()
    X = data.to_model_matrix(customers)
    y = customers["churn"].values.astype(int)
    _log(f"data: {X.shape[0]} customers × {X.shape[1]} features, churn {y.mean():.1%}", t0)

    report: dict = {"dataset": {
        "name": "IBM Telco Customer Churn 11.1.3 (extended, California Q3)",
        "rows": int(len(y)), "features": int(X.shape[1]), "churn_rate": float(y.mean()),
    }}

    # ── Leakage audit ──
    report["leakage"] = {
        "audit": data.leakage_audit(customers).to_dict(orient="records"),
        **leaky_model_demo(customers, X, y),
    }
    _log(f"leakage: naive leaky AUC = {report['leakage']['leaky_auc']:.4f}", t0)

    # ── Benchmark (CV on training split only) ──
    tr, te = models.split(X, y)
    X_tr, X_te, y_tr, y_te = X.iloc[tr], X.iloc[te], y[tr], y[te]
    fold_metrics, oof = models.cross_validate_zoo(X_tr, y_tr)
    board = models.leaderboard(fold_metrics)
    report["leaderboard"] = board.to_dict(orient="records")
    report["fold_metrics"] = fold_metrics.to_dict(orient="records")
    _log("benchmark:\n" + board[["model", "auc_mean", "auc_std", "pr_auc_mean",
                                  "brier_mean", "top_decile_lift_mean"]].round(4).to_string(), t0)

    # ── Final calibrated stack + holdout ──
    final = models.fit_final(X_tr, y_tr, oof)
    holdout = {}
    test_preds = {}
    for name, m in final.bases.items():
        test_preds[name] = m.predict_proba(X_te)[:, 1]
        holdout[name] = models.score_all(y_te, test_preds[name])
    p_te = final.predict_proba(X_te)[:, 1]
    test_preds["Calibrated Stack"] = p_te
    holdout["Calibrated Stack"] = models.score_all(y_te, p_te)
    report["holdout"] = holdout
    report["significance"] = {
        name: models.paired_bootstrap_auc(y_te, p_te, test_preds[name], n=1000)
        for name in final.bases
    }
    _log(f"holdout stack AUC {holdout['Calibrated Stack']['auc']:.4f}, "
         f"ECE {holdout['Calibrated Stack']['ece']:.4f}", t0)

    # Honest per-customer probability: OOF for train rows, holdout for test rows
    base_oof = np.column_stack([oof[n] for n in final.bases])
    p_all = np.zeros(len(y))
    p_all[tr] = final.iso.predict(final.meta.predict_proba(base_oof)[:, 1])
    p_all[te] = p_te

    # Reliability diagram data for the holdout
    bins = np.linspace(0, 1, 11)
    idx = np.clip(np.digitize(p_te, bins) - 1, 0, 9)
    report["calibration_curve"] = [
        {"bin": int(b), "mean_pred": float(p_te[idx == b].mean()),
         "actual": float(y_te[idx == b].mean()), "n": int((idx == b).sum())}
        for b in range(10) if (idx == b).any()
    ]

    # ── Conformal ──
    thr = models.conformal_thresholds(y_tr, p_all[tr], alpha=0.10)
    sets_te = models.conformal_sets(p_te, thr)
    covered = np.where(sets_te == "Uncertain", True,
                       np.where(sets_te == "Will churn", y_te == 1, y_te == 0))
    report["conformal"] = {**thr, "holdout_coverage": float(covered.mean()),
                           "holdout_share_uncertain": float((sets_te == "Uncertain").mean()),
                           "coverage_churners": float(covered[y_te == 1].mean()),
                           "coverage_stayers": float(covered[y_te == 0].mean())}
    conf_all = models.conformal_sets(p_all, thr)
    _log(f"conformal coverage {report['conformal']['holdout_coverage']:.3f}", t0)

    # ── Survival + CLV ──
    sdf = survival.survival_frame(X, customers)
    cph = survival.fit_cox(sdf.iloc[tr])
    report["survival"] = {
        "c_index_train": survival.c_index(cph, sdf.iloc[tr]),
        "c_index_holdout": survival.c_index(cph, sdf.iloc[te]),
        "hazard_ratios": (cph.summary[["exp(coef)", "p"]]
                          .rename(columns={"exp(coef)": "hazard_ratio"})
                          .reset_index().rename(columns={"covariate": "feature"})
                          .assign(label=lambda d: d["feature"].map(insights.friendly))
                          .to_dict(orient="records")),
    }
    cond = survival.conditional_survival(cph, sdf)
    charge = customers["monthly_charge"].values
    clv_expected = survival.survival_clv(charge, cond)        # risk-weighted value
    clv = survival.clv_if_retained(charge, cond)              # value a save protects
    remaining = survival.expected_remaining_months(cond)
    median_left = survival.months_to_churn_risk(cond)
    q3 = survival.churn_within(cond)
    report["survival"].update({
        "quarter_churn_auc_holdout": float(roc_auc_score(y_te, q3[te])),
        "quarter_churn_mean_pred": float(q3.mean()),
        "quarter_churn_actual": float(y.mean()),
        "agreement_with_classifier_spearman": float(pd.Series(q3).corr(pd.Series(p_all), method="spearman")),
        "clv_vs_ibm_cltv_spearman": float(pd.Series(clv).corr(customers["cltv"], method="spearman")),
        "clv_vs_risk_spearman": float(pd.Series(clv).corr(pd.Series(p_all), method="spearman")),
        "median_months_left_distribution": pd.Series(median_left).describe().to_dict(),
        "design": "Cox PH with left truncation (delayed entry at tenure-3) and Breslow baseline",
    })
    _log(f"survival c-index holdout {report['survival']['c_index_holdout']:.4f}, "
         f"quarter-churn AUC {report['survival']['quarter_churn_auc_holdout']:.4f}", t0)

    # ── Uplift ──
    up = uplift.fit_uplift(X, y, customers["offer"], customers["tenure_in_months"])
    rec = uplift.best_offer(up["cate"], clv)
    report["uplift"] = {"offers": up["ate"].to_dict(orient="records"),
                        "offer_costs": uplift.OFFER_COST,
                        "offer_windows": uplift.OFFER_WINDOWS,
                        "method": "Doubly-robust learner within each offer's tenure window"}
    _log("uplift:\n" + up["ate"][["offer", "window", "naive_effect", "window_naive_effect",
                                   "dr_effect", "dr_ci_low", "dr_ci_high", "share_cate_beneficial"]].round(4).to_string(), t0)

    # ── SHAP (LightGBM member of the stack) ──
    lgbm = final.bases["LightGBM"]
    sv = insights.shap_values(lgbm, X)
    reasons = insights.top_reasons(sv, X)
    report["global_importance"] = insights.global_importance(sv, X).head(25).to_dict(orient="records")

    # ── Churn-reason model ──
    reason_clf, reason_stats = insights.fit_reason_model(X, customers)
    reason_proba = reason_clf.predict_proba(X)
    report["reason_model"] = reason_stats
    _log(f"reason model acc {reason_stats['oof_accuracy']:.3f} "
         f"(baseline {reason_stats['majority_baseline']:.3f})", t0)

    # ── Decision threshold + economics ──
    curve = profit_curve(p_all, clv, DEFAULT_SAVE_RATE, DEFAULT_CONTACT_COST)
    best = max(curve, key=lambda r: r["net_value"])
    k_best = best["customers"]
    order = np.argsort(-(p_all * clv))
    decision_threshold = float(p_all[order[k_best - 1]]) if k_best else 0.5
    report["economics"] = {
        "assumptions": {"save_rate": DEFAULT_SAVE_RATE, "contact_cost": DEFAULT_CONTACT_COST,
                        "gross_margin": survival.GROSS_MARGIN,
                        "annual_discount": survival.ANNUAL_DISCOUNT,
                        "clv_horizon_months": survival.HORIZON_MONTHS},
        "profit_curve": curve, "optimal": best,
        "total_clv": float(clv.sum()),
        "total_clv_expected": float(clv_expected.sum()),
        "value_at_risk": float((p_all * clv).sum()),
        "uplift_targeting_value": float(rec["expected_net_value"].sum()),
        "uplift_customers_targeted": int((rec["best_offer"] != "No offer").sum()),
    }

    # ── Fairness ──
    groups = {"gender": customers["gender"], "senior_citizen": customers["senior_citizen"],
              "under_30": customers["under_30"]}
    fair = insights.fairness_audit(customers.iloc[te], p_te, 0.5,
                                   {k: v.iloc[te] for k, v in groups.items()})
    # Ablation: gender is excluded from the model; show what including it would add.
    X_g = data.to_model_matrix(customers, include_protected=True)
    lg = LGBMClassifier(n_estimators=500, learning_rate=0.03, num_leaves=24, verbose=-1,
                        random_state=42)
    auc_with = roc_auc_score(y_te, lg.fit(X_g.iloc[tr], y_tr).predict_proba(X_g.iloc[te])[:, 1])
    auc_without = roc_auc_score(y_te, lg.fit(X_tr, y_tr).predict_proba(X_te)[:, 1])
    report["fairness"] = {"groups": fair.to_dict(orient="records"),
                          "gender_ablation": {"auc_with_gender": float(auc_with),
                                              "auc_without_gender": float(auc_without)}}
    _log(f"fairness: AUC with gender {auc_with:.4f} vs without {auc_without:.4f}", t0)

    # ── Assemble scored customer table ──
    scored = customers.copy()
    scored["split"] = np.where(np.isin(np.arange(len(y)), te), "holdout", "train_oof")
    scored["churn_probability"] = p_all
    scored["risk_band"] = pd.cut(p_all, [-0.01, 0.2, 0.5, 0.75, 1.01],
                                 labels=["Low", "Medium", "High", "Critical"]).astype(str)
    scored["confidence"] = conf_all
    scored["clv"] = clv
    scored["clv_expected"] = clv_expected
    scored["value_at_risk"] = p_all * clv
    scored["expected_remaining_months"] = remaining
    scored["median_months_left"] = median_left
    scored["predicted_reason"] = reason_clf.classes_[reason_proba.argmax(axis=1)]
    scored["predicted_reason_conf"] = reason_proba.max(axis=1)
    scored["best_offer"] = rec["best_offer"].values
    scored["offer_net_value"] = rec["expected_net_value"].values
    scored["offer_churn_reduction"] = rec["expected_churn_reduction"].values
    for k in uplift.OFFERS:
        scored[f"uplift_{k[-1].lower()}"] = -up["cate"][k].values
    scored["top_reasons"] = [json.dumps(r) for r in reasons]
    from backend.app.playbook import ranked_plays
    ranked = [ranked_plays(r) for r in reasons]
    scored["play"] = [r[0] for r in ranked]
    scored["secondary_play"] = [r[1] if len(r) > 1 else "" for r in ranked]
    clv_med = np.median(clv)
    scored["priority"] = np.select(
        [(p_all >= decision_threshold) & (clv >= clv_med),
         (p_all >= decision_threshold) & (clv < clv_med),
         (p_all < decision_threshold) & (clv >= clv_med)],
        ["Save now", "Low-cost save", "Grow"], default="Maintain")
    scored.to_parquet(ARTIFACTS / "customers_scored.parquet", index=False)
    report["economics"]["decision_threshold"] = decision_threshold
    report["priority_counts"] = scored["priority"].value_counts().to_dict()

    # ── Persist model bundle ──
    joblib.dump({
        "model": final, "feature_names": list(X.columns), "cox": cph,
        "reason_model": reason_clf, "conformal": thr,
        "drift_baseline": insights.drift_baseline(X_tr),
        "decision_threshold": decision_threshold,
        "uplift_offers": uplift.OFFERS,
    }, ARTIFACTS / "model.joblib")
    with open(ARTIFACTS / "report.json", "w") as f:
        json.dump(report, f, indent=2, default=float)
    _log("artifacts written", t0)
    return report


if __name__ == "__main__":
    run()
