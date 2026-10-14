import asyncio
import os
from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest
from app.application.run_service import RunService
from app.config import Settings
from app.main import create_app
from app.persistence.database import create_async_engine, create_session_factory
from app.persistence.models import AgentRun, AgentRunEvent, Event, EventExtraction, IdempotencyKey
from app.streaming.sse import format_sse
from fastapi.testclient import TestClient
from sqlalchemy import delete, update


def test_openapi_exposes_two_step_run_contract_without_cancel_endpoint() -> None:
    document = create_app(Settings(environment="test")).openapi()
    paths = set(document["paths"])

    assert {
        "/api/v1/events/{event_id}/runs",
        "/api/v1/runs/{run_id}",
        "/api/v1/runs/{run_id}/stream",
    } <= paths
    assert "/api/v1/runs/{run_id}/cancel" not in paths
    assert "/api/agent/run" not in paths


def test_run_database_routes_return_typed_unavailable_error() -> None:
    run_id = "11111111-1111-1111-1111-111111111111"
    with TestClient(create_app(Settings(environment="test", database_url=None))) as client:
        create_response = client.post(f"/api/v1/events/{run_id}/runs")
        stream_response = client.get(f"/api/v1/runs/{run_id}/stream")

    assert create_response.status_code == 503
    assert create_response.json()["error"]["code"] == "database_unavailable"
    assert stream_response.status_code == 503
    assert stream_response.json()["error"]["code"] == "database_unavailable"


def _settings() -> Settings:
    database_url = os.getenv("RIPPLE_DATABASE_URL")
    if not database_url:
        pytest.skip("set RIPPLE_DATABASE_URL for PostgreSQL API integration fixtures")
    return Settings(environment="test", database_url=database_url)


def _correction_payload() -> dict[str, object]:
    excerpt = "vendor ETA for A-12 is now day 6"
    return {
        "expected_extraction_version": 0,
        "extraction": {
            "nature": "disruption",
            "cause": "vendor delay",
            "job_ids": ["A-12"],
            "objective": "Restore A-12 readiness",
            "requested_start": 6,
            "eta_updates": [
                {
                    "job_id": "A-12",
                    "stage": "function_test",
                    "eta_earliest": 6,
                    "eta_latest": 6,
                    "source_excerpt": excerpt,
                }
            ],
            "hard_constraints": [],
            "soft_preferences": [],
            "risk_tags": [],
            "levers_ruled_out": [],
            "missing_info": [],
            "source_excerpt": excerpt,
        },
    }


def _publish_and_finish(run_id: UUID) -> None:
    async def publish() -> None:
        database_url = os.environ["RIPPLE_DATABASE_URL"]
        engine = create_async_engine(database_url)
        factory = create_session_factory(engine)
        async with factory() as session:
            service = RunService(session)
            await service.publish_event(
                "A-12-base",
                run_id,
                "step",
                {
                    "summary": "Readiness checked.",
                    "chain_of_thought": "must never be public",
                },
                phase="investigation",
                internal_payload={"prompt": "hidden prompt", "chain_of_thought": "hidden"},
            )
            await service.finish(
                "A-12-base",
                run_id,
                state="completed",
                summary="Run completed.",
            )
        await engine.dispose()

    asyncio.run(publish())


def _force_timeout(run_id: UUID) -> None:
    async def timeout() -> None:
        database_url = os.environ["RIPPLE_DATABASE_URL"]
        engine = create_async_engine(database_url)
        factory = create_session_factory(engine)
        async with factory() as session:
            await session.execute(
                update(AgentRun)
                .where(AgentRun.id == run_id)
                .values(
                    timeout_at=datetime.now(UTC) - timedelta(seconds=1),
                    started_at=datetime.now(UTC) - timedelta(seconds=61),
                )
            )
            await session.commit()
        await engine.dispose()

    asyncio.run(timeout())


def _cleanup_event(event_id: UUID, run_ids: tuple[UUID, ...]) -> None:
    async def cleanup() -> None:
        database_url = os.environ["RIPPLE_DATABASE_URL"]
        engine = create_async_engine(database_url)
        factory = create_session_factory(engine)
        async with factory() as session:
            if run_ids:
                await session.execute(
                    delete(AgentRunEvent).where(AgentRunEvent.run_id.in_(run_ids))
                )
                await session.execute(delete(AgentRun).where(AgentRun.id.in_(run_ids)))
                await session.execute(
                    delete(IdempotencyKey).where(
                        IdempotencyKey.route_scope.like(f"events/{event_id}/runs")
                    )
                )
            await session.execute(
                delete(EventExtraction).where(EventExtraction.event_id == event_id)
            )
            await session.execute(delete(Event).where(Event.id == event_id))
            await session.commit()
        await engine.dispose()

    asyncio.run(cleanup())


@pytest.mark.skipif(
    not os.getenv("RIPPLE_DATABASE_URL"),
    reason="set RIPPLE_DATABASE_URL for PostgreSQL API integration fixtures",
)
def test_run_creation_is_idempotent_and_stream_replays_without_duplicates() -> None:
    event_id: UUID | None = None
    run_ids: list[UUID] = []
    try:
        with TestClient(create_app(_settings())) as client:
            created = client.post(
                "/api/v1/events",
                json={"raw_text": "The vendor ETA for A-12 is now day 6."},
            )
            assert created.status_code == 201
            event_id = UUID(created.json()["id"])
            corrected = client.patch(
                f"/api/v1/events/{event_id}/extraction",
                json=_correction_payload(),
            )
            assert corrected.status_code == 200

            first = client.post(
                f"/api/v1/events/{event_id}/runs",
                headers={"Idempotency-Key": "run-test-key"},
            )
            duplicate = client.post(
                f"/api/v1/events/{event_id}/runs",
                headers={"Idempotency-Key": "run-test-key"},
            )
            assert first.status_code == 201
            assert duplicate.status_code == 200
            run_id = UUID(first.json()["run_id"])
            run_ids.append(run_id)
            assert duplicate.json()["run_id"] == str(run_id)

            _publish_and_finish(run_id)
            replay = client.get(
                f"/api/v1/runs/{run_id}/stream", params={"after": 1}
            )
            reconnect = client.get(
                f"/api/v1/runs/{run_id}/stream",
                headers={"Last-Event-ID": "1"},
            )
            detail = client.get(f"/api/v1/runs/{run_id}")

        assert replay.status_code == 200
        assert replay.headers["content-type"].startswith("text/event-stream")
        assert "id: 1\n" not in replay.text
        assert replay.text.count("id: 2\n") == 1
        assert replay.text.count("id: 3\n") == 1
        assert "chain_of_thought" not in replay.text
        assert "hidden prompt" not in replay.text
        assert reconnect.text == replay.text
        assert detail.status_code == 200
        assert detail.json()["state"] == "completed"
        assert [event["seq"] for event in detail.json()["events"]] == [1, 2, 3]
        assert "chain_of_thought" not in detail.text
    finally:
        if event_id is not None:
            _cleanup_event(event_id, tuple(run_ids))


@pytest.mark.skipif(
    not os.getenv("RIPPLE_DATABASE_URL"),
    reason="set RIPPLE_DATABASE_URL for PostgreSQL API integration fixtures",
)
def test_stream_hard_timeout_persists_error_and_done() -> None:
    event_id: UUID | None = None
    run_ids: list[UUID] = []
    try:
        with TestClient(create_app(_settings())) as client:
            created = client.post(
                "/api/v1/events", json={"raw_text": "The vendor ETA for A-12 is now day 6."}
            )
            assert created.status_code == 201
            event_id = UUID(created.json()["id"])
            assert (
                client.patch(
                    f"/api/v1/events/{event_id}/extraction", json=_correction_payload()
                ).status_code
                == 200
            )
            created_run = client.post(
                f"/api/v1/events/{event_id}/runs",
                headers={"Idempotency-Key": "timeout-test-key"},
            )
            assert created_run.status_code == 201
            run_id = UUID(created_run.json()["run_id"])
            run_ids.append(run_id)

            _force_timeout(run_id)
            stream = client.get(f"/api/v1/runs/{run_id}/stream")
            detail = client.get(f"/api/v1/runs/{run_id}")

        assert stream.status_code == 200
        assert "event: error" in stream.text
        assert "agent_timeout" in stream.text
        assert "event: done" in stream.text
        assert detail.json()["state"] == "timed_out"
    finally:
        if event_id is not None:
            _cleanup_event(event_id, tuple(run_ids))


def test_heartbeat_frame_has_no_audit_sequence() -> None:
    frame = format_sse(
        run_id=UUID("11111111-1111-1111-1111-111111111111"),
        sequence=None,
        event_type="heartbeat",
        timestamp=datetime(2026, 10, 13, 12, tzinfo=UTC),
        phase=None,
        public={"summary": "stream heartbeat"},
    )

    assert "event: heartbeat" in frame
    assert "id:" not in frame
    assert '"seq":null' in frame
