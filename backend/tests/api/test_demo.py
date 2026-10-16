import asyncio
import os

import pytest
from app.application.demo_service import DemoService
from app.application.errors import ApplicationError
from app.config import Settings
from app.main import create_app
from app.persistence.database import create_async_engine, create_session_factory
from app.persistence.models import Job, ScheduleState
from fastapi.testclient import TestClient
from sqlalchemy import select, update


def test_demo_contract_and_live_metadata(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("MOCK_MODEL_MODE", raising=False)
    with TestClient(create_app(Settings(environment="test", database_url=None))) as client:
        document = client.get("/openapi.json")
        scenarios = client.get("/api/v1/demo/scenarios")
        reset = client.post(
            "/api/v1/demo/reset",
            json={"scenario_id": "A-12-base"},
        )

    assert {
        "/api/v1/demo/reset",
        "/api/v1/demo/scenarios",
        "/api/v1/demo/scenarios/{scenario_id}/runs/{run_id}/stream",
    } <= set(document.json()["paths"])
    assert scenarios.status_code == 200
    assert scenarios.json()["mode"] == "live"
    assert scenarios.json()["scenarios"][0]["seed_version"] == "offshore-a12-v1"
    assert reset.status_code == 503
    assert reset.json()["error"]["code"] == "database_unavailable"


def test_full_fixture_stream_uses_public_run_event_contract(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("MOCK_MODEL_MODE", "full")
    run_id = "11111111-1111-1111-1111-111111111111"
    with TestClient(create_app(Settings(environment="test", database_url=None))) as client:
        response = client.get(f"/api/v1/demo/scenarios/A-12-base/runs/{run_id}/stream")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert response.text.count("event: run_started") == 1
    assert response.text.count("event: plan") == 1
    assert response.text.count("event: done") == 1
    assert response.text.count(f'"run_id":"{run_id}"') == 4


def test_scenario_metadata_and_header_allowlist(monkeypatch: pytest.MonkeyPatch) -> None:
    with TestClient(create_app(Settings(environment="local", database_url=None))) as client:
        scenarios = client.get("/api/v1/demo/scenarios").json()["scenarios"]
        unknown = client.get(
            "/api/v1/demo/scenarios",
            headers={"X-Scenario-ID": "not-allowlisted"},
        )
        blank = client.get("/api/v1/demo/scenarios", headers={"X-Scenario-ID": " "})

    assert [scenario["scenario_id"] for scenario in scenarios] == ["A-12-base", "fleet-scale"]
    assert scenarios[0]["scenario_start_date"] == "2026-10-13"
    assert scenarios[0]["reset_allowed"] is True
    assert scenarios[1]["seed_version"] == "fleet-scale-v1"
    assert scenarios[1]["reset_allowed"] is True
    assert unknown.status_code == 404
    assert unknown.json()["error"]["code"] == "unknown_scenario"
    assert blank.status_code == 404
    assert blank.json()["error"]["code"] == "unknown_scenario"

    with TestClient(create_app(Settings(environment="test", database_url=None))) as client:
        hidden = client.get(
            "/api/v1/demo/scenarios",
            headers={"X-Scenario-ID": "fleet-scale"},
        )
    assert hidden.status_code == 404


def test_recorded_fixture_and_production_guard(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MOCK_MODEL_MODE", "recorded")
    fixture = DemoService().recorded_fixture("A-12-base")
    assert fixture.prompt_version == "intake-v1"
    assert fixture.events[-1].type == "done"

    with pytest.raises(ApplicationError, match="disabled in production"):
        DemoService().mode(environment="production")


def test_reset_rejects_body_scenario_that_differs_from_request_context() -> None:
    with pytest.raises(ApplicationError, match="must match the active scenario context"):
        asyncio.run(
            DemoService().reset(
                "A-12-base",
                environment="local",
                demo_scenario_id="A-12-base",
                request_scenario_id="fleet-scale",
            )
        )


@pytest.mark.skipif(
    not os.getenv("RIPPLE_DATABASE_URL"),
    reason="set RIPPLE_DATABASE_URL for PostgreSQL API integration fixtures",
)
def test_fleet_reset_restores_only_selected_scenario() -> None:
    settings = Settings(environment="local", database_url=os.environ["RIPPLE_DATABASE_URL"])

    async def mutate_fleet() -> None:
        engine = create_async_engine(settings.database_url or "")
        factory = create_session_factory(engine)
        async with factory() as session:
            async with session.begin():
                await session.execute(
                    update(Job)
                    .where(Job.scenario_id == "fleet-scale")
                    .values(row_version=2)
                )
        await engine.dispose()

    asyncio.run(mutate_fleet())
    with TestClient(create_app(settings)) as client:
        reset = client.post(
            "/api/v1/demo/reset",
            headers={"X-Scenario-ID": "fleet-scale"},
            json={"scenario_id": "fleet-scale"},
        )
        fleet_schedule = client.get(
            "/api/v1/schedule", headers={"X-Scenario-ID": "fleet-scale"}
        )
        a12_schedule = client.get("/api/v1/schedule")

    assert reset.status_code == 200
    assert reset.json()["seed_version"] == "fleet-scale-v1"
    assert fleet_schedule.status_code == 200
    assert fleet_schedule.json()["version"] == 1
    assert len(fleet_schedule.json()["jobs"]) == 40
    assert a12_schedule.status_code == 200
    assert a12_schedule.json()["version"] == 1
    assert [job["id"] for job in a12_schedule.json()["jobs"]] == [
        "C-03",
        "B-05",
        "A-12",
        "D-07",
        "E-02",
    ]


@pytest.mark.skipif(
    not os.getenv("RIPPLE_DATABASE_URL"),
    reason="set RIPPLE_DATABASE_URL for PostgreSQL API integration fixtures",
)
def test_failed_fleet_reset_rolls_back(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(environment="local", database_url=os.environ["RIPPLE_DATABASE_URL"])

    async def reset_with_failure() -> None:
        engine = create_async_engine(settings.database_url or "")
        factory = create_session_factory(engine)
        async with factory() as session:
            with pytest.raises(RuntimeError, match="seed install failed"):
                await DemoService(session).reset(
                    "fleet-scale",
                    environment="local",
                    demo_scenario_id="A-12-base",
                )
        async with factory() as session:
            state = await session.scalar(
                select(ScheduleState).where(ScheduleState.scenario_id == "fleet-scale")
            )
            assert state is not None
            assert state.version == 1
            job_count = await session.scalar(
                select(Job.id).where(Job.scenario_id == "fleet-scale").limit(1)
            )
            assert job_count is not None
        await engine.dispose()

    async def fail_install(_connection: object) -> None:
        raise RuntimeError("seed install failed")

    monkeypatch.setattr("app.application.demo_service.install_fleet_scale", fail_install)
    asyncio.run(reset_with_failure())


@pytest.mark.skipif(
    not os.getenv("RIPPLE_DATABASE_URL"),
    reason="set RIPPLE_DATABASE_URL for PostgreSQL API integration fixtures",
)
def test_demo_reset_is_stable_and_restores_seed() -> None:
    settings = Settings(environment="test", database_url=os.environ["RIPPLE_DATABASE_URL"])
    with TestClient(create_app(settings)) as client:
        first = client.post("/api/v1/demo/reset", json={"scenario_id": "A-12-base"})
        second = client.post("/api/v1/demo/reset", json={"scenario_id": "A-12-base"})
        schedule = client.get("/api/v1/schedule")

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["seed_checksum"] == second.json()["seed_checksum"]
    assert first.json()["schedule_version"] == 1
    assert schedule.status_code == 200
    assert schedule.json()["version"] == 1
    assert [job["id"] for job in schedule.json()["jobs"]] == [
        "C-03",
        "B-05",
        "A-12",
        "D-07",
        "E-02",
    ]
