import numpy as np
import pandas as pd
import pytest

from ml.retention import data, models, survival, uplift, insights


@pytest.fixture(scope="module")
def customers():
    return data.engineer(data.clean(data.load_raw()))


@pytest.fixture(scope="module")
def X(customers):
    return data.to_model_matrix(customers)


def test_raw_schema(customers):
    assert len(customers) == data.EXPECTED_ROWS
    assert customers["customer_id"].is_unique
    assert set(customers["churn"].unique()) == {0, 1}


def test_no_leakage_columns_in_features(X):
    for col in data.LEAKAGE_COLS + ["cltv", "offer", "customer_id", "churn"]:
        assert col not in X.columns


def test_feature_matrix_numeric_and_complete(X):
    assert X.isna().sum().sum() == 0
    assert all(np.issubdtype(t, np.number) for t in X.dtypes)


def test_schema_alignment_fills_missing_columns(customers, X):
    one = data.to_model_matrix(customers.head(1), columns=list(X.columns))
    assert list(one.columns) == list(X.columns)


def test_satisfaction_score_is_flagged_as_leak(customers):
    audit = data.leakage_audit(customers).set_index("column")
    assert audit.loc["satisfaction_score", "single_feature_auc"] > 0.9
    assert audit.loc["satisfaction_score", "excluded"]


def test_ece_perfect_calibration_is_zero():
    p = np.array([0.0, 0.0, 1.0, 1.0])
    y = np.array([0, 0, 1, 1])
    assert models.expected_calibration_error(y, p) == pytest.approx(0.0)


def test_top_decile_lift_random_is_about_one():
    rng = np.random.default_rng(0)
    y = rng.integers(0, 2, 5000)
    assert models.top_decile_lift(y, rng.random(5000)) == pytest.approx(1.0, abs=0.15)


def test_conformal_sets_cover_at_target_rate():
    rng = np.random.default_rng(1)
    p = rng.random(4000)
    y = (rng.random(4000) < p).astype(int)
    thr = models.conformal_thresholds(y[:2000], p[:2000], alpha=0.1)
    sets = models.conformal_sets(p[2000:], thr)
    yt = y[2000:]
    covered = np.where(sets == "Uncertain", True,
                       np.where(sets == "Will churn", yt == 1, yt == 0))
    assert covered.mean() >= 0.88


def test_survival_clv_monotone_in_survival():
    charge = np.array([100.0, 100.0])
    s = np.vstack([np.full(60, 0.9), np.full(60, 0.5)])
    clv = survival.survival_clv(charge, s)
    assert clv[0] > clv[1] > 0


def test_months_to_churn_risk():
    s = np.vstack([np.linspace(1, 0, 60), np.ones(60)])
    m = survival.months_to_churn_risk(s)
    assert m[0] < 60 and m[1] == 60


def test_best_offer_picks_no_offer_when_unprofitable():
    cate = pd.DataFrame({"Offer A": [0.05, -0.5]})  # first customer: offer increases churn
    rec = uplift.best_offer(cate, np.array([1000.0, 1000.0]), {"Offer A": 60.0})
    assert rec.loc[0, "best_offer"] == "No offer"
    assert rec.loc[1, "best_offer"] == "Offer A"
    assert rec.loc[1, "expected_net_value"] == pytest.approx(440.0)


def test_psi_zero_for_identical_distribution(X):
    base = insights.drift_baseline(X)
    vals = insights.psi(base, X)
    assert max(vals.values()) < 0.01


def test_psi_detects_shift(X):
    base = insights.drift_baseline(X)
    shifted = X.copy()
    shifted["monthly_charge"] = shifted["monthly_charge"] * 1.8
    assert insights.psi(base, shifted)["monthly_charge"] > 0.25


def test_retained_clv_at_least_expected_clv():
    charge = np.array([80.0])
    s = np.linspace(0.9, 0.2, 60)[None, :]
    assert survival.clv_if_retained(charge, s)[0] >= survival.survival_clv(charge, s)[0]


def test_left_truncated_baseline_matches_observed_quarter_churn(customers, X):
    """With delayed entry, implied quarterly churn should track the observed rate."""
    sdf = survival.survival_frame(X, customers)
    cph = survival.fit_cox(sdf)
    q = survival.churn_within(survival.conditional_survival(cph, sdf))
    assert abs(q.mean() - customers["churn"].mean()) < 0.10
    new = customers["tenure_in_months"].values <= 6
    assert q[new].mean() > q[~new].mean()
