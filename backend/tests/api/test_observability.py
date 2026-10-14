import asyncio
import io
import json
import logging
from pathlib import Path
from typing import Any, cast

import httpx
import pytest
from app.config import Settings
from app.main import create_app
from app.observability.logging import JsonFormatter, RedactionFilter
from app.persistence.database import create_async_engine
from fastapi.testclient import TestClient


def test_json_logs_exclude_raw_source_and_prompt_fields() -> None:
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.addFilter(RedactionFilter())
    handler.setFormatter(JsonFormatter())
    logger = logging.getLogger("observability-test")
    logger.handlers = [handler]
    logger.propagate = False
    try:
        logger.info(
            "diagnostic",
            extra={
                "source_text": "private vendor message",
                "span_attributes": {"prompt": "hidden system prompt", "safe": "ok"},
            },
        )
    finally:
        logger.handlers = []
        logger.propagate = True

    payload = json.loads(stream.getvalue())
    assert "private vendor message" not in stream.getvalue()
    assert "hidden system prompt" not in stream.getvalue()
    assert payload["message"] == "diagnostic"


def test_diagnostics_reports_solver_and_metrics_without_dependency_query() -> None:
    app = create_app(Settings(environment="test", database_url=None))

    with TestClient(app) as client:
        response = client.get("/api/v1/health/diagnostics")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["database"] == {"configured": False, "healthy": None}
    assert body["solver"]["status"] == "ok"
    assert "counters" in body["metrics"]


def test_database_engine_uses_small_cloud_run_pool_defaults() -> None:
    engine = create_async_engine("postgresql+asyncpg://postgres:admin@localhost:55432/ripple")
    try:
        pool = cast(Any, engine.sync_engine.pool)
        assert pool.size() == 5
        assert pool._max_overflow == 3  # noqa: SLF001
        assert pool._timeout == 3.0  # noqa: SLF001
    finally:
        asyncio.run(engine.dispose())


def test_eight_recorded_streams_complete_concurrently(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MOCK_MODEL_MODE", "full")
    app = create_app(Settings(environment="test", database_url=None))

    async def load_streams() -> list[httpx.Response]:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await asyncio.gather(
                *[
                    client.get(
                        "/api/v1/demo/scenarios/A-12-base/runs/"
                        f"{index:08d}-0000-0000-0000-000000000000/stream"
                    )
                    for index in range(1, 9)
                ]
            )

    responses = asyncio.run(load_streams())

    assert len(responses) == 8
    assert all(response.status_code == 200 for response in responses)
    assert all(response.text.count("event: done") == 1 for response in responses)
    assert all(response.text.count("event: plan") == 1 for response in responses)


def test_container_documents_cloud_run_limits() -> None:
    dockerfile = Path("Dockerfile").read_text(encoding="utf-8")
    cloud_run = Path("deploy/cloud-run.yaml").read_text(encoding="utf-8")

    assert "--limit-concurrency 8" in dockerfile
    assert "--timeout-keep-alive 90" in dockerfile
    assert "containerConcurrency: 8" in cloud_run
    assert "timeoutSeconds: 90" in cloud_run
