#!/usr/bin/env bash
# Fetch the IBM Telco Customer Churn 11.1.3 (extended) dataset.
# Source mirror: https://huggingface.co/datasets/aai510-group1/telco-customer-churn
set -euo pipefail
DEST="$(cd "$(dirname "$0")/.." && pwd)/data/raw/hf_ibm_telco"
BASE="https://huggingface.co/datasets/aai510-group1/telco-customer-churn/resolve/main"
mkdir -p "$DEST"
for split in train validation test; do
  curl -fsSL -o "$DEST/$split.csv" "$BASE/$split.csv"
done
echo "Downloaded $(cat "$DEST"/*.csv | wc -l | tr -d ' ') lines to $DEST"
