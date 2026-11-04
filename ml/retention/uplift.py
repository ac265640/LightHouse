"""
Offer uplift: which retention offer actually changes which customer's outcome.

The five offers in this data are tenure-gated loyalty tiers:

    Offer E: months 1-10   Offer D: 10-23   Offer C: 24-39
    Offer B: 40-65         Offer A: 66-72

So "Offer A customers churn least" says nothing about Offer A. It only says
long-tenure customers churn least. Every effect here is estimated *within*
the offer's eligibility window, against customers in the same window who got
no offer, with a doubly-robust (DR) learner:

  1. cross-fitted propensity e(x) and outcome models mu1(x), mu0(x);
  2. DR pseudo-outcome
         phi = mu1 - mu0 + T(y - mu1)/e - (1 - T)(y - mu0)/(1 - e)
     whose mean is the window's average effect (with a standard error);
  3. a shallow regressor on phi gives the customer-level effect (CATE).

Effects are churn-probability deltas: negative = the offer reduces churn.
Offers were not randomised, so these are observational estimates. The
campaign planner sizes the A/B test that would confirm them.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from lightgbm import LGBMClassifier, LGBMRegressor
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

OFFERS = ["Offer A", "Offer B", "Offer C", "Offer D", "Offer E"]
CONTROL = "None"
SEED = 42

# Tenure eligibility window (inclusive) per offer, as observed in the data
OFFER_WINDOWS = {"Offer E": (1, 10), "Offer D": (10, 23), "Offer C": (24, 39),
                 "Offer B": (40, 65), "Offer A": (66, 72)}

# Assumed one-off cost of each offer per customer (USD). Editable in the API.
OFFER_COST = {"Offer A": 60.0, "Offer B": 45.0, "Offer C": 35.0,
              "Offer D": 25.0, "Offer E": 15.0}

# Confounders the propensity / outcome models adjust for (tenure handled by windowing)
ADJUST = [
    "tenure_in_months", "contract_months", "monthly_charge", "number_of_referrals",
    "number_of_dependents", "age", "internet_type_fiber_optic", "internet_type_none",
    "premium_tech_support", "online_security", "unlimited_data", "n_services",
    "payment_method_credit_card", "paperless_billing", "married", "senior_citizen",
]
EFFECT_MODIFIERS = ["contract_months", "monthly_charge", "number_of_referrals",
                    "internet_type_fiber_optic", "tenure_in_months", "age", "n_services"]


def _clf() -> LGBMClassifier:
    return LGBMClassifier(n_estimators=150, learning_rate=0.05, num_leaves=7,
                          min_child_samples=40, verbose=-1, random_state=SEED)


def _propensity() -> object:
    return make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000, C=0.3))


def _dr_window(Xw: pd.DataFrame, yw: np.ndarray, tw: np.ndarray, n_folds: int = 3):
    """Cross-fitted DR pseudo-outcomes for one offer window."""
    phi = np.zeros(len(yw))
    e_hat = np.zeros(len(yw))
    skf = StratifiedKFold(n_splits=n_folds, shuffle=True, random_state=SEED)
    strata = tw * 2 + yw
    for a, b in skf.split(Xw, strata):
        e = _propensity().fit(Xw.iloc[a], tw[a]).predict_proba(Xw.iloc[b])[:, 1]
        e = np.clip(e, 0.05, 0.95)
        m1 = _clf().fit(Xw.iloc[a][tw[a] == 1], yw[a][tw[a] == 1])
        m0 = _clf().fit(Xw.iloc[a][tw[a] == 0], yw[a][tw[a] == 0])
        mu1 = m1.predict_proba(Xw.iloc[b])[:, 1]
        mu0 = m0.predict_proba(Xw.iloc[b])[:, 1]
        t, y = tw[b], yw[b]
        phi[b] = mu1 - mu0 + t * (y - mu1) / e - (1 - t) * (y - mu0) / (1 - e)
        e_hat[b] = e
    return phi, e_hat


def fit_uplift(X: pd.DataFrame, y: np.ndarray, offer: pd.Series,
               tenure: pd.Series) -> dict:
    """Per-offer CATE (NaN outside the offer's window) plus window-level effects."""
    cols = [c for c in ADJUST if c in X.columns]
    mods = [c for c in EFFECT_MODIFIERS if c in X.columns]
    cate, rows = {}, []
    for k in OFFERS:
        lo, hi = OFFER_WINDOWS[k]
        in_win = tenure.between(lo, hi).values
        pool = in_win & offer.isin([k, CONTROL]).values
        Xw, yw = X.loc[pool, cols], y[pool]
        tw = (offer[pool] == k).values.astype(int)

        phi, e_hat = _dr_window(Xw, yw, tw)
        ate = float(phi.mean())
        se = float(phi.std(ddof=1) / np.sqrt(len(phi)))

        reg = LGBMRegressor(n_estimators=120, learning_rate=0.05, num_leaves=4,
                            min_child_samples=80, verbose=-1, random_state=SEED)
        reg.fit(X.loc[pool, mods], phi)
        effect = np.full(len(y), np.nan)
        effect[in_win] = np.clip(reg.predict(X.loc[in_win, mods]), -0.4, 0.4)
        cate[k] = effect

        treated, ctrl = tw == 1, tw == 0
        rows.append({
            "offer": k, "window": f"{lo}-{hi} months",
            "n_received": int((offer == k).sum()),
            "n_control_in_window": int(ctrl.sum()),
            "raw_churn_rate": float(y[(offer == k).values].mean()),
            "naive_effect": float(y[(offer == k).values].mean() - y[(offer == CONTROL).values].mean()),
            "window_naive_effect": float(yw[treated].mean() - yw[ctrl].mean()),
            "dr_effect": ate,
            "dr_ci_low": ate - 1.96 * se, "dr_ci_high": ate + 1.96 * se,
            "significant": bool(abs(ate) > 1.96 * se),
            "cate_mean": float(np.nanmean(effect)),
            "share_cate_beneficial": float(np.nanmean(effect[in_win] < 0)),
            "propensity_range": [float(e_hat.min()), float(e_hat.max())],
            "cost": OFFER_COST[k],
        })
    return {"cate": pd.DataFrame(cate, index=X.index), "ate": pd.DataFrame(rows)}


def best_offer(cate: pd.DataFrame, clv: np.ndarray, costs: dict = OFFER_COST) -> pd.DataFrame:
    """
    Expected net value of sending offer k to customer i:
        value_ik = (-CATE_ik) × CLV_i − cost_k
    Pick the offer with the highest value; "No offer" if none is positive.
    """
    vals = pd.DataFrame({k: (-cate[k].values) * clv - costs[k] for k in cate.columns},
                        index=cate.index)
    filled = vals.fillna(-np.inf)
    best = filled.idxmax(axis=1)
    best_val = filled.max(axis=1)
    best = best.where(best_val > 0, "No offer")
    best_val = best_val.where(best_val > 0, 0.0)
    uplift = pd.Series([-cate.at[i, b] if b != "No offer" else 0.0
                        for i, b in zip(cate.index, best)], index=cate.index)
    return pd.DataFrame({"best_offer": best, "expected_net_value": best_val,
                         "expected_churn_reduction": uplift})


def qini_curve(y: np.ndarray, treated: np.ndarray, score: np.ndarray, n_points: int = 50):
    """Qini curve for a binary treatment; higher score = predicted more persuadable."""
    order = np.argsort(-score)
    y, t = y[order], treated[order]
    n = len(y)
    xs, qs = [0.0], [0.0]
    for frac in np.linspace(0, 1, n_points + 1)[1:]:
        k = max(1, int(frac * n))
        nt, nc = t[:k].sum(), (~t[:k]).sum()
        rt = (1 - y[:k][t[:k]]).sum()
        rc = (1 - y[:k][~t[:k]]).sum()
        q = rt - (rc * nt / nc if nc > 0 else 0.0)
        xs.append(float(frac)); qs.append(float(q))
    return xs, qs
