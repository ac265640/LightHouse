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


OBSERVATION_MONTHS = 3  # the dataset is a single-quarter (Q3) snapshot
META_COLS = ["duration", "event", "entry"]


def survival_frame(X: pd.DataFrame, customers: pd.DataFrame) -> pd.DataFrame:
    """
    Survival design with left truncation (delayed entry).

    Each customer is only observed during the last quarter of their tenure:
    churners churned within it, stayers survived it. A customer therefore
    enters the risk set at `tenure - 3`, not at month 0. Ignoring this treats
    every stayer as watched since signup and underestimates hazard ~10x.
    """
    df = X[[c for c in SURVIVAL_FEATURES if c in X.columns]].copy()
    duration = customers["tenure_in_months"].clip(lower=1).values
    df["duration"] = duration
    df["event"] = customers["churn"].values
    df["entry"] = np.clip(duration - OBSERVATION_MONTHS, 0, None)
    return df


def _breslow_baseline(cph: CoxPHFitter, df: pd.DataFrame) -> np.ndarray:
    """
    Cumulative baseline hazard H0(t), t = 0..max_t, with delayed entry:

        h0(t) = d(t) / Σ_{i : entry_i < t ≤ duration_i} exp(lp_i)

    lifelines estimates β correctly under left truncation, but its stored
    baseline hazard counts customers in the risk set before they entered,
    so we recompute it here.
    """
    lp = cph.predict_log_partial_hazard(df.drop(columns=META_COLS)).values
    w = np.exp(lp)
    dur, ent, ev = df["duration"].values, df["entry"].values, df["event"].values
    max_t = int(dur.max())
    h0 = np.zeros(max_t + 1)
    for t in range(1, max_t + 1):
        at_risk = (ent < t) & (dur >= t)
        d = ((dur == t) & (ev == 1)).sum()
        denom = w[at_risk].sum()
        h0[t] = d / denom if denom > 0 else 0.0
    return np.cumsum(h0)


def fit_cox(df: pd.DataFrame, penalizer: float = 0.05) -> CoxPHFitter:
    cph = CoxPHFitter(penalizer=penalizer).fit(
        df, duration_col="duration", event_col="event", entry_col="entry")
    cph.lh_cum_baseline = _breslow_baseline(cph, df)
    return cph


def c_index(cph: CoxPHFitter, df: pd.DataFrame) -> float:
    risk = cph.predict_partial_hazard(df.drop(columns=META_COLS))
    return float(concordance_index(df["duration"], -risk, df["event"]))


def conditional_survival(cph: CoxPHFitter, df: pd.DataFrame,
                         horizon: int = HORIZON_MONTHS) -> np.ndarray:
    """
    S(t_now + k | alive at t_now) for k = 1..horizon, per customer:

        exp(-(H0(t_now + k) - H0(t_now)) · exp(lp))

    Beyond the observed tenure range, the baseline hazard is extended at the
    average rate of the final 12 observed months.
    """
    H0 = cph.lh_cum_baseline
    max_t = len(H0) - 1
    tail_rate = (H0[max_t] - H0[max_t - 12]) / 12
    ext = H0[max_t] + tail_rate * np.arange(1, horizon + 1)
    H = np.concatenate([H0, ext])  # index = month
    w = np.exp(cph.predict_log_partial_hazard(df.drop(columns=META_COLS)).values)
    now = df["duration"].astype(int).values
    idx = now[:, None] + np.arange(1, horizon + 1)[None, :]
    dH = H[idx] - H[now][:, None]
    return np.clip(np.exp(-dH * w[:, None]), 0, 1)


def churn_within(cond_surv: np.ndarray, months: int = OBSERVATION_MONTHS) -> np.ndarray:
    """P(churn within the next `months`) implied by the survival curve."""
    return 1 - cond_surv[:, months - 1]


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


def clv_if_retained(monthly_charge: np.ndarray, cond_surv: np.ndarray,
                    months: int = OBSERVATION_MONTHS, **kw) -> np.ndarray:
    """
    CLV given the customer is kept through the next quarter: what a successful
    retention action actually protects. Used for value-at-risk and offer ROI,
    so high-risk customers are not undervalued just because they are high risk.
    """
    s = cond_surv.copy()
    s[:, :months] = 1.0
    s[:, months:] = cond_surv[:, months:] / np.clip(cond_surv[:, [months - 1]], 1e-9, None)
    return survival_clv(monthly_charge, np.clip(s, 0, 1), **kw)
