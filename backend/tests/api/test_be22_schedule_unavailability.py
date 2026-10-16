import os

import pytest
from app.config import Settings
from app.main import create_app
from fastapi.testclient import TestClient

pytestmark = pytest.mark.skipif(
    not os.getenv("RIPPLE_DATABASE_URL"),
    reason="set RIPPLE_DATABASE_URL for PostgreSQL schedule interval tests",
)


def test_schedule_exposes_clipped_scenario_intervals_and_group_scope() -> None:
    settings = Settings(environment="local", database_url=os.environ["RIPPLE_DATABASE_URL"])
    with TestClient(create_app(settings)) as client:
        a12 = client.get("/api/v1/schedule")
        full = client.get("/api/v1/schedule", headers={"X-Scenario-ID": "fleet-scale"})
        clipped = client.get(
            "/api/v1/schedule",
            headers={"X-Scenario-ID": "fleet-scale"},
            params={"from": 4, "to": 4},
        )
        barge = client.get(
            "/api/v1/schedule",
            headers={"X-Scenario-ID": "fleet-scale"},
            params={"groups": "barge"},
        )

    assert a12.status_code == 200
    assert a12.json()["unavailability"] == []
    assert full.status_code == 200
    full_body = full.json()
    intervals = {item["id"]: item for item in full_body["unavailability"]}
    assert set(intervals) == {"FS-UNAV-001", "FS-UNAV-002"}
    assert {item["kind"] for item in intervals.values()} == {"maintenance", "unavailable"}
    assert {item["resource_id"] for item in intervals.values()} == {
        item["resource_id"] for item in full_body["unavailability"]
    }
    assert "FS-RES-18" in {resource["id"] for resource in full_body["resources"]}

    assert clipped.status_code == 200
    clipped_intervals = clipped.json()["unavailability"]
    assert clipped_intervals == [
        {
            **intervals["FS-UNAV-001"],
            "start_day": 4,
            "end_day": 4,
        }
    ]

    assert barge.status_code == 200
    barge_body = barge.json()
    barge_resource_ids = {resource["id"] for resource in barge_body["resources"]}
    assert barge_resource_ids
    assert {item["resource_id"] for item in barge_body["unavailability"]} <= barge_resource_ids
    assert {item["id"] for item in barge_body["unavailability"]} == {"FS-UNAV-001"}


def test_schedule_rejects_inverted_inclusive_range() -> None:
    settings = Settings(environment="local", database_url=os.environ["RIPPLE_DATABASE_URL"])
    with TestClient(create_app(settings)) as client:
        response = client.get(
            "/api/v1/schedule",
            headers={"X-Scenario-ID": "fleet-scale"},
            params={"from": 5, "to": 4},
        )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_openapi_declares_typed_unavailability_collection() -> None:
    settings = Settings(environment="local", database_url=os.environ["RIPPLE_DATABASE_URL"])
    with TestClient(create_app(settings)) as client:
        document = client.get("/openapi.json").json()

    schema = document["components"]["schemas"]["ScheduleResponse"]
    unavailability = schema["properties"]["unavailability"]
    assert unavailability["type"] == "array"
    item_schema = document["components"]["schemas"]["UnavailabilityResponse"]
    assert item_schema["properties"]["kind"]["enum"] == ["maintenance", "unavailable"]
