#!/usr/bin/env bash
# Rebuild the static data snapshot and deploy the web app to Vercel (Hobby plan).
# Usage: deploy/deploy_web.sh [api-url]   (default: the Render API)
set -euo pipefail
API_URL="${1:-https://lighthouse-api-9f2b.onrender.com}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

"$ROOT/.venv/bin/python" "$ROOT/scripts/export_snapshot.py"
cd "$ROOT/frontend"
NEXT_PUBLIC_SNAPSHOT=1 NEXT_PUBLIC_API_URL="$API_URL" NEXT_TELEMETRY_DISABLED=1 \
  npx --yes vercel@65.11.0 build --prod --yes
# One archive keeps the 7,000+ snapshot files inside the free plan's upload limit.
npx --yes vercel@65.11.0 deploy --prebuilt --prod --yes --archive=tgz
