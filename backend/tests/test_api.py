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


def test_ai_status_reports_configuration(client):
    r = client.get("/api/ai/status").json()
    assert "configured" in r and r["model"]


def test_ai_chat_without_key_returns_503(client, monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    r = client.post("/api/ai/chat", json={"message": "hello"})
    assert r.status_code == 503


def test_ai_tools_return_grounded_data():
    from backend.app import ai
    assert ai.get_portfolio_summary()["active_customers"] > 0
    found = ai.search_customers(priority="Save now", limit=3)
    assert found["total_matching"] > 0 and len(found["customers"]) == 3
    cid = found["customers"][0]["customer_id"]
    assert ai.get_customer(cid)["customer_id"] == cid
    assert "uplift_optimised" in ai.plan_campaign(10000)["strategies"]
    assert len(ai.get_offer_evidence()["offers"]) == 5


def test_customer_map_points(client):
    m = client.get("/api/map").json()
    assert len(m["points"]) == 7043
    cid, lat, lng, risk, clv, pri, churned = m["points"][0]
    assert 32 < lat < 42.5 and -124.5 < lng < -114
    assert 0 <= risk <= 1 and pri in range(4) and churned in (0, 1)


def test_ai_guard_caps_requests_per_visitor(monkeypatch):
    from fastapi import HTTPException
    from starlette.requests import Request
    from backend.app import ai
    monkeypatch.setitem(ai.LIMITS, "per_visitor_hour", 2)
    ai._hits.clear()
    req = Request({"type": "http", "headers": [(b"x-forwarded-for", b"9.9.9.9")], "client": ("1.1.1.1", 1)})
    ai._guard(req)
    ai._guard(req)
    with pytest.raises(HTTPException) as e:
        ai._guard(req)
    assert e.value.status_code == 429
    ai._hits.clear()
