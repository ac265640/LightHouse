#!/usr/bin/env bash
# Publish the committed source to a Hugging Face Docker Space.
# Usage: deploy/deploy_space.sh <hf-username>/<space-name>
set -euo pipefail
SPACE="${1:?usage: deploy/deploy_space.sh <user>/<space>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGE="$(mktemp -d)"
git -C "$ROOT" archive HEAD | tar -x -C "$STAGE"
rm -rf "$STAGE/presentation" "$STAGE/.taste-skill"
cp "$ROOT/deploy/space-README.md" "$STAGE/README.md"
# Ship the validated models so the live scores match the report exactly.
cp "$ROOT"/artifacts/model.joblib "$ROOT"/artifacts/customers_scored.parquet "$STAGE/artifacts/"
hf repo create "$SPACE" --repo-type space --space_sdk docker --exist-ok >/dev/null
hf upload "$SPACE" "$STAGE" . --repo-type space --commit-message "Deploy $(git -C "$ROOT" rev-parse --short HEAD)"
rm -rf "$STAGE"
echo "Deployed to https://huggingface.co/spaces/$SPACE"
