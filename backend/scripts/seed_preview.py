"""Install and verify explicit synthetic preview scenarios.

The command requires an explicit scenario target. It never chooses a broad or
production database target implicitly, and fleet reset is available only for
local/preview environments.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
import sys
from pathlib import Path
from typing import Any

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).parents[1]))

from app.persistence.database import create_async_engine  # noqa: E402
from app.persistence.models import (
    AgentRun,
    AgentRunEvent,
    Alert,
    Booking,
    CargoItem,
    Decision,
    DecisionChange,
    Event,
    EventExtraction,
    IdempotencyKey,
    Job,
    NotificationOutbox,
    Plan,
    PlanEvidence,
    PlanOption,
    ReadinessItem,
    ReadinessSuggestion,
    Resource,
    ResourceUnavailability,
    ScheduleState,
    ToolCall,
    WeatherForecast,
)
from seed.fleet_scale import SCENARIO_ID, build_rows, canonical_checksum, manifest  # noqa: E402
from sqlalchemy import delete, select, text  # noqa: E402
from sqlalchemy.dialects.postgresql import insert as pg_insert  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncConnection  # noqa: E402

A12_SCENARIO_ID = "A-12-base"
_TABLES: dict[str, Any] = {
    "schedule_state": ScheduleState.__table__,
    "resources": Resource.__table__,
    "resource_unavailability": ResourceUnavailability.__table__,
    "jobs": Job.__table__,
    "bookings": Booking.__table__,
    "cargo_items": CargoItem.__table__,
    "readiness_items": ReadinessItem.__table__,
    "weather_forecast": WeatherForecast.__table__,
    "events": Event.__table__,
    "event_extractions": EventExtraction.__table__,
    "readiness_suggestions": ReadinessSuggestion.__table__,
    "agent_runs": AgentRun.__table__,
    "agent_run_events": AgentRunEvent.__table__,
    "tool_calls": ToolCall.__table__,
    "plans": Plan.__table__,
    "plan_options": PlanOption.__table__,
    "plan_evidence": PlanEvidence.__table__,
    "decisions": Decision.__table__,
    "decision_changes": DecisionChange.__table__,
    "alerts": Alert.__table__,
    "notification_outbox": NotificationOutbox.__table__,
    "idempotency_keys": IdempotencyKey.__table__,
}


def seed_statements() -> list[str]:
    """Return statements from the unchanged A-12 golden seed."""

    source = (Path(__file__).parents[1] / "seed" / "offshore_a12.sql").read_text(
        encoding="utf-8"
    )
    lines = [
        line
        for line in source.splitlines()
        if not line.strip().startswith("--")
        and line.strip().upper() not in {"BEGIN;", "COMMIT;"}
    ]
    return [statement.strip() for statement in "\n".join(lines).split(";") if statement.strip()]


async def install_a12(connection: AsyncConnection) -> None:
    for statement in seed_statements():
        await connection.execute(text(statement))


async def install_fleet_scale(connection: AsyncConnection) -> None:
    rows = build_rows()
    for table_name, table in _TABLES.items():
        values = rows[table_name]
        if not values:
            continue
        await connection.execute(pg_insert(table).values(values).on_conflict_do_nothing())


async def _scenario_rows(connection: AsyncConnection) -> dict[str, list[dict[str, Any]]]:
    """Read only the fleet graph, including every audited relationship."""

    expected = build_rows()
    event_ids = tuple(row["id"] for row in expected["events"])
    run_ids = tuple(row["id"] for row in expected["agent_runs"])
    plan_ids = tuple(row["id"] for row in expected["plans"])
    decision_ids = tuple(row["id"] for row in expected["decisions"])
    route_scopes = tuple(
        [f"events/{event_id}/runs" for event_id in event_ids]
        + [
            f"plans/{plan_id}/{action}"
            for plan_id in plan_ids
            for action in ("approve", "reject", "reply")
        ]
    )
    predicates = {
        "schedule_state": _TABLES["schedule_state"].c.scenario_id == SCENARIO_ID,
        "resources": _TABLES["resources"].c.scenario_id == SCENARIO_ID,
        "resource_unavailability": _TABLES["resource_unavailability"].c.scenario_id
        == SCENARIO_ID,
        "jobs": _TABLES["jobs"].c.scenario_id == SCENARIO_ID,
        "bookings": _TABLES["bookings"].c.scenario_id == SCENARIO_ID,
        "cargo_items": _TABLES["cargo_items"].c.scenario_id == SCENARIO_ID,
        "readiness_items": _TABLES["readiness_items"].c.scenario_id == SCENARIO_ID,
        "readiness_suggestions": _TABLES["readiness_suggestions"].c.event_id.in_(event_ids),
        "weather_forecast": _TABLES["weather_forecast"].c.scenario_id == SCENARIO_ID,
        "events": _TABLES["events"].c.scenario_id == SCENARIO_ID,
        "event_extractions": _TABLES["event_extractions"].c.event_id.in_(event_ids),
        "agent_runs": _TABLES["agent_runs"].c.event_id.in_(event_ids),
        "agent_run_events": _TABLES["agent_run_events"].c.run_id.in_(run_ids),
        "tool_calls": _TABLES["tool_calls"].c.run_id.in_(run_ids),
        "plans": _TABLES["plans"].c.event_id.in_(event_ids),
        "plan_options": _TABLES["plan_options"].c.plan_id.in_(plan_ids),
        "plan_evidence": _TABLES["plan_evidence"].c.plan_id.in_(plan_ids),
        "decisions": _TABLES["decisions"].c.plan_id.in_(plan_ids),
        "decision_changes": _TABLES["decision_changes"].c.decision_id.in_(decision_ids),
        "alerts": _TABLES["alerts"].c.scenario_id == SCENARIO_ID,
        "notification_outbox": _TABLES["notification_outbox"].c.decision_id.in_(decision_ids),
        "idempotency_keys": _TABLES["idempotency_keys"].c.route_scope.in_(route_scopes),
    }
    actual: dict[str, list[dict[str, Any]]] = {}
    for table_name, table in _TABLES.items():
        result = await connection.execute(select(table).where(predicates[table_name]))
        actual[table_name] = [dict(row) for row in result.mappings()]
    return actual


async def verify_fleet_scale(connection: AsyncConnection) -> dict[str, Any]:
    expected_manifest = manifest()
    actual = await _scenario_rows(connection)
    actual_counts = {table: len(actual[table]) for table in actual}
    actual_checksum = canonical_checksum(actual)
    if actual_counts != expected_manifest["counts"]:
        raise RuntimeError(
            f"fleet-scale count mismatch: expected {expected_manifest['counts']}, "
            f"got {actual_counts}"
        )
    if actual_checksum != expected_manifest["checksum"]:
        raise RuntimeError(
            f"fleet-scale checksum mismatch: expected {expected_manifest['checksum']}, "
            f"got {actual_checksum}"
        )
    audited_links = _audit_fleet_links(actual)
    return {
        **expected_manifest,
        "verified_checksum": actual_checksum,
        "audited_link_counts": audited_links,
    }


def _audit_fleet_links(actual: dict[str, list[dict[str, Any]]]) -> dict[str, int]:
    """Prove that the persisted graph contains resolvable story chains."""

    def key(value: object) -> str:
        return str(value)

    events = {key(row["id"]): row for row in actual["events"]}
    resources = {key(row["id"]) for row in actual["resources"]}
    jobs = {key(row["id"]) for row in actual["jobs"]}
    bookings = {key(row["id"]): row for row in actual["bookings"]}
    cargo_items = {key(row["id"]): row for row in actual["cargo_items"]}
    readiness = {key(row["id"]) for row in actual["readiness_items"]}
    runs = {key(row["id"]): row for row in actual["agent_runs"]}
    plans = {key(row["id"]): row for row in actual["plans"]}
    tools = {key(row["id"]): row for row in actual["tool_calls"]}
    decisions = {key(row["id"]): row for row in actual["decisions"]}
    extractions = {
        (key(row["event_id"]), int(row["version"])): row
        for row in actual["event_extractions"]
    }

    checks = {
        "booking_resource_links": sum(
            key(row["resource_id"]) in resources for row in bookings.values()
        ),
        "booking_job_links": sum(
            row["job_id"] is not None and key(row["job_id"]) in jobs
            for row in bookings.values()
        ),
        "cargo_booking_links": sum(
            row["sailing_booking_id"] in bookings
            and key(row["job_id"]) in jobs
            for row in cargo_items.values()
        ),
        "readiness_job_links": sum(
            key(row["job_id"]) in jobs for row in actual["readiness_items"]
        ),
        "suggestion_event_links": sum(
            key(row["event_id"]) in events for row in actual["readiness_suggestions"]
        ),
        "suggestion_readiness_links": sum(
            key(row["readiness_item_id"]) in readiness
            for row in actual["readiness_suggestions"]
        ),
        "event_extraction_links": sum(
            (key(row["event_id"]), int(row["version"])) in extractions
            for row in actual["event_extractions"]
        ),
        "run_event_links": sum(
            key(row["event_id"]) in events for row in runs.values()
        ),
        "run_extraction_links": sum(
            (key(row["event_id"]), int(row["extraction_version"])) in extractions
            for row in runs.values()
        ),
        "run_event_trace_links": sum(
            key(row["run_id"]) in runs for row in actual["agent_run_events"]
        ),
        "tool_run_links": sum(
            key(row["run_id"]) in runs for row in actual["tool_calls"]
        ),
        "plan_event_links": sum(
            key(row["event_id"]) in events for row in plans.values()
        ),
        "plan_run_links": sum(
            key(row["run_id"]) in runs
            and key(runs[key(row["run_id"])]["event_id"]) == key(row["event_id"])
            for row in plans.values()
        ),
        "plan_option_links": sum(
            key(row["plan_id"]) in plans for row in actual["plan_options"]
        ),
        "plan_evidence_links": sum(
            key(row["plan_id"]) in plans
            and (row["tool_call_id"] is None or key(row["tool_call_id"]) in tools)
            for row in actual["plan_evidence"]
        ),
        "decision_plan_links": sum(
            key(row["plan_id"]) in plans for row in decisions.values()
        ),
        "decision_change_links": sum(
            key(row["decision_id"]) in decisions for row in actual["decision_changes"]
        ),
    }

    pinned_context_links = 0
    for decision in decisions.values():
        plan = plans.get(key(decision["plan_id"]))
        if plan is None:
            continue
        run = runs.get(key(plan["run_id"]))
        if run is None or key(run["event_id"]) != key(plan["event_id"]):
            continue
        extraction = extractions.get(
            (key(run["event_id"]), int(run["extraction_version"]))
        )
        if extraction is None or key(decision["event_id"]) != key(plan["event_id"]):
            continue
        payload = extraction["extracted_json"]
        if (
            decision["context_status"] == "captured"
            and decision["event_nature"] == payload.get("nature")
            and decision["event_cause"] == payload.get("cause")
            and list(decision["job_ids"]) == list(payload.get("job_ids", ()))
            and int(decision["plan_version"]) == int(plan["version"])
        ):
            pinned_context_links += 1
    checks["decision_pinned_context_links"] = pinned_context_links
    checks["audited_chain_count"] = pinned_context_links
    if pinned_context_links < manifest()["audited_chain_count"]:
        raise RuntimeError(f"fleet-scale story graph is incomplete: {checks}")
    return checks


async def reset_fleet_scale(connection: AsyncConnection) -> None:
    """Delete only the explicitly selected fleet-scale graph."""

    event_ids = tuple(
        (await connection.execute(select(Event.id).where(Event.scenario_id == SCENARIO_ID)))
        .scalars()
        .all()
    )
    run_ids = tuple(
        (await connection.execute(select(AgentRun.id).where(AgentRun.event_id.in_(event_ids))))
        .scalars()
        .all()
    )
    plan_ids = tuple(
        (await connection.execute(select(Plan.id).where(Plan.event_id.in_(event_ids))))
        .scalars()
        .all()
    )
    decision_ids = tuple(
        (await connection.execute(select(Decision.id).where(Decision.plan_id.in_(plan_ids))))
        .scalars()
        .all()
    )
    if decision_ids:
        await connection.execute(
            delete(NotificationOutbox).where(NotificationOutbox.decision_id.in_(decision_ids))
        )
        await connection.execute(
            delete(Alert).where(Alert.linked_decision_id.in_(decision_ids))
        )
    if event_ids:
        await connection.execute(
            delete(ReadinessSuggestion).where(ReadinessSuggestion.event_id.in_(event_ids))
        )
    route_scopes = [
        *(f"events/{event_id}/runs" for event_id in event_ids),
        *(
            f"plans/{plan_id}/{action}"
            for plan_id in plan_ids
            for action in ("approve", "reject", "reply")
        ),
    ]
    if route_scopes:
        await connection.execute(
            delete(IdempotencyKey).where(IdempotencyKey.route_scope.in_(route_scopes))
        )
    await connection.execute(delete(Alert).where(Alert.scenario_id == SCENARIO_ID))
    await connection.execute(delete(CargoItem).where(CargoItem.scenario_id == SCENARIO_ID))
    await connection.execute(
        delete(DecisionChange).where(DecisionChange.decision_id.in_(decision_ids))
    )
    await connection.execute(delete(Decision).where(Decision.id.in_(decision_ids)))
    await connection.execute(delete(PlanEvidence).where(PlanEvidence.plan_id.in_(plan_ids)))
    await connection.execute(delete(PlanOption).where(PlanOption.plan_id.in_(plan_ids)))
    await connection.execute(delete(Plan).where(Plan.id.in_(plan_ids)))
    await connection.execute(delete(ToolCall).where(ToolCall.run_id.in_(run_ids)))
    await connection.execute(delete(AgentRunEvent).where(AgentRunEvent.run_id.in_(run_ids)))
    await connection.execute(delete(AgentRun).where(AgentRun.id.in_(run_ids)))
    await connection.execute(
        delete(EventExtraction).where(EventExtraction.event_id.in_(event_ids))
    )
    await connection.execute(delete(Event).where(Event.id.in_(event_ids)))
    await connection.execute(
        delete(ResourceUnavailability).where(ResourceUnavailability.scenario_id == SCENARIO_ID)
    )
    await connection.execute(delete(Booking).where(Booking.scenario_id == SCENARIO_ID))
    await connection.execute(delete(ReadinessItem).where(ReadinessItem.scenario_id == SCENARIO_ID))
    await connection.execute(delete(Job).where(Job.scenario_id == SCENARIO_ID))
    await connection.execute(delete(Resource).where(Resource.scenario_id == SCENARIO_ID))
    await connection.execute(
        delete(WeatherForecast).where(WeatherForecast.scenario_id == SCENARIO_ID)
    )
    await connection.execute(delete(ScheduleState).where(ScheduleState.scenario_id == SCENARIO_ID))


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--scenario",
        required=True,
        choices=(A12_SCENARIO_ID, SCENARIO_ID),
        help="Explicit synthetic scenario to install or verify.",
    )
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument(
        "--install-if-missing",
        action="store_true",
        help="Install and verify only when the selected scenario is absent.",
    )
    action.add_argument("--verify", action="store_true", help="Verify without mutating data.")
    action.add_argument(
        "--reset",
        action="store_true",
        help="Reset and reinstall the target; requires --confirm-reset.",
    )
    parser.add_argument(
        "--confirm-reset",
        action="store_true",
        help=(
            "Confirm that --reset may restore only the explicitly selected "
            "fleet-scale scenario."
        ),
    )
    return parser


async def schedule_state_exists(connection: AsyncConnection, scenario_id: str) -> bool:
    result = await connection.execute(
        select(ScheduleState.id).where(ScheduleState.scenario_id == scenario_id)
    )
    return result.scalar_one_or_none() is not None


async def run_cli(args: argparse.Namespace) -> dict[str, Any]:
    if getattr(args, "confirm_reset", False) and not args.reset:
        raise RuntimeError("--confirm-reset is valid only with --reset")
    if args.reset and not getattr(args, "confirm_reset", False):
        raise RuntimeError(
            "--reset requires --confirm-reset; this restores only the explicitly selected "
            "fleet-scale scenario and leaves A-12-base untouched"
        )
    environment = os.getenv("RIPPLE_ENVIRONMENT", "").strip().lower()
    if (
        args.scenario == SCENARIO_ID
        and getattr(args, "install_if_missing", False)
        and environment not in {"local", "preview"}
    ):
        raise RuntimeError(
            "fleet-scale install-if-missing requires RIPPLE_ENVIRONMENT=local or preview"
        )
    database_url = os.environ["RIPPLE_DATABASE_URL"]
    engine = create_async_engine(database_url, pool_size=1, max_overflow=0)
    try:
        if args.reset and args.scenario != SCENARIO_ID:
            raise RuntimeError("--reset is supported only for fleet-scale")
        if args.reset and environment not in {"local", "preview"}:
            raise RuntimeError(
                "fleet-scale reset requires RIPPLE_ENVIRONMENT=local or preview"
            )
        async with engine.begin() as connection:
            if getattr(args, "install_if_missing", False):
                if await schedule_state_exists(connection, args.scenario):
                    source = manifest()
                    return {
                        "scenario_id": args.scenario,
                        "status": "skipped_existing",
                        "installed_seed_version": None,
                        "installed_checksum": None,
                        "source_seed_version": source["seed_version"],
                        "source_checksum": source["checksum"],
                        "message": (
                            "Existing scenario was left untouched; installed version and "
                            "checksum were not inferred. Run --verify for an explicit match."
                        ),
                    }
                if args.scenario == A12_SCENARIO_ID:
                    await install_a12(connection)
                    verification = await verify_a12(connection)
                else:
                    await install_fleet_scale(connection)
                    verification = await verify_fleet_scale(connection)
                return {
                    "scenario_id": args.scenario,
                    "status": "installed",
                    "verification": verification,
                }
            if args.scenario == A12_SCENARIO_ID:
                if args.verify:
                    return await verify_a12(connection)
                raise RuntimeError(
                    "A-12 mutation requires --install-if-missing; it cannot be started implicitly"
                )
            if args.reset:
                await reset_fleet_scale(connection)
                await install_fleet_scale(connection)
                verification = await verify_fleet_scale(connection)
                return {
                    **verification,
                    "warning": (
                        "Destructive reset restored only scenario 'fleet-scale'; "
                        "A-12-base and other scenarios were not touched."
                    ),
                }
            if args.verify:
                return await verify_fleet_scale(connection)
            raise RuntimeError(
                "fleet-scale mutation requires --install-if-missing or explicit --reset"
            )
    finally:
        await engine.dispose()


async def verify_a12(connection: AsyncConnection) -> dict[str, Any]:
    """Verify the read-only A-12 golden graph instead of trusting a flag."""

    expected_counts = {
        "schedule_state": 1,
        "resources": 2,
        "resource_unavailability": 0,
        "jobs": 5,
        "bookings": 8,
        "cargo_items": 2,
        "readiness_items": 12,
        "weather_forecast": 15,
        "events": 3,
    }
    table_names = tuple(expected_counts)
    counts: dict[str, int] = {}
    for table_name in table_names:
        result = await connection.execute(
            text(
                f"SELECT count(*) FROM {table_name} "
                "WHERE scenario_id = :scenario_id"
            ),
            {"scenario_id": A12_SCENARIO_ID},
        )
        counts[table_name] = int(result.scalar_one())
    state = (
        await connection.execute(
            select(ScheduleState.id, ScheduleState.version).where(
                ScheduleState.scenario_id == A12_SCENARIO_ID
            )
        )
    ).one_or_none()
    if counts != expected_counts or state != (1, 1):
        raise RuntimeError(
            f"A-12 golden mismatch: expected counts={expected_counts}, state=(1, 1); "
            f"got counts={counts}, state={state}"
        )
    linked_bookings = len(
        (
            await connection.execute(
                select(Booking.id)
                .join(Job, Booking.job_id == Job.id)
                .where(Booking.scenario_id == A12_SCENARIO_ID)
            )
        )
        .scalars()
        .all()
    )
    if linked_bookings != 5:
        raise RuntimeError(f"A-12 booking link mismatch: expected 5, got {linked_bookings}")
    return {
        "scenario_id": A12_SCENARIO_ID,
        "verified": True,
        "seed_checksum": hashlib.sha256(
            (Path(__file__).parents[1] / "seed" / "offshore_a12.sql").read_bytes()
        ).hexdigest(),
        "counts": counts,
        "linked_booking_count": linked_bookings,
    }


def main() -> None:
    args = _parser().parse_args()
    result = asyncio.run(run_cli(args))
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
