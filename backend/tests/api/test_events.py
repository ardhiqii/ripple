import os
from uuid import UUID

import pytest
from app.application.event_service import event_lifecycle
from app.config import Settings
from app.main import create_app
from app.persistence.database import create_async_engine, create_session_factory
from app.persistence.models import Event, EventExtraction
from fastapi.testclient import TestClient
from sqlalchemy import delete

EVENT_PATHS = {
    "/api/v1/events",
    "/api/v1/events/{event_id}",
    "/api/v1/events/{event_id}/extraction",
    "/api/v1/events/{event_id}/extract",
}


def test_openapi_exposes_text_only_event_contract() -> None:
    document = create_app(Settings(environment="test")).openapi()
    paths = set(document["paths"])

    assert EVENT_PATHS <= paths
    create_schema = document["components"]["schemas"]["CreateEventRequest"]
    assert "raw_text" in create_schema["properties"]
    assert "file" not in create_schema["properties"]
    assert "file_object_ref" not in create_schema["properties"]


def test_event_database_routes_return_typed_unavailable_error() -> None:
    with TestClient(create_app(Settings(environment="test", database_url=None))) as client:
        response = client.post("/api/v1/events", json={"raw_text": "vendor update"})

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "database_unavailable"


def _settings() -> Settings:
    database_url = os.getenv("RIPPLE_DATABASE_URL")
    if not database_url:
        pytest.skip("set RIPPLE_DATABASE_URL for PostgreSQL API integration fixtures")
    return Settings(environment="test", database_url=database_url)


@pytest.mark.parametrize(
    ("event_state", "run_state", "plan_status", "expected"),
    [
        ("received", None, None, "draft"),
        ("planning", None, None, "reading_input"),
        ("clarification_needed", None, None, "needs_clarification"),
        ("extracted", None, None, "ready_to_investigate"),
        ("extracted", "running", None, "investigating"),
        ("closed", "completed", None, "investigating"),
        ("extracted", "failed", "proposed", "options_ready"),
        ("extracted", "failed", "approved", "approved"),
        ("closed", None, None, "integrity_error"),
        ("extracted", "unknown", None, "integrity_error"),
        ("extracted", None, "unknown", "integrity_error"),
    ],
)
def test_event_lifecycle_uses_frozen_precedence(
    event_state: str,
    run_state: str | None,
    plan_status: str | None,
    expected: str,
) -> None:
    assert event_lifecycle(event_state, run_state, plan_status) == expected


@pytest.mark.skipif(
    not os.getenv("RIPPLE_DATABASE_URL"),
    reason="set RIPPLE_DATABASE_URL for PostgreSQL API integration fixtures",
)
def test_event_read_model_counts_links_and_scenario_lifecycle() -> None:
    settings = Settings(environment="local", database_url=os.environ["RIPPLE_DATABASE_URL"])
    headers = {"X-Scenario-ID": "fleet-scale"}
    with TestClient(create_app(settings)) as client:
        first = client.get("/api/v1/events", headers=headers, params={"limit": 3})
        second = client.get(
            "/api/v1/events",
            headers=headers,
            params={"limit": 3, "after": first.json()["next_cursor"]},
        )
        filtered = client.get(
            "/api/v1/events",
            headers=headers,
            params={"q": "alpha-16", "limit": 1},
        )
        job_filtered = client.get(
            "/api/v1/events",
            headers=headers,
            params={"job_id": "FS-JOB-017", "limit": 10},
        )

    first_body = first.json()
    second_body = second.json()
    assert first.status_code == 200
    assert first_body["total_count"] == 25
    assert len(first_body["events"]) == 3
    assert sum(first_body["scenario_lifecycle_counts"].values()) == 25
    assert first_body["events"][0]["latest_plan_status"] in {None, "proposed", "approved"}
    assert {"job_ids", "latest_run_id", "latest_plan_id"} <= set(first_body["events"][0])
    assert second.status_code == 200
    assert second_body["total_count"] == 25
    assert not {
        event["id"] for event in first_body["events"]
    }.intersection(event["id"] for event in second_body["events"])
    assert filtered.status_code == 200
    assert filtered.json()["total_count"] == 1
    assert filtered.json()["scenario_lifecycle_counts"] == first_body[
        "scenario_lifecycle_counts"
    ]
    assert job_filtered.status_code == 200
    assert job_filtered.json()["total_count"] >= 1
    assert all("FS-JOB-017" in event["job_ids"] for event in job_filtered.json()["events"])


def _extraction_payload() -> dict[str, object]:
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


def _cleanup_event(event_id: UUID) -> None:
    async def cleanup() -> None:
        database_url = os.environ["RIPPLE_DATABASE_URL"]
        engine = create_async_engine(database_url)
        factory = create_session_factory(engine)
        async with factory() as session:
            await session.execute(
                delete(EventExtraction).where(EventExtraction.event_id == event_id)
            )
            await session.execute(delete(Event).where(Event.id == event_id))
            await session.commit()
        await engine.dispose()

    import asyncio

    asyncio.run(cleanup())


@pytest.mark.skipif(
    not os.getenv("RIPPLE_DATABASE_URL"),
    reason="set RIPPLE_DATABASE_URL for PostgreSQL API integration fixtures",
)
def test_event_correction_is_immutable_and_requires_expected_version(
    caplog: pytest.LogCaptureFixture,
) -> None:
    settings = _settings()
    raw_text = "The vendor ETA for A-12 is now day 6."
    event_id: UUID | None = None
    try:
        with TestClient(create_app(settings)) as client:
            created = client.post(
                "/api/v1/events",
                json={"raw_text": raw_text, "nature": "disruption"},
            )
            assert created.status_code == 201
            event_id = UUID(created.json()["id"])
            assert created.json()["extraction_version"] == 0
            listed = client.get(
                "/api/v1/events", params={"q": "vendor ETA for A-12", "limit": 1}
            )

            corrected = client.patch(
                f"/api/v1/events/{event_id}/extraction",
                json=_extraction_payload(),
            )
            stale = client.patch(
                f"/api/v1/events/{event_id}/extraction",
                json=_extraction_payload(),
            )
            detail = client.get(f"/api/v1/events/{event_id}")
            deleted = client.delete(f"/api/v1/events/{event_id}")

        assert corrected.status_code == 200
        assert listed.status_code == 200
        assert [item["id"] for item in listed.json()["events"]] == [str(event_id)]
        assert corrected.json()["event"]["extraction_version"] == 1
        assert corrected.json()["event"]["state"] == "extracted"
        assert len(corrected.json()["extractions"]) == 1
        assert stale.status_code == 409
        assert stale.json()["error"]["code"] == "version_conflict"
        assert detail.status_code == 200
        assert len(detail.json()["extractions"]) == 1
        assert deleted.status_code == 409
        assert deleted.json()["error"]["code"] == "event_not_draft"
        assert raw_text not in caplog.text
    finally:
        if event_id is not None:
            _cleanup_event(event_id)


@pytest.mark.skipif(
    not os.getenv("RIPPLE_DATABASE_URL"),
    reason="set RIPPLE_DATABASE_URL for PostgreSQL API integration fixtures",
)
def test_extraction_start_is_state_gated_and_draft_can_be_deleted() -> None:
    settings = _settings()
    event_id: UUID | None = None
    try:
        with TestClient(create_app(settings)) as client:
            created = client.post(
                "/api/v1/events", json={"raw_text": "Investigate A-12 readiness"}
            )
            assert created.status_code == 201
            event_id = UUID(created.json()["id"])

            started = client.post(f"/api/v1/events/{event_id}/extract")
            repeated = client.post(f"/api/v1/events/{event_id}/extract")
            correction = client.patch(
                f"/api/v1/events/{event_id}/extraction",
                json=_extraction_payload(),
            )

        assert started.status_code == 200
        assert started.json()["state"] == "planning"
        assert repeated.status_code == 409
        assert repeated.json()["error"]["code"] == "extraction_in_progress"
        assert correction.status_code == 409
        assert correction.json()["error"]["code"] == "invalid_state_transition"
    finally:
        if event_id is not None:
            _cleanup_event(event_id)
