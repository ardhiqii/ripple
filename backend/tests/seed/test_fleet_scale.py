import asyncio
import os
from typing import Any

import pytest
from app.persistence.database import create_async_engine
from app.persistence.models import Job, Resource, ScheduleState
from scripts.seed_preview import install_fleet_scale, reset_fleet_scale, verify_fleet_scale
from seed.fleet_scale import SCENARIO_ID, build_rows, manifest
from sqlalchemy import select, update

pytestmark = pytest.mark.skipif(
    not os.getenv("RIPPLE_DATABASE_URL"),
    reason="set RIPPLE_DATABASE_URL for PostgreSQL seed tests",
)


def test_fleet_scale_manifest_is_deterministic_and_within_target_ranges() -> None:
    first = manifest()
    second = manifest()
    rows = build_rows()

    assert first == second
    assert first["counts"]["resources"] == 18
    assert first["counts"]["resource_unavailability"] == 2
    assert 16 <= first["counts"]["resources"] <= 24
    assert 35 <= first["counts"]["jobs"] <= 50
    assert 60 <= first["counts"]["bookings"] <= 100
    assert 25 <= first["counts"]["readiness_items"] <= 40
    assert 20 <= first["counts"]["events"] <= 30
    assert first["audited_chain_count"] >= 6
    assert {row["state"] for row in rows["events"]} == {
        "received",
        "extracted",
        "clarification_needed",
        "planning",
        "closed",
    }
    assert any(row["metadata"]["empty_fixture"] for row in rows["resources"])
    assert {row["kind"] for row in rows["resource_unavailability"]} == {
        "maintenance",
        "unavailable",
    }
    assert len({row["resource_id"] for row in rows["resource_unavailability"]}) == 2
    assert any(
        booking["resource_id"] == interval["resource_id"]
        and booking["start_day"] <= interval["end_day"]
        and interval["start_day"] <= booking["end_day"]
        for booking in rows["bookings"]
        for interval in rows["resource_unavailability"]
    )
    assert any(row["capacity"] < 100 for row in rows["resources"])
    assert any(row["capacity"] > 100 for row in rows["resources"])
    assert any(row["locked"] for row in rows["jobs"])
    assert any(
        row["source_reference"].startswith("stale source") for row in rows["readiness_items"]
    )
    assert any(row["eta_earliest_day"] != row["eta_latest_day"] for row in rows["readiness_items"])
    assert all(
        isinstance(row["changes"], list)
        and row["changes"]
        and row["changes"][0]["kind"] == "move_job"
        for row in rows["plan_options"]
    )


def test_plan_lifecycle_fixture_never_recommends_infeasible_option() -> None:
    rows = build_rows()
    options_by_plan = {row["plan_id"]: row for row in rows["plan_options"]}

    for plan in rows["plans"]:
        option = options_by_plan[plan["id"]]
        if plan["status"] == "rejected":
            assert plan["recommended_option_id"] is None
            assert option["solver_status"] == "infeasible"
            assert option["violations"]["items"]
            assert option["is_recommended"] is False
        else:
            assert plan["recommended_option_id"] == option["id"]
            assert option["solver_status"] == "feasible"
            assert option["violations"]["items"] == []
            assert option["is_recommended"] is True

    assert len(rows["plan_evidence"]) >= 6

    plan_event_ids = {row["event_id"] for row in rows["plans"]}
    extraction_event_ids = {row["event_id"] for row in rows["event_extractions"]}
    run_event_ids = {row["event_id"] for row in rows["agent_runs"]}
    plan_ids = {row["plan_id"] for row in rows["plan_evidence"]}
    option_plan_ids = {row["plan_id"] for row in rows["plan_options"]}
    assert len(plan_event_ids & extraction_event_ids & run_event_ids) >= 6
    assert len(plan_ids & option_plan_ids) >= 6


def test_install_twice_and_reset_preserves_a12_scenario() -> None:
    database_url = os.environ["RIPPLE_DATABASE_URL"]

    async def scenario() -> None:
        engine = create_async_engine(database_url)
        try:
            async with engine.begin() as connection:
                await reset_fleet_scale(connection)
                await install_fleet_scale(connection)
                first = await verify_fleet_scale(connection)
                assert sum(value > 0 for value in first["audited_link_counts"].values()) >= 3
                await install_fleet_scale(connection)
                second = await verify_fleet_scale(connection)
                assert first == second

                a12_before: dict[str, list[dict[str, Any]]] = {}
                for model in (ScheduleState, Resource, Job):
                    result = await connection.execute(
                        select(model.__table__).where(model.__table__.c.scenario_id == "A-12-base")
                    )
                    a12_before[model.__tablename__] = [dict(row) for row in result.mappings()]

                await connection.execute(
                    update(Job)
                    .where(Job.scenario_id == SCENARIO_ID)
                    .values(row_version=2)
                )
                with pytest.raises(RuntimeError, match="checksum mismatch"):
                    await verify_fleet_scale(connection)

                await reset_fleet_scale(connection)
                await install_fleet_scale(connection)
                assert await verify_fleet_scale(connection) == first

                for model in (ScheduleState, Resource, Job):
                    result = await connection.execute(
                        select(model.__table__).where(model.__table__.c.scenario_id == "A-12-base")
                    )
                    assert a12_before[model.__tablename__] == [
                        dict(row) for row in result.mappings()
                    ]
        finally:
            await engine.dispose()

    asyncio.run(scenario())
