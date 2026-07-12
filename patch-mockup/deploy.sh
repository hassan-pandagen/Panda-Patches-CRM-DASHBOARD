#!/usr/bin/env bash
# Redeploy on the VPS: pull latest code, rebuild, restart. Run from the repo root.
set -euo pipefail

if [ ! -f .env ]; then
  echo "Missing .env — copy .env.example to .env and fill in secrets first." >&2
  exit 1
fi

git pull --ff-only
docker compose up -d --build
docker compose ps
echo "--- last 50 log lines (ctrl-C to stop tailing; containers keep running) ---"
docker compose logs -f --tail=50
