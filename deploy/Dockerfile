# Lighthouse: API (FastAPI) and web app (Next.js) in one container.
# Build from the repository root: docker build -f deploy/Dockerfile -t lighthouse .
# The image ships the validated model artifacts (the exact scores in the report and
# pitch) and downloads the dataset the API reads. With no artifacts present it
# retrains every model from source instead.

# ── Web app ────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# Empty API URL: the browser calls same-origin /api/*, proxied to the API below.
ENV NEXT_PUBLIC_API_URL="" \
    API_PROXY_URL="http://127.0.0.1:8000" \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── Runtime ────────────────────────────────────────────────────────────────────
FROM python:3.11-slim-bookworm
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl libgomp1 ca-certificates \
 && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

# Hugging Face Spaces runs containers as uid 1000.
RUN useradd -m -u 1000 app
WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY ml/ ml/
COPY backend/ backend/
COPY scripts/ scripts/
COPY artifacts/ artifacts/
RUN mkdir -p data \
 && bash scripts/download_data.sh \
 && if [ ! -f artifacts/model.joblib ]; then python -m ml.retention.pipeline; fi \
 && rm -rf catboost_info

COPY --from=web /web/.next/standalone ./web
COPY --from=web /web/.next/static ./web/.next/static
COPY deploy/start.sh ./start.sh
RUN chmod +x start.sh && chown -R app:app /app

USER app
ENV PORT=7860 HOSTNAME=0.0.0.0 PYTHONUNBUFFERED=1
EXPOSE 7860
CMD ["./start.sh"]
