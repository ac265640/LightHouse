"""
Explainability, churn-reason prediction, fairness audit and drift baselines.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from lightgbm import LGBMClassifier
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import cross_val_predict, StratifiedKFold

SEED = 42

# Plain-English names for features shown to analysts
FRIENDLY = {
    "contract_months": "Contract length",
    "contract_month_to_month": "Month-to-month contract",
    "contract_two_year": "Two-year contract",
    "contract_one_year": "One-year contract",
    "tenure_in_months": "Tenure",
    "number_of_referrals": "Referrals made",
    "number_of_dependents": "Dependents",
    "monthly_charge": "Monthly bill",
    "internet_type_fiber_optic": "Fiber internet",
    "age": "Age",
    "payment_method_credit_card": "Pays by credit card",
    "payment_method_bank_withdrawal": "Pays by bank withdrawal",
    "payment_method_mailed_check": "Pays by mailed check",
    "online_security": "Online security add-on",
    "premium_tech_support": "Premium tech support",
    "protection_services": "Protection add-ons",
    "n_services": "Number of services",
    "avg_monthly_gb_download": "Data usage (GB/mo)",
    "charge_drift": "Bill increase vs history",
    "total_revenue": "Lifetime revenue",
    "total_charges": "Total charges",
    "avg_monthly_revenue": "Avg monthly revenue",
    "total_long_distance_charges": "Long-distance spend",
    "avg_monthly_long_distance_charges": "Avg long-distance charges",
    "married": "Married",
    "dependents": "Has dependents",
    "senior_citizen": "Senior citizen",
    "under_30": "Under 30",
    "paperless_billing": "Paperless billing",
    "unlimited_data": "Unlimited data",
    "is_new_customer": "New customer (≤6 mo)",
    "has_referred": "Has referred a friend",
    "referred_a_friend": "Referred a friend",
    "population": "Area population",
    "latitude": "Location (lat)",
    "longitude": "Location (long)",
    "revenue_per_service": "Revenue per service",
    "extra_data_ratio": "Extra data charges share",
    "refund_ratio": "Refunds share",
    "total_extra_data_charges": "Extra data charges",
    "total_refunds": "Refunds",
    "streaming_tv": "Streaming TV",
    "streaming_movies": "Streaming movies",
    "streaming_music": "Streaming music",
    "online_backup": "Online backup",
    "device_protection_plan": "Device protection",
    "multiple_lines": "Multiple lines",
    "internet_service": "Has internet",
    "phone_service": "Has phone",
    "internet_type_dsl": "DSL internet",
    "internet_type_cable": "Cable internet",
    "internet_type_none": "No internet",
    "gender_male": "Gender: male",
    "gender_female": "Gender: female",
}


def friendly(name: str) -> str:
    return FRIENDLY.get(name, name.replace("_", " ").capitalize())


# ── SHAP ───────────────────────────────────────────────────────────────────────

def shap_values(model, X: pd.DataFrame) -> np.ndarray:
    """Exact TreeSHAP values (log-odds) for a LightGBM model.

    LightGBM computes these natively (`pred_contrib`), identical to shap.TreeExplainer,
    so the API does not need to load the shap library at runtime."""
    return model.predict(X, pred_contrib=True)[:, :-1]


def top_reasons(sv: np.ndarray, X: pd.DataFrame, k: int = 5) -> list[list[dict]]:
    cols = list(X.columns)
    out = []
    for i in range(sv.shape[0]):
        order = np.argsort(-sv[i])[:k]  # strongest push towards churn
        out.append([{"feature": cols[j], "label": friendly(cols[j]),
                     "value": float(X.iat[i, j]), "impact": float(sv[i, j])}
                    for j in order if sv[i, j] > 0])
    return out


def global_importance(sv: np.ndarray, X: pd.DataFrame) -> pd.DataFrame:
    imp = np.abs(sv).mean(axis=0)
    direction = [np.corrcoef(X.iloc[:, j], sv[:, j])[0, 1] if X.iloc[:, j].std() > 0 else 0
                 for j in range(X.shape[1])]
    return (pd.DataFrame({"feature": X.columns, "label": [friendly(c) for c in X.columns],
                          "mean_abs_shap": imp, "direction": np.nan_to_num(direction)})
            .sort_values("mean_abs_shap", ascending=False).reset_index(drop=True))


# ── Churn reason model ────────────────────────────────────────────────────────

def fit_reason_model(X: pd.DataFrame, customers: pd.DataFrame):
    """
    Learn P(churn category | profile) from customers who already left, then
    apply to at-risk active customers: "if this customer leaves, why?"
    Returns (fitted model, out-of-fold accuracy, class list).
    """
    from sklearn.metrics import balanced_accuracy_score, top_k_accuracy_score

    churned = customers["churn"].values == 1
    Xc, yc = X[churned], customers.loc[churned, "churn_category"].values
    clf = LGBMClassifier(n_estimators=200, learning_rate=0.03, num_leaves=8,
                         min_child_samples=30, verbose=-1, random_state=SEED)
    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=SEED)
    proba = cross_val_predict(clf, Xc, yc, cv=skf, method="predict_proba")
    classes = np.unique(yc)
    pred = classes[proba.argmax(axis=1)]
    shares = pd.Series(yc).value_counts(normalize=True)
    clf.fit(Xc, yc)
    return clf, {
        "oof_accuracy": float((pred == yc).mean()),
        "balanced_accuracy": float(balanced_accuracy_score(yc, pred)),
        "top2_accuracy": float(top_k_accuracy_score(yc, proba, k=2, labels=classes)),
        "majority_baseline": float(shares.max()),
        "chance_balanced": 1 / len(classes),
        "class_shares": shares.to_dict(),
        "classes": list(clf.classes_),
        "verdict": ("Exit reasons are weakly predictable from profile alone; "
                    "playbooks are therefore keyed on model drivers, and capturing "
                    "exit-survey signals earlier is recommended."),
    }


# ── Fairness ───────────────────────────────────────────────────────────────────

def fairness_audit(df: pd.DataFrame, p: np.ndarray, threshold: float,
                   groups: dict[str, pd.Series]) -> pd.DataFrame:
    y = df["churn"].values
    rows = []
    for attr, g in groups.items():
        for val in sorted(g.unique()):
            m = (g == val).values
            yp = p[m] >= threshold
            yt = y[m] == 1
            rows.append({
                "attribute": attr, "group": str(val), "n": int(m.sum()),
                "actual_churn_rate": float(yt.mean()),
                "mean_predicted_risk": float(p[m].mean()),
                "flag_rate": float(yp.mean()),
                "tpr": float((yp & yt).sum() / max(yt.sum(), 1)),
                "fpr": float((yp & ~yt).sum() / max((~yt).sum(), 1)),
                "auc": float(roc_auc_score(yt, p[m])) if 0 < yt.mean() < 1 else None,
            })
    out = pd.DataFrame(rows)
    # equal-opportunity gap per attribute (max TPR difference across groups)
    gaps = out.groupby("attribute")["tpr"].agg(lambda s: s.max() - s.min())
    out["tpr_gap_for_attribute"] = out["attribute"].map(gaps)
    return out


# ── Drift baseline ─────────────────────────────────────────────────────────────

def drift_baseline(X: pd.DataFrame, n_bins: int = 10) -> dict:
    base = {}
    for c in X.columns:
        v = X[c].values.astype(float)
        if len(np.unique(v)) <= n_bins:
            edges = np.unique(v)
            edges = np.concatenate([edges - 0.5, [edges[-1] + 0.5]])
        else:
            edges = np.unique(np.quantile(v, np.linspace(0, 1, n_bins + 1)))
        hist, _ = np.histogram(v, bins=edges)
        base[c] = {"edges": edges.tolist(), "dist": (hist / hist.sum()).tolist()}
    return base


def psi(baseline: dict, X_new: pd.DataFrame) -> dict:
    """Population Stability Index per feature (>0.25 = significant drift)."""
    out = {}
    for c, b in baseline.items():
        if c not in X_new.columns:
            continue
        edges = np.array(b["edges"])
        e = np.clip(np.array(b["dist"]), 1e-4, None)
        v = np.clip(X_new[c].values.astype(float), edges[0], edges[-1])
        a, _ = np.histogram(v, bins=edges)
        a = np.clip(a / max(a.sum(), 1), 1e-4, None)
        out[c] = float(np.sum((a - e) * np.log(a / e)))
    return out
