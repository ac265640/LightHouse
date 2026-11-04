"""
Offer uplift: which retention offer actually changes which customer's outcome.

The dataset records which of five offers (A-E) each customer received. Offers
were not randomised, so a raw comparison is confounded (e.g. new customers get
different offers). We therefore:

  1. fit a propensity model P(offer | customer) and keep only customers in the
     region of common support (overlap trimming);
  2. estimate per-offer conditional effects with a T-learner
     (separate outcome models for "got offer k" vs "got no offer");
  3. report an inverse-propensity-weighted average effect per offer as a
     sanity check on the T-learner.

Effects are churn-probability deltas: negative = the offer reduces churn.
Judges should read these as *observational* estimates, to be confirmed by the
A/B test the campaign planner designs.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from lightgbm import LGBMClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

OFFERS = ["Offer A", "Offer B", "Offer C", "Offer D", "Offer E"]
CONTROL = "None"
SEED = 42

# Assumed one-off cost of each offer per customer (USD). Editable in the API.
OFFER_COST = {"Offer A": 60.0, "Offer B": 45.0, "Offer C": 35.0,
              "Offer D": 25.0, "Offer E": 15.0}


def _outcome_model() -> LGBMClassifier:
    return LGBMClassifier(n_estimators=300, learning_rate=0.04, num_leaves=15,
                          min_child_samples=30, subsample=0.85, subsample_freq=1,
                          colsample_bytree=0.8, verbose=-1, random_state=SEED)


def propensity(X: pd.DataFrame, offer: pd.Series) -> pd.DataFrame:
    clf = make_pipeline(StandardScaler(),
                        LogisticRegression(max_iter=3000, C=0.5))
    clf.fit(X, offer)
    return pd.DataFrame(clf.predict_proba(X), columns=clf.classes_, index=X.index)


def fit_t_learner(X: pd.DataFrame, y: np.ndarray, offer: pd.Series,
                  trim: float = 0.02) -> dict:
    """Return per-offer CATE matrix plus diagnostics."""
    ps = propensity(X, offer)
    ctrl = (offer == CONTROL).values
    m0 = _outcome_model().fit(X[ctrl], y[ctrl])
    p0 = m0.predict_proba(X)[:, 1]

    cate, ate, support = {}, [], {}
    for k in OFFERS:
        treated = (offer == k).values
        # common support: customers who plausibly could have received offer k
        overlap = (ps[k].values > trim) & (ps[CONTROL].values > trim)
        mk = _outcome_model().fit(X[treated & overlap], y[treated & overlap])
        pk = mk.predict_proba(X)[:, 1]
        cate[k] = np.where(overlap, pk - p0, np.nan)
        support[k] = overlap

        # IPW (Hajek) ATE on the overlap population, k vs control
        w_t = treated & overlap
        w_c = ctrl & overlap
        mu_t = np.sum(y[w_t] / ps[k].values[w_t]) / np.sum(1 / ps[k].values[w_t])
        mu_c = np.sum(y[w_c] / ps[CONTROL].values[w_c]) / np.sum(1 / ps[CONTROL].values[w_c])
        ate.append({
            "offer": k,
            "n_received": int(treated.sum()),
            "raw_churn_rate": float(y[treated].mean()),
            "control_churn_rate": float(y[ctrl].mean()),
            "naive_effect": float(y[treated].mean() - y[ctrl].mean()),
            "ipw_effect": float(mu_t - mu_c),
            "t_learner_mean_effect": float(np.nanmean(cate[k])),
            "share_in_support": float(overlap.mean()),
            "cost": OFFER_COST[k],
        })
    return {"cate": pd.DataFrame(cate, index=X.index), "ate": pd.DataFrame(ate),
            "p_no_offer": p0, "support": support}


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
        # retained = 1 - churn; incremental retained customers
        rt = (1 - y[:k][t[:k]]).sum()
        rc = (1 - y[:k][~t[:k]]).sum()
        q = rt - (rc * nt / nc if nc > 0 else 0.0)
        xs.append(float(frac)); qs.append(float(q))
    return xs, qs
