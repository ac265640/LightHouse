"""
Data layer: load the IBM Telco 11.1.3 extended dataset, audit leakage,
and build the model-ready feature table.

Leakage policy
--------------
Columns that are only known *after* a customer churns, or are themselves
derived from the outcome, are never model inputs:

  Churn Category, Churn Reason, Customer Status  -> written at exit time
  Satisfaction Score                             -> 1-2 => 100% churn, 4-5 => 0%
  Churn Score                                    -> IBM's own churn model output

They are kept in the customer table for analysis (reason-aware playbook),
but `feature_columns()` excludes them by construction.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = PROJECT_ROOT / "data" / "raw" / "hf_ibm_telco"
PROCESSED_DIR = PROJECT_ROOT / "data" / "processed"

TARGET = "churn"
ID_COL = "customer_id"

LEAKAGE_COLS: list[str] = [
    "churn_category", "churn_reason", "customer_status",
    "satisfaction_score", "churn_score",
]

# Constant / identifier / geography-string columns: not used as features
NON_FEATURE_COLS: list[str] = [
    ID_COL, TARGET, "country", "state", "quarter", "lat_long", "city",
    "zip_code", "offer",
]

CATEGORICAL_COLS: list[str] = [
    "contract", "internet_type", "payment_method", "gender",
]

EXPECTED_ROWS = 7043


def _snake(name: str) -> str:
    return name.strip().lower().replace(" ", "_").replace("-", "_")


def load_raw(raw_dir: Path = RAW_DIR) -> pd.DataFrame:
    """Concatenate the three published splits into one customer table."""
    parts = [pd.read_csv(raw_dir / f"{s}.csv") for s in ("train", "validation", "test")]
    df = pd.concat(parts, ignore_index=True)
    df.columns = [_snake(c) for c in df.columns]

    if len(df) != EXPECTED_ROWS:
        raise ValueError(f"Expected {EXPECTED_ROWS} rows, got {len(df)}")
    if df[ID_COL].duplicated().any():
        raise ValueError("Duplicate customer IDs in raw data")
    if not set(df[TARGET].unique()) <= {0, 1}:
        raise ValueError("Churn column must be binary 0/1")
    return df


def clean(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["offer"] = df["offer"].fillna("None")
    df["internet_type"] = df["internet_type"].fillna("None")
    for col in ("churn_category", "churn_reason"):
        df[col] = df[col].fillna("")
    return df


def engineer(df: pd.DataFrame) -> pd.DataFrame:
    """Business-meaningful derived features (all known before churn)."""
    df = df.copy()
    t = df["tenure_in_months"].clip(lower=1)
    services = [
        "phone_service", "multiple_lines", "internet_service", "online_security",
        "online_backup", "device_protection_plan", "premium_tech_support",
        "streaming_tv", "streaming_movies", "streaming_music", "unlimited_data",
    ]
    df["n_services"] = df[services].sum(axis=1)
    df["protection_services"] = df[
        ["online_security", "online_backup", "device_protection_plan", "premium_tech_support"]
    ].sum(axis=1)
    df["avg_monthly_revenue"] = df["total_revenue"] / t
    # Price drift: current bill vs historical average bill. >1 => bill went up.
    df["charge_drift"] = df["monthly_charge"] / (df["total_charges"] / t).replace(0, np.nan)
    df["charge_drift"] = df["charge_drift"].fillna(1.0)
    df["refund_ratio"] = df["total_refunds"] / df["total_revenue"].replace(0, np.nan)
    df["refund_ratio"] = df["refund_ratio"].fillna(0.0)
    df["extra_data_ratio"] = df["total_extra_data_charges"] / df["total_revenue"].replace(0, np.nan)
    df["extra_data_ratio"] = df["extra_data_ratio"].fillna(0.0)
    df["is_new_customer"] = (df["tenure_in_months"] <= 6).astype(int)
    df["has_referred"] = (df["number_of_referrals"] > 0).astype(int)
    df["revenue_per_service"] = df["monthly_charge"] / df["n_services"].clip(lower=1)
    df["contract_months"] = df["contract"].map(
        {"Month-to-Month": 1, "One Year": 12, "Two Year": 24}
    )
    return df


# Protected attribute: excluded from the model (ablation shows it adds no
# accuracy), kept in the table for the fairness audit.
PROTECTED_COLS: list[str] = ["gender"]


def feature_columns(df: pd.DataFrame, include_protected: bool = False) -> list[str]:
    """Model input columns: everything except IDs, target, leakage and protected."""
    excluded = set(NON_FEATURE_COLS) | set(LEAKAGE_COLS) | {"cltv"}
    if not include_protected:
        excluded |= set(PROTECTED_COLS)
    return [c for c in df.columns if c not in excluded]


def to_model_matrix(df: pd.DataFrame, columns: list[str] | None = None,
                    include_protected: bool = False) -> pd.DataFrame:
    """One-hot encode categoricals. Pass `columns` to align to a trained schema."""
    feats = feature_columns(df, include_protected)
    X = pd.get_dummies(df[feats], columns=[c for c in CATEGORICAL_COLS if c in feats],
                       dtype="int8")
    X.columns = [_snake(c) for c in X.columns]
    if columns is not None:
        X = X.reindex(columns=columns, fill_value=0)
    return X.astype("float32")


def leakage_audit(df: pd.DataFrame) -> pd.DataFrame:
    """Single-feature AUC of each suspected leak vs the target (0.5 = no signal)."""
    from sklearn.metrics import roc_auc_score

    rows = []
    for col in ("satisfaction_score", "churn_score", "cltv"):
        auc = roc_auc_score(df[TARGET], df[col])
        rows.append({"column": col, "single_feature_auc": round(max(auc, 1 - auc), 4),
                     "excluded": col in LEAKAGE_COLS or col == "cltv"})
    for col in ("churn_category", "churn_reason", "customer_status"):
        known_only_if_churned = (df.loc[df[TARGET] == 0, col].astype(str)
                                 .isin(["", "Stayed", "Joined"]).mean())
        rows.append({"column": col, "single_feature_auc": 1.0 if known_only_if_churned == 1 else None,
                     "excluded": True})
    return pd.DataFrame(rows)


def build_customer_table(save: bool = True) -> pd.DataFrame:
    df = engineer(clean(load_raw()))
    if save:
        PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
        df.to_parquet(PROCESSED_DIR / "customers.parquet", index=False)
    return df
