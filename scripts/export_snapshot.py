"""
Export the API's read-only responses as static JSON for the hosted web app.

The website (Vercel) serves these files directly, so every page loads instantly and
never waits on the API. Only the live features (what-if simulator, CSV scoring,
Gemini copilot, campaigns with custom offer costs) call the running API.

Run from the project root after the pipeline:
    .venv/bin/python scripts/export_snapshot.py
"""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient  # noqa: E402

from backend.app.main import LIST_COLS, app  # noqa: E402
from backend.app.store import store  # noqa: E402

OUT = ROOT / "frontend" / "public" / "snapshot"
BUDGETS = range(1000, 80001, 1000)


def write(rel: str, payload) -> int:
    path = OUT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, separators=(",", ":"))
    path.write_text(text)
    return len(text)


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    c = TestClient(app)
    size = 0
    for name, path in [("summary", "/api/summary"), ("map", "/api/map"), ("model", "/api/model"),
                       ("playbook", "/api/playbook"), ("monitoring", "/api/monitoring"),
                       ("simulate-options", "/api/simulate/options"),
                       ("budget-curve", "/api/campaign/budget-curve?points=10&max_budget=60000")]:
        r = c.get(path)
        r.raise_for_status()
        size += write(f"{name}.json", r.json())

    # Every customer once, for in-browser filtering, sorting and paging.
    rows = c.get("/api/customers", params={"status": "all", "page_size": 500, "page": 1}).json()
    total, everyone, page = rows["total"], [], 1
    while len(everyone) < total:
        everyone += c.get("/api/customers", params={"status": "all", "page_size": 500, "page": page}).json()["rows"]
        page += 1
    size += write("customers.json", {"columns": LIST_COLS, "rows": [[r[k] for k in LIST_COLS] for r in everyone]})

    for cid in store.customers.index:
        size += write(f"customers/{cid}.json", c.get(f"/api/customers/{cid}").json())

    for b in BUDGETS:
        size += write(f"campaign/{b}.json", c.post("/api/campaign", json={"budget": b}).json())

    print(f"Wrote {len(everyone)} customers, {len(BUDGETS)} campaign budgets, {size / 1e6:.1f} MB to {OUT}")


if __name__ == "__main__":
    main()
