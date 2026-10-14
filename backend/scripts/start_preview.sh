#!/bin/sh
set -eu

# Preview runs a single instance, so applying idempotent Alembic migrations at
# startup is safe and avoids relying on paid one-off jobs or an interactive shell.
/app/.venv/bin/alembic upgrade head
/app/.venv/bin/python /app/scripts/seed_preview.py

exec /app/.venv/bin/uvicorn app.main:app \
  --host 0.0.0.0 \
  --port "${PORT:-10000}" \
  --workers 1 \
  --timeout-keep-alive 90 \
  --limit-concurrency "${RIPPLE_CLOUD_RUN_CONCURRENCY:-8}"
