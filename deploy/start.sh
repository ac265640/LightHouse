#!/usr/bin/env bash
# Start the API on 127.0.0.1:8000, wait until it answers, then serve the web app on $PORT.
set -euo pipefail

python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 &
API_PID=$!

for _ in $(seq 1 90); do
  curl -fs http://127.0.0.1:8000/api/health >/dev/null && break
  sleep 1
done

node web/server.js &
WEB_PID=$!

# Exit if either process stops, so the platform restarts the container.
wait -n "$API_PID" "$WEB_PID"
exit $?
