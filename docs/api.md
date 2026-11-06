# API reference

The Lighthouse API is a FastAPI service (`backend/app/main.py` and `backend/app/ai.py`). Run it locally with:

```bash
uvicorn backend.app.main:app --port 8000
```

Interactive OpenAPI docs are served at `/docs`:
- locally: http://localhost:8000/docs
- live: https://lighthouse-api-9f2b.onrender.com/docs

All responses are JSON. Money is in USD and probabilities are calibrated (0 to 1).

## Portfolio

| Method | Endpoint | Returns |
|---|---|---|
| GET | `/api/health` | `{"status": "ok", "customers": 7043}` |
| GET | `/api/summary` | KPIs, priority counts, churn by contract, tenure and reason, risk distribution, top cities, the call list |
| GET | `/api/map` | Every customer as `[id, lat, lng, risk, clv, priority, churned]` for the map view |

## Customers

| Method | Endpoint | Returns |
|---|---|---|
| GET | `/api/customers` | A filtered, sorted page of customers |
| GET | `/api/customers/{customer_id}` | Full profile: risk band, confidence, CLV, months left, SHAP drivers, recommended play, per-offer uplift, peer churn rate |

**Query parameters for `/api/customers`:**

| Parameter | Default | Values |
|---|---|---|
| `q` | — | Text matched against customer ID or city |
| `priority` | — | `Save now`, `Low-cost save`, `Grow`, `Maintain` |
| `risk_band` | — | `Critical`, `High`, `Medium`, `Low` |
| `play` | — | A play name, e.g. `Contract lock-in` |
| `contract` | — | `Month-to-Month`, `One Year`, `Two Year` |
| `status` | `active` | `active`, `churned`, `all` |
| `sort` | `value_at_risk` | Any listed column |
| `desc` | `true` | `true`, `false` |
| `page`, `page_size` | `1`, `25` | `page_size` up to 500 |

## What-if simulator

| Method | Endpoint | Returns |
|---|---|---|
| GET | `/api/simulate/options` | The fields that can be changed and their allowed values |
| POST | `/api/simulate` | The customer's risk, CLV and drivers before and after the change |

```bash
curl -X POST localhost:8000/api/simulate \
  -H 'Content-Type: application/json' \
  -d '{"customer_id": "5285-MVEHD", "changes": {"contract": "Two Year"}}'
```

The "before" score is the customer's honest out-of-sample score. The "after" score applies the model's change in log-odds on top of it, so the two always line up.

## Campaigns

| Method | Endpoint | Returns |
|---|---|---|
| POST | `/api/campaign` | Three strategies (Lighthouse targeting, business as usual, random), the offer mix and up to 500 targets |
| GET | `/api/campaign/budget-curve` | Net value of each strategy across budgets (`points`, `max_budget`) |
| GET | `/api/abtest` | Sample size per arm (`baseline_churn`, `expected_reduction`, `alpha`, `power`) |

```bash
curl -X POST localhost:8000/api/campaign \
  -H 'Content-Type: application/json' \
  -d '{"budget": 15000, "offer_costs": {"Offer A": 60, "Offer B": 45, "Offer C": 35, "Offer D": 25, "Offer E": 15}}'
```

## Insight and quality

| Method | Endpoint | Returns |
|---|---|---|
| GET | `/api/playbook` | The seven plays, priority guide, segment sizes and historic exit reasons |
| GET | `/api/model` | The full validation report: leaderboard, holdout metrics, calibration curve, conformal, survival, uplift, fairness |
| GET | `/api/monitoring` | Feature drift (PSI) of the holdout against training |

## Scoring new customers

| Method | Endpoint | Returns |
|---|---|---|
| POST | `/api/score` | Scores for an uploaded CSV in the IBM raw schema, with a drift check |

```bash
curl -X POST localhost:8000/api/score -F "file=@new_customers.csv"
```

A file missing required columns returns `422` and lists the missing ones.

## AI copilot

These endpoints need `GEMINI_API_KEY`. Without it they return `503` and every other endpoint still works.

| Method | Endpoint | Returns |
|---|---|---|
| GET | `/api/ai/status` | Whether AI is configured, the model and the usage limits |
| POST | `/api/ai/chat` | An answer and the tool calls behind it. Body: `{"message": "...", "history": [...]}` |
| POST | `/api/ai/message` | A personalised retention email. Body: `{"customer_id": "...", "channel": "email"}` |
| POST | `/api/ai/brief` | A one-page executive retention brief |

**Usage limits** keep a public demo inside Gemini's free quota. Each can be overridden with an environment variable:

| Limit | Default | Variable |
|---|---|---|
| Per visitor per hour | 12 | `AI_LIMIT_PER_VISITOR_HOUR` |
| Whole service per minute | 6 | `AI_LIMIT_PER_MINUTE` |
| Whole service per day | 150 | `AI_LIMIT_PER_DAY` |

Requests over a limit return `429` with a plain-language message.
