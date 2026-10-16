import os

import pytest
from app.config import Settings
from app.main import create_app
from fastapi.testclient import TestClient


def test_openapi_exposes_be07_resources() -> None:
    document = create_app(Settings(environment="test")).openapi()
    paths = set(document["paths"])

    assert {
        "/api/v1/schedule",
        "/api/v1/schedule/changes",
        "/api/v1/policy/levers",
        "/api/v1/policy/profiles",
        "/api/v1/policy/data-health",
        "/api/v1/readiness",
        "/api/v1/readiness/{item_id}",
        "/api/v1/readiness/suggestions/{suggestion_id}/accept",
        "/api/v1/readiness/suggestions/{suggestion_id}/reject",
    } <= paths


def test_policy_reads_do_not_require_database() -> None:
    with TestClient(create_app(Settings(environment="test"))) as client:
        levers = client.get("/api/v1/policy/levers")
        profiles = client.get("/api/v1/policy/profiles")

    assert levers.status_code == 200
    assert {item["name"] for item in levers.json()["levers"]} >= {
        "expedite_vendor_test",
        "move_cargo",
        "move_locked_job",
    }
    assert profiles.status_code == 200
    assert profiles.json()["default_profile"] == "production_first"


def test_database_required_routes_return_typed_unavailable_error() -> None:
    with TestClient(create_app(Settings(environment="test", database_url=None))) as client:
        response = client.get("/api/v1/readiness")

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "database_unavailable"


@pytest.mark.skipif(
    not os.getenv("RIPPLE_DATABASE_URL"),
    reason="set RIPPLE_DATABASE_URL for PostgreSQL API integration fixtures",
)
def test_schedule_and_readiness_reads_use_scenario_and_derived_fields() -> None:
    settings = Settings(environment="test", database_url=os.environ["RIPPLE_DATABASE_URL"])
    with TestClient(create_app(settings)) as client:
        schedule = client.get("/api/v1/schedule", params={"from": 3, "to": 6})
        readiness = client.get("/api/v1/readiness", params={"job_id": "A-12"})
        detail = client.get("/api/v1/readiness/A-12-function-test")

    assert schedule.status_code == 200
    assert schedule.json()["version"] >= 1
    assert [job["id"] for job in schedule.json()["jobs"]] == ["C-03"]
    assert readiness.status_code == 200
    assert len(readiness.json()["items"]) == 4
    assert "slack" in readiness.json()["items"][0]
    assert detail.status_code == 200
    assert detail.json()["source"]["source_type"] == "vendor_email"
    assert "history" in detail.json()


@pytest.mark.skipif(
    not os.getenv("RIPPLE_DATABASE_URL"),
    reason="set RIPPLE_DATABASE_URL for PostgreSQL API integration fixtures",
)
def test_readiness_server_search_count_and_scenario_summary() -> None:
    settings = Settings(environment="local", database_url=os.environ["RIPPLE_DATABASE_URL"])
    headers = {"X-Scenario-ID": "fleet-scale"}
    with TestClient(create_app(settings)) as client:
        unfiltered = client.get("/api/v1/readiness", headers=headers)
        searched = client.get(
            "/api/v1/readiness",
            headers=headers,
            params={"q": "stale source", "source_type": "erp"},
        )
        source_filtered = client.get(
            "/api/v1/readiness",
            headers=headers,
            params={"source_type": "erp"},
        )
        job_filtered = client.get(
            "/api/v1/readiness",
            headers=headers,
            params={"job_id": "FS-JOB-017"},
        )

    assert unfiltered.status_code == 200
    assert searched.status_code == 200
    searched_body = searched.json()
    assert searched_body["total_count"] == 1
    assert searched_body["summary"]["total"] == 32
    assert searched_body["items"][0]["source_type"] == "erp"
    assert searched_body["items"][0]["source_reference"].startswith("stale source")
    assert source_filtered.status_code == 200
    assert source_filtered.json()["total_count"] == 16
    assert source_filtered.json()["summary"]["total"] == 32
    assert job_filtered.status_code == 200
    assert 0 < job_filtered.json()["total_count"] < unfiltered.json()["total_count"]
    assert job_filtered.json()["summary"] == unfiltered.json()["summary"]


@pytest.mark.skipif(
    not os.getenv("RIPPLE_DATABASE_URL"),
    reason="set RIPPLE_DATABASE_URL for PostgreSQL API integration fixtures",
)
def test_readiness_row_version_conflict_preserves_optimistic_state() -> None:
    settings = Settings(environment="test", database_url=os.environ["RIPPLE_DATABASE_URL"])
    with TestClient(create_app(settings)) as client:
        before = client.get("/api/v1/readiness/A-12-function-test")
        before_item = before.json()["item"]
        response = client.patch(
            "/api/v1/readiness/A-12-function-test",
            json={"status": "ready", "expected_row_version": before_item["row_version"] + 1},
        )
        after = client.get("/api/v1/readiness/A-12-function-test")

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "version_conflict"
    assert response.json()["error"]["details"]["current_row_version"] == before_item[
        "row_version"
    ]
    assert after.status_code == 200
    assert after.json()["item"]["row_version"] == before_item["row_version"]
    assert after.json()["item"]["status"] == before_item["status"]
