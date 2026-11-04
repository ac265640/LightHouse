# Lighthouse

**Retention intelligence that tells you who will leave, when, why, and which offer will actually keep them.**

Built for DataNova 2026 Global Data-thon, problem statement **DN-BU-01: Customer Churn Prediction and Retention Strategy**.

## Quick start

```bash
python3.11 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
./scripts/download_data.sh
python -m ml.retention.pipeline        # trains models, writes artifacts/
uvicorn backend.app.main:app --port 8000   # API docs at http://localhost:8000/docs
pytest -q ml/tests backend/tests
```

Full documentation is in progress.
