import io

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from ml.retention.data import load_raw


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_health(client):
    assert client.get("/api/health").json()["customers"] == 7043


def test_summary_kpis(client):
    s = client.get("/api/summary").json()
    assert 0 < s["churn_rate"] < 1
    assert s["model_auc"] > 0.85
    assert s["value_at_risk"] > 0


def test_customer_list_and_detail(client):
    page = client.get("/api/customers", params={"page_size": 5}).json()
    assert len(page["rows"]) == 5
    cid = page["rows"][0]["customer_id"]
    d = client.get(f"/api/customers/{cid}").json()
    assert d["customer_id"] == cid
    assert "playbook" in d and d["playbook"]["actions"]


def test_unknown_customer_404(client):
    assert client.get("/api/customers/NOPE").status_code == 404


def test_simulate_contract_upgrade_lowers_risk(client):
    rows = client.get("/api/customers", params={"contract": "Month-to-Month",
                                                "risk_band": "High", "page_size": 1}).json()["rows"]
    cid = rows[0]["customer_id"]
    r = client.post("/api/simulate", json={"customer_id": cid,
                                           "changes": {"contract": "Two Year"}}).json()
    assert r["after"]["churn_probability"] < r["before"]["churn_probability"]


def test_simulate_rejects_unknown_field(client):
    rows = client.get("/api/customers", params={"page_size": 1}).json()["rows"]
    r = client.post("/api/simulate", json={"customer_id": rows[0]["customer_id"],
                                           "changes": {"age": 20}})
    assert r.status_code == 400


def test_campaign_uplift_beats_random(client):
    r = client.post("/api/campaign", json={"budget": 15000}).json()
    s = r["strategies"]
    assert s["uplift_optimised"]["spend"] <= 15000
    assert s["uplift_optimised"]["net_value"] >= s["random"]["net_value"]


def test_abtest_sample_size(client):
    r = client.get("/api/abtest", params={"baseline_churn": 0.3, "expected_reduction": 0.05}).json()
    assert 1000 < r["per_arm"] < 1500


def test_batch_score_csv(client):
    raw = load_raw().head(50)
    buf = io.StringIO()
    raw.drop(columns=["churn", "churn_category", "churn_reason", "customer_status",
                      "satisfaction_score", "churn_score", "cltv"]).to_csv(buf, index=False)
    r = client.post("/api/score", files={"file": ("x.csv", buf.getvalue(), "text/csv")}).json()
    assert r["rows"] == 50
    assert r["drift"]["status"] in {"stable", "watch", "drift"}


def test_batch_score_rejects_missing_columns(client):
    r = client.post("/api/score", files={"file": ("x.csv", "a,b\n1,2\n", "text/csv")})
    assert r.status_code == 422
