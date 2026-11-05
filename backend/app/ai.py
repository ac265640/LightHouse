"""
Generative AI layer (Google Gemini).

The copilot never answers from the language model's memory: it is given a set
of tools that call Lighthouse's own analytics, and must ground every number in
a tool result. Each response returns the tool calls it made so the UI can show
its working.

Configure with environment variables (or backend/.env):
    GEMINI_API_KEY=...
    GEMINI_MODEL=gemini-2.5-flash      # optional
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

router = APIRouter(prefix="/api/ai", tags=["ai"])

SYSTEM = """You are Lighthouse Copilot, a retention analyst for a California telecom company.
You help account managers and executives decide which customers to save, why they are at risk,
and which offers to use.

Rules:
- Use the tools for every number you state. Never invent customers, figures or metrics.
- Money is USD. Churn probabilities are calibrated: 0.30 means about 30 in 100 such customers churn.
- "CLV" means survival-based customer lifetime value if retained (60-month horizon, 60% margin).
- Offer effects are observational causal estimates within tenure tiers; say so when recommending offers,
  and suggest an A/B test for confirmation.
- Be concise and decision-oriented. Use short paragraphs or bullet points and end with a clear next action.
- When you mention a customer, include their customer ID."""


def _client():
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        raise HTTPException(503, "AI is not configured. Set GEMINI_API_KEY in backend/.env and restart the API.")
    from google import genai
    return genai.Client(api_key=key)


def _model() -> str:
    return os.getenv("GEMINI_MODEL", "gemini-2.5-flash")


# ── Tools (thin wrappers over the analytics API) ──────────────────────────────

def get_portfolio_summary() -> dict:
    """Portfolio KPIs: customer counts, churn rate, value at risk, priority segment sizes,
    churn by contract and tenure, and historic exit reasons."""
    from backend.app import main
    s = main.summary()
    keep = ["customers", "active_customers", "churn_rate", "avg_risk", "active_value_at_risk",
            "active_clv", "active_priority_counts", "play_counts", "churn_by_reason",
            "by_contract", "by_tenure", "model_auc", "uplift_targeting_value"]
    out = {k: s[k] for k in keep}
    out["top_cities_by_value_at_risk"] = [
        {k: c[k] for k in ("city", "customers", "avg_risk", "value_at_risk")} for c in s["top_cities"][:8]]
    return out


def search_customers(priority: Optional[str] = None, risk_band: Optional[str] = None,
                     play: Optional[str] = None, contract: Optional[str] = None,
                     city: Optional[str] = None, sort_by: str = "value_at_risk",
                     limit: int = 10) -> dict:
    """Find active customers. priority: 'Save now' | 'Low-cost save' | 'Grow' | 'Maintain'.
    risk_band: 'Critical' | 'High' | 'Medium' | 'Low'. play: e.g. 'Contract lock-in',
    'Community & referral', 'Value reframe', 'Early-life onboarding', 'Service quality'.
    contract: 'Month-to-Month' | 'One Year' | 'Two Year'. city: city name.
    sort_by: 'value_at_risk' | 'churn_probability' | 'clv'. Returns total count and top rows."""
    from backend.app import main
    r = main.list_customers(q=city, priority=priority, risk_band=risk_band, play=play,
                            contract=contract, status="active", sort=sort_by, desc=True,
                            page=1, page_size=max(1, min(limit, 25)))
    cols = ["customer_id", "city", "contract", "tenure_in_months", "monthly_charge",
            "churn_probability", "clv", "value_at_risk", "median_months_left", "play",
            "best_offer", "priority"]
    return {"total_matching": r["total"], "customers": [{k: row[k] for k in cols} for row in r["rows"]]}


def get_customer(customer_id: str) -> dict:
    """Full profile for one customer: risk, CLV, months left, SHAP churn drivers,
    recommended play, per-offer uplift and best offer."""
    from backend.app import main
    d = main.customer_detail(customer_id)
    keep = ["customer_id", "city", "age", "contract", "tenure_in_months", "monthly_charge",
            "internet_type", "payment_method", "number_of_referrals", "churn_probability",
            "risk_band", "confidence", "clv", "value_at_risk", "median_months_left", "priority",
            "best_offer", "offer_net_value", "offer_uplift", "top_reasons", "playbook",
            "peer_churn_rate", "churn"]
    return {k: d.get(k) for k in keep}


def plan_campaign(budget: float) -> dict:
    """Optimise a retention campaign for a budget in USD. Compares Lighthouse uplift
    targeting with business-as-usual (tier offers to highest-risk) and random outreach."""
    from backend.app import main
    r = main.campaign(main.CampaignRequest(budget=float(budget)))
    return {"strategies": r["strategies"], "strategy_notes": r["strategy_notes"],
            "offer_mix": r["offer_mix"], "top_targets": r["targets"][:10]}


def get_offer_evidence() -> dict:
    """Causal evidence for each retention offer: naive vs within-tier doubly-robust
    effect on churn with 95% CI, tenure window and cost."""
    from backend.app.store import store
    offers = []
    for o in store.report["uplift"]["offers"]:
        o = dict(o)
        eff, lo, hi = o["dr_effect"], o["dr_ci_low"], o["dr_ci_high"]
        direction = "raises" if eff > 0 else "lowers"
        certainty = "statistically significant" if lo > 0 or hi < 0 else "not statistically significant (CI crosses 0)"
        o["reading"] = f"Associated with a churn change of {eff * 100:+.1f} pts: it {direction} churn; {certainty}."
        offers.append(o)
    return {"offers": offers, "method": store.report["uplift"]["method"],
            "sign_convention": "dr_effect is the change in churn probability. Positive = MORE churn (harmful), "
                               "negative = LESS churn (helpful)."}


def get_model_quality() -> dict:
    """Model validation: CV leaderboard, holdout metrics, calibration, conformal coverage,
    survival model quality, leakage audit and fairness audit."""
    from backend.app.store import store
    r = store.report
    return {
        "leaderboard": [{k: m[k] for k in ("model", "auc_mean", "auc_std", "pr_auc_mean", "brier_mean")}
                        for m in r["leaderboard"]],
        "holdout": r["holdout"]["Calibrated Stack"],
        "conformal": r["conformal"],
        "survival": {k: r["survival"][k] for k in ("c_index_holdout", "quarter_churn_auc_holdout", "design")},
        "leakage": {"leaky_auc": r["leakage"]["leaky_auc"],
                    "excluded": [a["column"] for a in r["leakage"]["audit"]]},
        "fairness": r["fairness"],
        "top_drivers": [g["label"] for g in r["global_importance"][:8]],
    }


TOOLS = [get_portfolio_summary, search_customers, get_customer, plan_campaign,
         get_offer_evidence, get_model_quality]


def _run(prompt: str, history: list[dict] | None = None, tools: bool = True) -> dict:
    from google.genai import types

    client = _client()
    contents = []
    for turn in history or []:
        role = "model" if turn.get("role") == "assistant" else "user"
        contents.append(types.Content(role=role, parts=[types.Part(text=turn["content"])]))
    contents.append(types.Content(role="user", parts=[types.Part(text=prompt)]))

    config = types.GenerateContentConfig(
        system_instruction=SYSTEM,
        temperature=0.3,
        tools=TOOLS if tools else None,
        automatic_function_calling=types.AutomaticFunctionCallingConfig(maximum_remote_calls=8),
    )
    try:
        resp = client.models.generate_content(model=_model(), contents=contents, config=config)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"Gemini request failed: {e}")

    calls = []
    for c in resp.automatic_function_calling_history or []:
        for p in c.parts or []:
            if getattr(p, "function_call", None):
                calls.append({"tool": p.function_call.name, "args": dict(p.function_call.args or {})})
    return {"answer": resp.text or "", "tool_calls": calls, "model": _model()}


# ── Usage guard ────────────────────────────────────────────────────────────────
# A public demo must never run up a bill: every Gemini call passes this budget,
# kept well inside Gemini's free-tier quotas. Limits reset on their own windows.

import threading
import time
from collections import defaultdict, deque

LIMITS = {
    "per_visitor_hour": int(os.getenv("AI_LIMIT_PER_VISITOR_HOUR", "12")),
    "global_minute": int(os.getenv("AI_LIMIT_PER_MINUTE", "6")),
    "global_day": int(os.getenv("AI_LIMIT_PER_DAY", "150")),
}
_hits: dict[str, deque] = defaultdict(deque)
_lock = threading.Lock()


def _visitor(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    return fwd.split(",")[0].strip() or (request.client.host if request.client else "unknown")


def _guard(request: Request) -> None:
    now = time.time()
    keys = [(f"v:{_visitor(request)}", 3600, LIMITS["per_visitor_hour"],
             "You've reached this demo's hourly limit for AI answers. Please try again later."),
            ("g:minute", 60, LIMITS["global_minute"],
             "The copilot is busy right now. Please try again in a minute."),
            ("g:day", 86400, LIMITS["global_day"],
             "Today's AI budget for this demo is used up. Every analytics page still works.")]
    with _lock:
        for key, window, cap, msg in keys:
            q = _hits[key]
            while q and now - q[0] > window:
                q.popleft()
            if len(q) >= cap:
                raise HTTPException(429, msg)
        for key, *_ in keys:
            _hits[key].append(now)


# ── Endpoints ──────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    history: list[dict] = []


@router.get("/status")
def status():
    return {"configured": bool(os.getenv("GEMINI_API_KEY")), "model": _model(), "limits": LIMITS}


@router.post("/chat")
def chat(req: ChatRequest, request: Request):
    _client()
    _guard(request)
    return _run(req.message[:2000], req.history[-10:])


class MessageRequest(BaseModel):
    customer_id: str
    channel: str = "email"


@router.post("/message")
def retention_message(req: MessageRequest, request: Request):
    _client()
    profile = get_customer(req.customer_id)
    _guard(request)
    prompt = (
        f"Write a short, warm, personalised retention {req.channel} to this customer from their account "
        "manager. Address the specific drivers of their risk without mentioning churn, risk scores or models. "
        "Offer the recommended play's first action and, if a best offer exists, mention it as a loyalty "
        "benefit. Include a subject line. Max 140 words. Sign off as 'Your account team'.\n"
        "Never use the customer ID as a name (open with 'Hi there'), never leave placeholders such as "
        "[Company Name], and never show internal offer codes like 'Offer B': describe the offer in plain "
        "words (e.g. 'a loyalty discount on your plan').\n\n"
        f"Customer data:\n{json.dumps(profile, default=str)}"
    )
    r = _run(prompt, tools=False)
    return {"message": r["answer"], "model": r["model"]}


@router.post("/brief")
def executive_brief(request: Request):
    _client()
    _guard(request)
    prompt = ("Write a one-page executive retention brief for the leadership team. Use the tools to get the "
              "portfolio summary, the campaign plan for a $15,000 budget, the offer evidence and model quality. "
              "Structure: Headline (one sentence), Situation (3 bullets with numbers), Where the money is "
              "(2-3 bullets), Recommendation (3 numbered actions), Confidence & caveats (2 bullets).")
    return _run(prompt)
