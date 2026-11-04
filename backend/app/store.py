"""Loads trained artifacts once and exposes scoring helpers to the API."""
from __future__ import annotations

import json
from functools import cached_property

import joblib
import numpy as np
import pandas as pd

from ml.retention import data, insights, survival
from ml.retention.data import PROJECT_ROOT

ARTIFACTS = PROJECT_ROOT / "artifacts"


class Store:
    @cached_property
    def bundle(self) -> dict:
        return joblib.load(ARTIFACTS / "model.joblib")

    @cached_property
    def customers(self) -> pd.DataFrame:
        df = pd.read_parquet(ARTIFACTS / "customers_scored.parquet")
        return df.set_index("customer_id", drop=False)

    @cached_property
    def report(self) -> dict:
        with open(ARTIFACTS / "report.json") as f:
            return json.load(f)

    @property
    def features(self) -> list[str]:
        return self.bundle["feature_names"]

    def matrix(self, rows: pd.DataFrame) -> pd.DataFrame:
        return data.to_model_matrix(rows, columns=self.features)

    def score_rows(self, rows: pd.DataFrame) -> pd.DataFrame:
        """Score raw customer rows (snake_case IBM schema) end to end."""
        rows = data.engineer(data.clean(rows))
        X = self.matrix(rows)
        p = self.bundle["model"].predict_proba(X)[:, 1]
        sdf = survival.survival_frame(X, rows.assign(churn=0))
        cond = survival.conditional_survival(self.bundle["cox"], sdf)
        clv = survival.clv_if_retained(rows["monthly_charge"].values, cond)
        reason = self.bundle["reason_model"].predict(X)
        sv = insights.shap_values(self.bundle["model"].bases["LightGBM"], X)
        out = pd.DataFrame({
            "customer_id": rows["customer_id"].values,
            "churn_probability": p,
            "clv": clv,
            "value_at_risk": p * clv,
            "median_months_left": survival.months_to_churn_risk(cond),
            "predicted_reason": reason,
        })
        out["top_reasons"] = insights.top_reasons(sv, X)
        return out

    def drift(self, rows: pd.DataFrame) -> dict:
        X = self.matrix(data.engineer(data.clean(rows)))
        return insights.psi(self.bundle["drift_baseline"], X)


store = Store()
