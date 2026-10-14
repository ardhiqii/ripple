FROM python:3.12-slim

# uv keeps the image reproducible from the committed lockfile.
COPY --from=ghcr.io/astral-sh/uv:0.6.14 /uv /uvx /bin/

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY app ./app
COPY migrations ./migrations
COPY seed ./seed
COPY scripts/start_preview.sh ./scripts/start_preview.sh
COPY alembic.ini ./
RUN chmod +x ./scripts/start_preview.sh

ENV PORT=8080 \
    RIPPLE_CLOUD_RUN_CONCURRENCY=8 \
    RIPPLE_CLOUD_RUN_TIMEOUT_SECONDS=90 \
    RIPPLE_DB_POOL_SIZE=5 \
    RIPPLE_DB_MAX_OVERFLOW=3 \
    RIPPLE_DB_STATEMENT_TIMEOUT_SECONDS=3 \
    RIPPLE_SOLVER_MAX_WORKERS=1

EXPOSE 8080

# Cloud Run: concurrency 8 and request timeout 90s; the agent hard limit is 60s.
CMD ["sh", "-c", "exec /app/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1 --timeout-keep-alive 90 --limit-concurrency 8"]
