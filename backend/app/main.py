"""
REST API for the retention platform.

Run (from project root):
    .venv/bin/uvicorn backend.app.main:app --reload --port 8000
Docs at http://localhost:8000/docs
"""
from __future__ import annotations

import io
import json
import math
from typing import Literal, Optional

import numpy as np
import pandas as pd
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from scipy.stats import norm

from backend.app.playbook import PLAYS, PRIORITY_GUIDE, play_for
from backend.app.store import store
from ml.retention import uplift
from ml.retention.data import _snake, load_raw

app = FastAPI(title="Lighthouse API", version="1.0.0",
              description="Churn risk, survival CLV, offer uplift and campaign planning.")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

LIST_COLS = [
    "customer_id", "city", "age", "gender", "contract", "tenure_in_months", "monthly_charge",
    "internet_type", "churn_probability", "risk_band", "confidence", "clv", "value_at_risk",
    "median_months_left", "play", "secondary_play", "best_offer", "offer_net_value", "priority",
    "churn", "split",
]


def _clean(obj):
    """Make numpy / NaN values JSON-safe."""
    if isinstance(obj, dict):
        return {k: _clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_clean(v) for v in obj]
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating, float)):
        return None if math.isnan(obj) or math.isinf(obj) else float(obj)
    if isinstance(obj, np.bool_):
        return bool(obj)
    return obj


def _active(df: pd.DataFrame) -> pd.DataFrame:
    """Customers still on the books at quarter end (the ones we can act on)."""
    return df[df["churn"] == 0]


# ── Overview ───────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok", "customers": len(store.customers)}


@app.get("/api/map")
def customer_map():
    """Every customer as a compact point for the coastline view:
    [id, lat, lng, churn probability, CLV if retained, priority code, churned]."""
    c = store.customers
    codes = {"Save now": 0, "Low-cost save": 1, "Grow": 2, "Maintain": 3}
    pts = [
        [r.customer_id, round(r.latitude, 4), round(r.longitude, 4), round(float(r.churn_probability), 3),
         round(float(r.clv), 0), codes.get(r.priority, 3), int(r.churn)]
        for r in c[["customer_id", "latitude", "longitude", "churn_probability", "clv", "priority", "churn"]]
        .itertuples(index=False)
    ]
    return {"fields": ["id", "lat", "lng", "risk", "clv", "priority", "churned"],
            "priorities": list(codes), "points": pts}


@app.get("/api/summary")
def summary():
    df = store.customers
    rep = store.report
    by_reason = df[df["churn"] == 1]["churn_category"].value_counts().to_dict()
    risk_dist = np.histogram(df["churn_probability"], bins=20, range=(0, 1))[0].tolist()
    by_contract = (df.groupby("contract")
                   .agg(customers=("churn", "size"), churn_rate=("churn", "mean"),
                        avg_risk=("churn_probability", "mean"))
                   .reset_index().to_dict(orient="records"))
    by_tenure = (df.assign(bucket=pd.cut(df["tenure_in_months"], [0, 6, 12, 24, 48, 72],
                                         labels=["0-6", "7-12", "13-24", "25-48", "49-72"]))
                 .groupby("bucket", observed=True)
                 .agg(customers=("churn", "size"), churn_rate=("churn", "mean"))
                 .reset_index().astype({"bucket": str}).to_dict(orient="records"))
    geo = (df.groupby("city").agg(customers=("churn", "size"),
                                  avg_risk=("churn_probability", "mean"),
                                  value_at_risk=("value_at_risk", "sum"),
                                  lat=("latitude", "mean"), lon=("longitude", "mean"))
           .query("customers >= 15").sort_values("value_at_risk", ascending=False)
           .head(40).reset_index().to_dict(orient="records"))
    act = _active(df)
    top_risk = (act.sort_values("value_at_risk", ascending=False).head(8)[LIST_COLS]
                .to_dict(orient="records"))
    return _clean({
        "customers": len(df),
        "active_customers": len(act),
        "active_value_at_risk": float(act["value_at_risk"].sum()),
        "active_priority_counts": act["priority"].value_counts().to_dict(),
        "active_clv": float(act["clv"].sum()),
        "top_at_risk": top_risk,
        "play_counts": act[act["priority"].isin(["Save now", "Low-cost save"])]["play"]
        .value_counts().to_dict(),
        "churn_rate": float(df["churn"].mean()),
        "avg_risk": float(df["churn_probability"].mean()),
        "total_clv": float(df["clv"].sum()),
        "value_at_risk": float(df["value_at_risk"].sum()),
        "monthly_revenue_lost": float(df.loc[df["churn"] == 1, "monthly_charge"].sum()),
        "priority_counts": df["priority"].value_counts().to_dict(),
        "risk_band_counts": df["risk_band"].value_counts().to_dict(),
        "churn_by_reason": by_reason,
        "risk_distribution": risk_dist,
        "by_contract": by_contract,
        "by_tenure": by_tenure,
        "top_cities": geo,
        "model_auc": rep["holdout"]["Calibrated Stack"]["auc"],
        "uplift_targeting_value": rep["economics"]["uplift_targeting_value"],
        "decision_threshold": rep["economics"]["decision_threshold"],
    })


# ── Customers ──────────────────────────────────────────────────────────────────

@app.get("/api/customers")
def list_customers(
    q: Optional[str] = None,
    priority: Optional[str] = None,
    risk_band: Optional[str] = None,
    play: Optional[str] = None,
    contract: Optional[str] = None,
    status: Literal["all", "active", "churned"] = "active",
    sort: str = "value_at_risk",
    desc: bool = True,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=500),
):
    df = store.customers
    if status == "active":
        df = df[df["churn"] == 0]
    elif status == "churned":
        df = df[df["churn"] == 1]
    if q:
        ql = q.lower()
        df = df[df["customer_id"].str.lower().str.contains(ql) | df["city"].str.lower().str.contains(ql)]
    for col, val in (("priority", priority), ("risk_band", risk_band),
                     ("play", play), ("contract", contract)):
        if val:
            df = df[df[col] == val]
    if sort in df.columns:
        df = df.sort_values(sort, ascending=not desc)
    total = len(df)
    page_df = df.iloc[(page - 1) * page_size: page * page_size][LIST_COLS]
    return _clean({"total": total, "page": page, "page_size": page_size,
                   "rows": page_df.to_dict(orient="records")})


@app.get("/api/customers/{customer_id}")
def customer_detail(customer_id: str):
    if customer_id not in store.customers.index:
        raise HTTPException(404, "Customer not found")
    row = store.customers.loc[customer_id]
    rec = row.to_dict()
    rec["top_reasons"] = json.loads(rec["top_reasons"])
    rec["offer_uplift"] = {k: rec.pop(f"uplift_{k[-1].lower()}") for k in uplift.OFFERS}
    rec["playbook"] = play_for(rec["top_reasons"], rec["priority"])
    # peer comparison: churn rate of similar customers (same contract + internet type)
    peers = store.customers[(store.customers["contract"] == row["contract"]) &
                            (store.customers["internet_type"] == row["internet_type"])]
    rec["peer_churn_rate"] = float(peers["churn"].mean())
    rec["peer_count"] = int(len(peers))
    return _clean(rec)


# ── What-if simulator ─────────────────────────────────────────────────────────

class SimulateRequest(BaseModel):
    customer_id: str
    changes: dict = Field(default_factory=dict,
                          description="Raw-schema field → new value, e.g. {'contract': 'One Year'}")


SIMULATABLE = {
    "contract": ["Month-to-Month", "One Year", "Two Year"],
    "premium_tech_support": [0, 1], "online_security": [0, 1], "online_backup": [0, 1],
    "device_protection_plan": [0, 1], "unlimited_data": [0, 1],
    "payment_method": ["Bank Withdrawal", "Credit Card", "Mailed Check"],
    "paperless_billing": [0, 1], "monthly_charge": "number",
    "internet_type": ["Fiber Optic", "DSL", "Cable", "None"],
    "number_of_referrals": "number",
}


@app.get("/api/simulate/options")
def simulate_options():
    return SIMULATABLE


def _raw_row(customer_id: str) -> pd.DataFrame:
    if customer_id not in store.customers.index:
        raise HTTPException(404, "Customer not found")
    raw_cols = [c for c in store.customers.columns if c in _RAW_COLUMNS]
    return store.customers.loc[[customer_id], raw_cols].reset_index(drop=True)


_RAW_COLUMNS: set[str] = set(load_raw().columns)


@app.post("/api/simulate")
def simulate(req: SimulateRequest):
    base = _raw_row(req.customer_id)
    changed = base.copy()
    for k, v in req.changes.items():
        if k not in SIMULATABLE:
            raise HTTPException(400, f"Field '{k}' is not simulatable")
        changed.loc[0, k] = v
    if "internet_type" in req.changes:
        changed.loc[0, "internet_service"] = int(req.changes["internet_type"] != "None")
    scored = store.score_rows(pd.concat([base, changed], ignore_index=True))
    # Anchor to the customer's honest (out-of-fold) score and apply the model's
    # change in log-odds, so "before" always matches the score shown elsewhere.
    honest = float(store.customers.at[req.customer_id, "churn_probability"])
    logit = lambda p: np.log(np.clip(p, 1e-4, 1 - 1e-4) / (1 - np.clip(p, 1e-4, 1 - 1e-4)))
    shift = logit(scored.at[1, "churn_probability"]) - logit(scored.at[0, "churn_probability"])
    scored.at[0, "churn_probability"] = honest
    scored.at[1, "churn_probability"] = float(1 / (1 + np.exp(-(logit(honest) + shift))))
    b, a = scored.iloc[0], scored.iloc[1]
    return _clean({
        "before": {"churn_probability": b.churn_probability, "clv": b.clv,
                   "median_months_left": b.median_months_left, "top_reasons": b.top_reasons},
        "after": {"churn_probability": a.churn_probability, "clv": a.clv,
                  "median_months_left": a.median_months_left, "top_reasons": a.top_reasons},
        "delta_probability": a.churn_probability - b.churn_probability,
        "delta_clv": a.clv - b.clv,
    })


# ── Campaign planner ──────────────────────────────────────────────────────────

class CampaignRequest(BaseModel):
    budget: float = 20000.0
    offer_costs: dict[str, float] = Field(default_factory=lambda: dict(uplift.OFFER_COST))
    min_risk: float = 0.0


def _run_strategy(df: pd.DataFrame, order: pd.Index, offers: pd.Series,
                  costs: dict, budget: float) -> dict:
    spent, picked = 0.0, []
    for cid in order:
        o = offers[cid]
        c = costs.get(o, 0.0)
        if o == "No offer" or spent + c > budget:
            continue
        spent += c
        picked.append(cid)
    sel = df.loc[picked]
    red = np.array([sel.at[cid, f"uplift_{offers[cid][-1].lower()}"] for cid in picked]) \
        if picked else np.array([])
    red = np.nan_to_num(red)
    retained_value = float((red * sel["clv"].values).sum()) if picked else 0.0
    return {"customers": len(picked), "spend": spent,
            "expected_customers_saved": float(red.sum()),
            "expected_value_retained": retained_value,
            "net_value": retained_value - spent,
            "roi": (retained_value - spent) / spent if spent else 0.0,
            "ids": picked}


@app.post("/api/campaign")
def campaign(req: CampaignRequest):
    df = _active(store.customers)
    df = df[df["churn_probability"] >= req.min_risk]
    costs = req.offer_costs

    # recompute best offer under the requested costs
    cate = pd.DataFrame({k: -df[f"uplift_{k[-1].lower()}"] for k in uplift.OFFERS})
    rec = uplift.best_offer(cate, df["clv"].values, costs)
    rec.index = df.index
    smart_order = rec.sort_values("expected_net_value", ascending=False).index
    smart = _run_strategy(df, smart_order, rec["best_offer"], costs, req.budget)

    risk_order = df.sort_values("churn_probability", ascending=False).index
    # Business as usual: each customer gets the offer of their tenure tier
    generic = pd.Series(
        [next((k for k, (lo, hi) in uplift.OFFER_WINDOWS.items() if lo <= t <= hi), "No offer")
         for t in df["tenure_in_months"]], index=df.index)
    by_risk = _run_strategy(df, risk_order, generic, costs, req.budget)

    rng = np.random.default_rng(7)
    rand_order = pd.Index(rng.permutation(df.index.values))
    random = _run_strategy(df, rand_order, generic, costs, req.budget)

    targets = df.loc[smart["ids"][:500]].assign(
        recommended_offer=rec.loc[smart["ids"][:500], "best_offer"],
        expected_net_value=rec.loc[smart["ids"][:500], "expected_net_value"])
    offer_mix = rec.loc[smart["ids"], "best_offer"].value_counts().to_dict()
    for s in (smart, by_risk, random):
        s.pop("ids")
    return _clean({
        "strategies": {"uplift_optimised": smart, "risk_ranked": by_risk, "random": random},
        "strategy_notes": {"uplift_optimised": "Best offer per customer by expected net value (DR uplift × retained CLV − cost)",
                           "risk_ranked": "Highest churn risk first, each given their tenure-tier offer (business as usual)",
                           "random": "Random customers, tenure-tier offer"},
        "offer_mix": offer_mix,
        "targets": targets[["customer_id", "city", "churn_probability", "clv", "play",
                            "recommended_offer", "expected_net_value", "priority"]]
        .to_dict(orient="records"),
    })


@app.get("/api/campaign/budget-curve")
def budget_curve(points: int = 12, max_budget: float = 80000):
    out = []
    for b in np.linspace(max_budget / points, max_budget, points):
        r = campaign(CampaignRequest(budget=float(b)))
        out.append({"budget": float(b),
                    **{k: v["net_value"] for k, v in r["strategies"].items()}})
    return out


# ── A/B test design ───────────────────────────────────────────────────────────

@app.get("/api/abtest")
def ab_test(baseline_churn: float = 0.30, expected_reduction: float = 0.05,
            alpha: float = 0.05, power: float = 0.80):
    p1, p2 = baseline_churn, max(1e-4, baseline_churn - expected_reduction)
    z_a, z_b = norm.ppf(1 - alpha / 2), norm.ppf(power)
    pbar = (p1 + p2) / 2
    n = ((z_a * math.sqrt(2 * pbar * (1 - pbar)) +
          z_b * math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) ** 2) / (p1 - p2) ** 2
    return {"per_arm": int(math.ceil(n)), "total": int(math.ceil(n)) * 2,
            "baseline_churn": p1, "treated_churn": p2, "alpha": alpha, "power": power}


# ── Segments & playbook ───────────────────────────────────────────────────────

@app.get("/api/playbook")
def playbook():
    act = _active(store.customers)
    seg = (act.groupby(["play", "priority"])
           .agg(customers=("customer_id", "size"), avg_risk=("churn_probability", "mean"),
                value_at_risk=("value_at_risk", "sum"), avg_clv=("clv", "mean"))
           .reset_index())
    churned = store.customers[store.customers["churn"] == 1]
    top_reasons = (churned.groupby("churn_category")["churn_reason"]
                   .agg(lambda s: s.value_counts().head(3).to_dict()).to_dict())
    plays = {k: {kk: vv for kk, vv in v.items() if kk != "drivers"} for k, v in PLAYS.items()}
    return _clean({"plays": plays, "priority_guide": PRIORITY_GUIDE,
                   "segments": seg.to_dict(orient="records"),
                   "historic_reasons": top_reasons,
                   "reason_model": store.report["reason_model"]})


# ── Model lab ──────────────────────────────────────────────────────────────────

@app.get("/api/model")
def model_report():
    rep = dict(store.report)
    rep.pop("fold_metrics", None)
    return _clean(rep)


# ── Batch scoring + drift ─────────────────────────────────────────────────────

@app.post("/api/score")
async def score_csv(file: UploadFile = File(...)):
    content = await file.read()
    try:
        df = pd.read_csv(io.BytesIO(content))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"Could not parse CSV: {e}")
    df.columns = [_snake(c) for c in df.columns]
    missing = sorted(_RAW_COLUMNS - set(df.columns) - {
        "churn", "churn_category", "churn_reason", "customer_status", "satisfaction_score",
        "churn_score", "cltv"})
    if missing:
        raise HTTPException(422, {"message": "Missing required columns", "missing": missing})
    for col in ("churn_category", "churn_reason"):
        if col not in df.columns:
            df[col] = ""
    if "offer" not in df.columns:
        df["offer"] = None
    scored = store.score_rows(df)
    drift = store.drift(df)
    flagged = {k: v for k, v in sorted(drift.items(), key=lambda kv: -kv[1]) if v > 0.1}
    return _clean({"rows": len(scored),
                   "summary": {"avg_risk": float(scored["churn_probability"].mean()),
                               "value_at_risk": float(scored["value_at_risk"].sum()),
                               "high_risk": int((scored["churn_probability"] >= 0.5).sum())},
                   "drift": {"psi": drift, "flagged": flagged,
                             "status": "drift" if any(v > 0.25 for v in drift.values())
                             else "watch" if flagged else "stable"},
                   "scored": scored.head(1000).to_dict(orient="records")})


@app.get("/api/monitoring")
def monitoring():
    """Holdout vs training-period drift and score stability (reference snapshot)."""
    df = store.customers
    hold = df[df["split"] == "holdout"]
    drift = store.drift(hold.drop(columns=[c for c in hold.columns if c not in _RAW_COLUMNS]))
    top = dict(sorted(drift.items(), key=lambda kv: -kv[1])[:15])
    return _clean({"psi_top": top,
                   "score_mean_train": float(df.loc[df["split"] == "train_oof", "churn_probability"].mean()),
                   "score_mean_holdout": float(hold["churn_probability"].mean()),
                   "model_version": "1.0.0",
                   "holdout": store.report["holdout"]["Calibrated Stack"]})


# ── AI copilot ────────────────────────────────────────────────────────────────

from backend.app.ai import router as ai_router  # noqa: E402

app.include_router(ai_router)
