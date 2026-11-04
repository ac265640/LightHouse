"""
Time-to-churn and survival-based CLV.

The classifier answers "will this customer churn?"; the survival model answers
"when?". CLV is derived from the survival curve, NOT from the classifier's
probability, so CLV and risk are independent signals and the
risk × value matrix is no longer circular.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from lifelines import CoxPHFitter
from lifelines.utils import concordance_index

GROSS_MARGIN = 0.60          # share of monthly charge that is contribution margin
ANNUAL_DISCOUNT = 0.10
HORIZON_MONTHS = 60

SURVIVAL_FEATURES = [
    "age", "senior_citizen", "married", "number_of_dependents", "number_of_referrals",
    "monthly_charge", "n_services", "protection_services", "unlimited_data",
    "paperless_billing", "avg_monthly_gb_download", "contract_months",
    "internet_type_fiber_optic", "internet_type_none", "payment_method_credit_card",
    "payment_method_mailed_check", "charge_drift", "extra_data_ratio",
]


def survival_frame(X: pd.DataFrame, customers: pd.DataFrame) -> pd.DataFrame:
    df = X[[c for c in SURVIVAL_FEATURES if c in X.columns]].copy()
    df["duration"] = customers["tenure_in_months"].clip(lower=1).values
    df["event"] = customers["churn"].values
    return df


def fit_cox(df: pd.DataFrame, penalizer: float = 0.05) -> CoxPHFitter:
    return CoxPHFitter(penalizer=penalizer).fit(df, duration_col="duration", event_col="event")


def c_index(cph: CoxPHFitter, df: pd.DataFrame) -> float:
    risk = cph.predict_partial_hazard(df)
    return float(concordance_index(df["duration"], -risk, df["event"]))


def conditional_survival(cph: CoxPHFitter, df: pd.DataFrame,
                         horizon: int = HORIZON_MONTHS) -> np.ndarray:
    """
    S(t_now + k | alive at t_now) for k = 1..horizon, per customer.
    Shape (n_customers, horizon). Months past the training range are held at
    the last observed survival level (conservative for long-tenure customers).
    """
    max_t = int(df["duration"].max())
    times = np.arange(1, max_t + horizon + 1)
    sf = cph.predict_survival_function(df, times=times).T.values  # (n, T)
    now = df["duration"].astype(int).values
    out = np.empty((len(df), horizon))
    for i, t0 in enumerate(now):
        base = sf[i, t0 - 1]
        future = sf[i, t0:t0 + horizon]
        if len(future) < horizon:
            future = np.pad(future, (0, horizon - len(future)), mode="edge")
        out[i] = future / max(base, 1e-9)
    return np.clip(out, 0, 1)


def expected_remaining_months(cond_surv: np.ndarray) -> np.ndarray:
    return cond_surv.sum(axis=1)


def months_to_churn_risk(cond_surv: np.ndarray, level: float = 0.5) -> np.ndarray:
    """Median remaining lifetime: first month survival drops below `level`."""
    below = cond_surv < level
    first = np.where(below.any(axis=1), below.argmax(axis=1) + 1, cond_surv.shape[1])
    return first


def survival_clv(monthly_charge: np.ndarray, cond_surv: np.ndarray,
                 margin: float = GROSS_MARGIN, annual_rate: float = ANNUAL_DISCOUNT) -> np.ndarray:
    """CLV = Σ_k margin × charge × S(k) / (1+r)^k over the horizon."""
    r = (1 + annual_rate) ** (1 / 12) - 1
    k = np.arange(1, cond_surv.shape[1] + 1)
    disc = 1 / (1 + r) ** k
    return (margin * monthly_charge[:, None] * cond_surv * disc[None, :]).sum(axis=1)
