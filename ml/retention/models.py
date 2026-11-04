"""
Model benchmark: five model families + a stacked ensemble, evaluated on
identical stratified folds, then calibrated and checked on a locked holdout.

Every customer gets an *honest* score: out-of-fold for the training split,
holdout predictions for the test split. Nothing shown in the dashboard is
scored by a model that saw that customer during training.
"""
from __future__ import annotations

import warnings

import numpy as np
import pandas as pd
from catboost import CatBoostClassifier
from lightgbm import LGBMClassifier
from sklearn.base import clone
from sklearn.ensemble import RandomForestClassifier
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, log_loss, roc_auc_score
from sklearn.model_selection import StratifiedKFold, train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier

warnings.filterwarnings("ignore")

SEED = 42
N_FOLDS = 5
TEST_SIZE = 0.20


def model_zoo() -> dict:
    pos_weight = 2.77  # ≈ n_neg / n_pos; used instead of SMOTE (no synthetic rows)
    return {
        "Logistic Regression": make_pipeline(
            StandardScaler(), LogisticRegression(C=0.5, max_iter=2000, class_weight="balanced")),
        "Random Forest": RandomForestClassifier(
            n_estimators=500, min_samples_leaf=3, class_weight="balanced_subsample",
            n_jobs=-1, random_state=SEED),
        "XGBoost": XGBClassifier(
            n_estimators=600, max_depth=4, learning_rate=0.03, subsample=0.85,
            colsample_bytree=0.8, min_child_weight=3, scale_pos_weight=pos_weight,
            eval_metric="logloss", n_jobs=-1, random_state=SEED),
        "LightGBM": LGBMClassifier(
            n_estimators=700, learning_rate=0.03, num_leaves=24, subsample=0.85,
            subsample_freq=1, colsample_bytree=0.8, min_child_samples=20,
            scale_pos_weight=pos_weight, verbose=-1, random_state=SEED),
        "CatBoost": CatBoostClassifier(
            iterations=800, depth=5, learning_rate=0.04, auto_class_weights="Balanced",
            verbose=0, random_seed=SEED, allow_writing_files=False),
    }


# ── Metrics ────────────────────────────────────────────────────────────────────

def expected_calibration_error(y: np.ndarray, p: np.ndarray, n_bins: int = 10) -> float:
    bins = np.linspace(0, 1, n_bins + 1)
    idx = np.clip(np.digitize(p, bins) - 1, 0, n_bins - 1)
    ece = 0.0
    for b in range(n_bins):
        m = idx == b
        if m.any():
            ece += m.mean() * abs(y[m].mean() - p[m].mean())
    return float(ece)


def top_decile_lift(y: np.ndarray, p: np.ndarray) -> float:
    k = max(1, int(len(p) * 0.10))
    top = np.argsort(-p)[:k]
    return float(y[top].mean() / y.mean())


def score_all(y: np.ndarray, p: np.ndarray) -> dict:
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return {
        "auc": roc_auc_score(y, p),
        "pr_auc": average_precision_score(y, p),
        "brier": brier_score_loss(y, p),
        "log_loss": log_loss(y, p),
        "ece": expected_calibration_error(y, p),
        "top_decile_lift": top_decile_lift(y, p),
    }


# ── Benchmark ──────────────────────────────────────────────────────────────────

def split(X: pd.DataFrame, y: np.ndarray):
    idx = np.arange(len(y))
    tr, te = train_test_split(idx, test_size=TEST_SIZE, stratify=y, random_state=SEED)
    return tr, te


def cross_validate_zoo(X: pd.DataFrame, y: np.ndarray) -> tuple[pd.DataFrame, dict]:
    """Return (per-fold metrics table, {model_name: out-of-fold probabilities})."""
    skf = StratifiedKFold(n_splits=N_FOLDS, shuffle=True, random_state=SEED)
    zoo = model_zoo()
    oof = {name: np.zeros(len(y)) for name in zoo}
    rows = []
    for fold, (a, b) in enumerate(skf.split(X, y)):
        for name, est in zoo.items():
            m = clone(est).fit(X.iloc[a], y[a])
            p = m.predict_proba(X.iloc[b])[:, 1]
            oof[name][b] = p
            rows.append({"model": name, "fold": fold, **score_all(y[b], p)})

    # Stacked ensemble: logistic meta-learner over base-model OOF probabilities,
    # itself evaluated out-of-fold so the stack never sees its own training rows.
    base = np.column_stack([oof[n] for n in zoo])
    stack_oof = np.zeros(len(y))
    for fold, (a, b) in enumerate(skf.split(X, y)):
        meta = LogisticRegression(max_iter=1000).fit(base[a], y[a])
        stack_oof[b] = meta.predict_proba(base[b])[:, 1]
        rows.append({"model": "Stacked Ensemble", "fold": fold, **score_all(y[b], stack_oof[b])})
    oof["Stacked Ensemble"] = stack_oof
    return pd.DataFrame(rows), oof


def leaderboard(fold_metrics: pd.DataFrame) -> pd.DataFrame:
    agg = fold_metrics.groupby("model").agg(["mean", "std"])
    agg = agg.drop(columns="fold", level=0)
    agg.columns = [f"{m}_{s}" for m, s in agg.columns]
    return agg.sort_values("auc_mean", ascending=False).reset_index()


def paired_bootstrap_auc(y, p_a, p_b, n: int = 2000, seed: int = SEED) -> dict:
    """P(model A's AUC > model B's AUC) under bootstrap resampling of customers."""
    rng = np.random.default_rng(seed)
    diffs = []
    for _ in range(n):
        i = rng.integers(0, len(y), len(y))
        if y[i].min() == y[i].max():
            continue
        diffs.append(roc_auc_score(y[i], p_a[i]) - roc_auc_score(y[i], p_b[i]))
    diffs = np.array(diffs)
    return {"auc_diff_mean": float(diffs.mean()),
            "ci_low": float(np.percentile(diffs, 2.5)),
            "ci_high": float(np.percentile(diffs, 97.5)),
            "p_a_better": float((diffs > 0).mean())}


# ── Final model ────────────────────────────────────────────────────────────────

class CalibratedStack:
    """Base models + logistic stacker + isotonic calibration, as one predictor."""

    def __init__(self, bases: dict, meta: LogisticRegression, iso: IsotonicRegression,
                 feature_names: list[str]):
        self.bases, self.meta, self.iso = bases, meta, iso
        self.feature_names = feature_names

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        X = X.reindex(columns=self.feature_names, fill_value=0).astype("float32")
        base = np.column_stack([m.predict_proba(X)[:, 1] for m in self.bases.values()])
        raw = self.meta.predict_proba(base)[:, 1]
        p = self.iso.predict(raw)
        return np.column_stack([1 - p, p])


def fit_final(X_tr: pd.DataFrame, y_tr: np.ndarray, oof_tr: dict) -> CalibratedStack:
    zoo = model_zoo()
    bases = {n: clone(e).fit(X_tr, y_tr) for n, e in zoo.items()}
    base_oof = np.column_stack([oof_tr[n] for n in zoo])
    meta = LogisticRegression(max_iter=1000).fit(base_oof, y_tr)
    iso = IsotonicRegression(out_of_bounds="clip", y_min=0, y_max=1).fit(
        meta.predict_proba(base_oof)[:, 1], y_tr)
    return CalibratedStack(bases, meta, iso, list(X_tr.columns))


# ── Conformal prediction ──────────────────────────────────────────────────────

def conformal_thresholds(y_cal: np.ndarray, p_cal: np.ndarray, alpha: float = 0.10) -> dict:
    """
    Class-conditional (Mondrian) split conformal. A label is included in a
    customer's prediction set when its probability clears that class's
    threshold; this gives ≥ (1-alpha) coverage for churners and stayers separately.
    """
    q = {}
    for label in (0, 1):
        s = 1 - (p_cal[y_cal == 1] if label == 1 else 1 - p_cal[y_cal == 0])
        n = len(s)
        level = min(1.0, np.ceil((n + 1) * (1 - alpha)) / n)
        q[label] = float(np.quantile(s, level, method="higher"))
    return {"alpha": alpha, "q_stay": q[0], "q_churn": q[1]}


def conformal_sets(p: np.ndarray, thr: dict) -> np.ndarray:
    churn_in = (1 - p) <= thr["q_churn"]
    stay_in = p <= thr["q_stay"]
    return np.where(churn_in & ~stay_in, "Will churn",
                    np.where(stay_in & ~churn_in, "Will stay", "Uncertain"))
