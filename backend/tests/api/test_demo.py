import os

import pytest
from app.application.demo_service import DemoService
from app.application.errors import ApplicationError
from app.config import Settings
from app.main import create_app
from fastapi.testclient import TestClient


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


def test_recorded_fixture_and_production_guard(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MOCK_MODEL_MODE", "recorded")
    fixture = DemoService().recorded_fixture("A-12-base")
    assert fixture.prompt_version == "intake-v1"
    assert fixture.events[-1].type == "done"

    with pytest.raises(ApplicationError, match="disabled in production"):
        DemoService().mode(environment="production")


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
