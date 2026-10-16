"""Deterministic synthetic fleet-scale v3 data for local and preview use.

The builder is intentionally data-only. It does not read environment state or
generate runtime randomness, so a seed version always produces the same IDs,
timestamps, relational links, manifest, and checksum.
"""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID, uuid5

SCENARIO_ID = "fleet-scale"
SEED_VERSION = "fleet-scale-v3"
SCENARIO_START_DATE = "2026-10-13"
SCHEDULE_VERSION = 1
AUDITED_CHAIN_COUNT = 12

_NAMESPACE = UUID("1ad0b0c1-9b13-4c4e-9e7b-6f9c5a4e1a10")
_BASE_TIME = datetime(2026, 10, 13, tzinfo=UTC)
_TABLE_ORDER = (
    "schedule_state",
    "resources",
    "resource_unavailability",
    "jobs",
    "bookings",
    "cargo_items",
    "readiness_items",
    "weather_forecast",
    "events",
    "event_extractions",
    "readiness_suggestions",
    "agent_runs",
    "agent_run_events",
    "tool_calls",
    "plans",
    "plan_options",
    "plan_evidence",
    "decisions",
    "decision_changes",
    "alerts",
    "notification_outbox",
    "idempotency_keys",
)


def _uuid(kind: str, number: int) -> UUID:
    return uuid5(_NAMESPACE, f"{SEED_VERSION}:{kind}:{number}")


def _decimal(value: str | int | float) -> Decimal:
    return Decimal(str(value))


def _job_id(number: int) -> str:
    return f"FS-JOB-{number:03d}"


def _resource_id(number: int) -> str:
    return f"FS-RES-{number:02d}"


def _booking_id(number: int, slot: int) -> str:
    return f"FS2-BOOK-{(number - 1) * 2 + slot + 1:03d}"


def _day_label(day: int) -> str:
    return (_BASE_TIME + timedelta(days=day)).date().isoformat()


def _event_jobs(number: int) -> tuple[str, ...]:
    first = ((number * 3 - 1) % 44) + 1
    if number % 2:
        return (_job_id(first),)
    second = ((first + 8 - 1) % 44) + 1
    return (_job_id(first), _job_id(second))


def _event_context(number: int) -> tuple[str, str, tuple[str, ...], str]:
    assets = (
        "Northstar Barge 01",
        "Bluewake Supply 03",
        "Delta Test Bay 02",
        "Tideway Lift Crew 04",
        "Northstar Barge 04",
    )
    causes = (
        "weather window",
        "external timing",
        "equipment inspection",
        "deck capacity",
        "crew handover",
    )
    asset = assets[(number - 1) % len(assets)]
    cause = causes[(number - 1) % len(causes)]
    job_ids = _event_jobs(number)
    nature = "disruption" if number % 3 == 0 else "request"
    task = " and ".join(job_ids)
    raw_text = (
        f"{asset} reported on {_day_label(number % 28)} that {task} needs a "
        f"planning update before the {cause} window."
    )
    if number in {11, 12, 13, 14, 15}:
        raw_text = (
            f"{asset} sent a partial note for {task} on {_day_label(number % 28)}; "
            f"the {cause} detail needs planner review before release."
        )
    return nature, cause, job_ids, raw_text


def build_rows() -> dict[str, list[dict[str, Any]]]:
    """Build the complete fleet-scale v3 graph in dependency order."""

    rows: dict[str, list[dict[str, Any]]] = {table: [] for table in _TABLE_ORDER}
    rows["schedule_state"].append(
        {
            "scenario_id": SCENARIO_ID,
            "version": SCHEDULE_VERSION,
            "updated_at": _BASE_TIME,
        }
    )

    resource_groups = (
        (
            "barge",
            "job",
            (1, 2, 1, 1, 1),
            (
                "Northstar Barge 01",
                "Northstar Barge 02",
                "Northstar Barge 03",
                "Northstar Barge 04",
                "Northstar Barge 05",
            ),
        ),
        (
            "supply_boat",
            "deck_units",
            (80, 110, 140, 95, 130, 100),
            (
                "Bluewake Supply 01",
                "Bluewake Supply 02",
                "Bluewake Supply 03",
                "Bluewake Supply 04",
                "Bluewake Supply 05",
                "Bluewake Supply 06",
            ),
        ),
        (
            "test_bay",
            "slot",
            (2, 2, 1, 3, 2),
            (
                "Delta Test Bay 01",
                "Delta Test Bay 02",
                "Delta Test Bay 03",
                "Delta Test Bay 04",
                "Delta Test Bay 05",
            ),
        ),
        (
            "lift_crew",
            "crew",
            (1, 1, 2, 1, 1, 1),
            (
                "Tideway Lift Crew 01",
                "Tideway Lift Crew 02",
                "Tideway Lift Crew 03",
                "Tideway Lift Crew 04",
                "Tideway Lift Crew 05",
                "Tideway Lift Crew 06 · standby",
            ),
        ),
    )
    resources_by_type: dict[str, list[str]] = {}
    resource_story_notes = {
        _resource_id(2): (
            "Maintenance intersection case: four short dispatches remain visible "
            "during the crane-service window."
        ),
        _resource_id(6): (
            "Single capacity exception case: the two 50/40-deck-unit bookings "
            "overlap on the same sailing days."
        ),
        _resource_id(10): (
            "Unavailable intersection case: port inspection overlaps four "
            "supply-boat bookings without a synthetic group correlation."
        ),
        _resource_id(15): (
            "Valid parallel capacity case: three test activities share the "
            "three-slot bay on the same date."
        ),
        _resource_id(22): "Standby row: held for dispatch cover and intentionally unbooked.",
    }
    resource_number = 1
    for resource_type, unit, capacities, names in resource_groups:
        ids: list[str] = []
        for index, name in enumerate(names):
            resource_id = _resource_id(resource_number)
            ids.append(resource_id)
            rows["resources"].append(
                {
                    "id": resource_id,
                    "scenario_id": SCENARIO_ID,
                    "type": resource_type,
                    "name": name,
                    "capacity": _decimal(capacities[index]),
                    "unit": unit,
                    "active": True,
                    "metadata": {
                        "location": "synthetic-offshore",
                        "group": resource_type,
                        "scenario": SCENARIO_ID,
                        "empty_fixture": resource_id == _resource_id(22),
                        "baseline_note": (
                            "standby resource intentionally has no bookings"
                            if resource_id == _resource_id(22)
                            else "deterministic fleet-scale v3 baseline"
                        ),
                        "story_note": resource_story_notes.get(resource_id),
                    },
                }
            )
            resource_number += 1
        resources_by_type[resource_type] = ids

    barge_ids = resources_by_type["barge"]
    supply_boat_ids = resources_by_type["supply_boat"]
    test_bay_ids = resources_by_type["test_bay"]
    lift_crew_ids = resources_by_type["lift_crew"]

    # Intervals are deliberately on different resources and overlap baseline
    # bookings. These are explicit exception stories, not hidden booking rows.
    rows["resource_unavailability"].extend(
        (
            {
                "id": "FS2-UNAV-001",
                "scenario_id": SCENARIO_ID,
                "resource_id": barge_ids[1],
                "start_day": 4,
                "end_day": 6,
                "kind": "maintenance",
                "reason": (
                    "Maintenance: crane inspection and hydraulic service; "
                    "bookings FS2-BOOK-021, FS2-BOOK-023, FS2-BOOK-025, and "
                    "FS2-BOOK-027 on 2026-10-17 through 2026-10-19 remain visible for review"
                ),
            },
            {
                "id": "FS2-UNAV-002",
                "scenario_id": SCENARIO_ID,
                "resource_id": supply_boat_ids[4],
                "start_day": 12,
                "end_day": 15,
                "kind": "unavailable",
                "reason": (
                    "Unavailable: port inspection hold before the next sailing window; "
                    "bookings FS2-BOOK-029, FS2-BOOK-031, FS2-BOOK-033, and "
                    "FS2-BOOK-035 on 2026-10-25 through 2026-10-28 remain visible for review"
                ),
            },
        )
    )

    job_rows: dict[int, dict[str, Any]] = {}
    for number in range(1, 45):
        if number <= 6:
            start_day = number - 1
        elif number >= 42:
            start_day = number - 15
        else:
            start_day = (number * 7 + 2) % 27
        job_type = "inspection" if number % 4 == 0 else "pump_repair"
        if number % 9 == 0:
            job_type = "well_test"
        row = {
            "id": _job_id(number),
            "scenario_id": SCENARIO_ID,
            "site": "North Shelf" if number % 3 == 0 else "West Shelf",
            "job_type": job_type,
            "start_day": start_day,
            "duration_days": 1 + number % 3,
            "shortfall_bopd": _decimal(40 + number * 6),
            "locked": number in {7, 31},
            "lock_reason": "client hold" if number in {7, 31} else None,
            "status": "active" if number % 9 == 0 else "planned",
            "row_version": 1,
        }
        job_rows[number] = row
        rows["jobs"].append(row)

    def add_job_booking(
        number: int,
        slot: int,
        resource_id: str,
        start_day: int,
        end_day: int,
        load: Decimal,
    ) -> None:
        rows["bookings"].append(
            {
                "id": _booking_id(number, slot),
                "scenario_id": SCENARIO_ID,
                "job_id": _job_id(number),
                "activity_id": None,
                "resource_id": resource_id,
                "start_day": start_day,
                "end_day": end_day,
                "load": load,
                "status": "confirmed" if number % 6 == 0 else "planned",
                "row_version": 1,
            }
        )

    for number in range(1, 45):
        job = job_rows[number]
        duration_end = min(31, job["start_day"] + job["duration_days"] - 1)
        if number <= 6:
            primary_resource = barge_ids[0]
            primary_start = number - 1
            primary_end = primary_start
            primary_load = _decimal(1)
        elif number in {7, 8, 9, 10}:
            # This is the single intentional over-capacity case. Jobs 7 and 8
            # overlap at 90 deck units on an 80-unit boat; jobs 9 and 10 are
            # separate follow-up windows so the rest of the seed remains valid.
            primary_resource = supply_boat_ids[0]
            primary_start, primary_end, primary_load = {
                7: (10, 11, _decimal(50)),
                8: (10, 11, _decimal(40)),
                9: (12, 12, _decimal(30)),
                10: (13, 13, _decimal(30)),
            }[number]
        elif number in {11, 12, 13, 14}:
            primary_resource = barge_ids[1]
            # Each booking intersects maintenance, but the two bookings on
            # 2026-10-17 use the barge's two job slots rather than overflow.
            primary_start = {11: 4, 12: 5, 13: 6, 14: 4}[number]
            primary_end = primary_start
            primary_load = _decimal(1)
        elif number in {15, 16, 17, 18}:
            primary_resource = supply_boat_ids[4]
            # Each booking intersects the unavailable port-inspection window,
            # but the bookings are serial and stay within deck capacity.
            primary_start, primary_end, primary_load = {
                15: (12, 12, _decimal(70)),
                16: (13, 13, _decimal(50)),
                17: (14, 14, _decimal(70)),
                18: (15, 15, _decimal(50)),
            }[number]
        else:
            primary_pool = barge_ids[2:] + supply_boat_ids[1:] + test_bay_ids[:2]
            # Spread the long-tail bookings over every remaining resource. A
            # coprime stride avoids accidental repeated overlaps while keeping
            # the assignment deterministic and easy to inspect.
            primary_resource = primary_pool[(number * 3) % len(primary_pool)]
            primary_start = job["start_day"]
            primary_end = duration_end
            primary_load = _decimal(
                1
                if primary_resource in barge_ids or primary_resource in test_bay_ids
                else 45 + (number % 4) * 10
            )
        add_job_booking(
            number,
            0,
            primary_resource,
            primary_start,
            primary_end,
            primary_load,
        )

        secondary_pool = test_bay_ids if number % 2 else lift_crew_ids[:-1]
        secondary_resource = secondary_pool[(number * 3) % len(secondary_pool)]
        if number in {1, 11, 31}:
            # Three parallel bookings on Delta Test Bay 04 (capacity 3).
            secondary_resource = test_bay_ids[3]
            secondary_start = 4
            secondary_end = 5 if number in {1, 11} else 4
        else:
            secondary_start = min(31, job["start_day"] + (number % 2))
            secondary_end = min(31, secondary_start + (1 if number % 5 == 0 else 0))
        secondary_load = _decimal(
            2 if secondary_resource == test_bay_ids[3] and number % 4 == 0 else 1
        )
        add_job_booking(
            number,
            1,
            secondary_resource,
            secondary_start,
            secondary_end,
            secondary_load,
        )

    # Cargo is the explicit supply-boat dependency. Its booking owns the
    # cargo ID through activity_id, matching the storage/domain adapter.
    for number in range(1, 13):
        cargo_id = f"FS2-CARGO-{number:03d}"
        sailing_day = 5 + number * 2
        booking_id = f"FS2-BOOK-CARGO-{number:03d}"
        deck_units = _decimal(35 + (number % 4) * 15)
        rows["bookings"].append(
            {
                "id": booking_id,
                "scenario_id": SCENARIO_ID,
                "job_id": None,
                "activity_id": cargo_id,
                "resource_id": supply_boat_ids[(number + 1) % len(supply_boat_ids)],
                "start_day": sailing_day,
                "end_day": sailing_day,
                "load": deck_units,
                "status": "confirmed",
                "row_version": 1,
            }
        )
        rows["cargo_items"].append(
            {
                "id": cargo_id,
                "scenario_id": SCENARIO_ID,
                "job_id": _job_id((number * 3) % 44 + 1),
                "description": (
                    "Replacement pump skid and hose kit"
                    if number % 2
                    else "Inspection tooling and certified lifting slings"
                ),
                "deck_units": deck_units,
                "needed_by_day": sailing_day + 1,
                "sailing_booking_id": booking_id,
                "row_version": 1,
            }
        )

    stages = ("function_test", "paperwork", "shorebase_staging", "load_and_sail")
    readiness_rows: dict[int, dict[str, Any]] = {}
    for number in range(1, 41):
        uncertain_eta = number in {8, 27}
        stale_source = number == 4
        low_confidence = number == 31
        status = (
            "blocked"
            if number in {9, 18, 29, 37}
            else "ready"
            if number % 5 == 0 or number in {7, 25, 34}
            else "pending"
        )
        job = job_rows[number]
        row = {
            "id": f"FS2-READY-{number:03d}",
            "scenario_id": SCENARIO_ID,
            "job_id": job["id"],
            "stage": stages[(number - 1) % len(stages)],
            "step_order": 1 + (number - 1) % len(stages),
            "lead_time_days": 1 + number % 3,
            "planned_day": job["start_day"],
            "eta_earliest_day": job["start_day"] + 1,
            "eta_latest_day": job["start_day"] + (5 if uncertain_eta else 2),
            "confidence": _decimal(
                "0.38"
                if low_confidence
                else "0.56"
                if uncertain_eta
                else "0.91"
                if status == "ready"
                else "0.78"
            ),
            "status": status,
            "source_type": "dispatch_note" if number % 2 else "erp",
            "source_reference": (
                "dispatch note dated 2026-09-23; confirmation is stale"
                if stale_source
                else f"shorebase readiness record {number:03d} for {_day_label(job['start_day'])}"
            ),
            "last_updated_at": _BASE_TIME
            - timedelta(days=21 if stale_source else number % 4),
            "not_before_day": 7 if number == 9 else None,
            "risk_buffer_days": 2 if number in {8, 27, 31} else 0,
            "row_version": 1,
        }
        readiness_rows[number] = row
        rows["readiness_items"].append(row)

    for number in range(32):
        rows["weather_forecast"].append(
            {
                "scenario_id": SCENARIO_ID,
                "location": "synthetic-offshore",
                "day": number,
                "wave_height": _decimal(f"{1.0 + (number % 7) * 0.2:.1f}"),
                "go_flag": number not in {6, 17, 26},
                "source": (
                    "area-wide no-go: swell and wind exceed the sailing threshold"
                    if number in {6, 17, 26}
                    else "area-wide deterministic marine desk forecast"
                ),
                "last_updated_at": _BASE_TIME,
            }
        )

    state_by_number = {
        **{number: "received" for number in range(1, 7)},
        **{number: "extracted" for number in range(7, 11)},
        **{number: "clarification_needed" for number in range(11, 16)},
        **{number: "planning" for number in range(16, 25)},
        **{number: "closed" for number in range(25, 31)},
    }
    plan_by_event: dict[int, UUID] = {
        number: _uuid("plan", number) for number in range(19, 31)
    }
    extraction_by_event: dict[int, dict[str, Any]] = {}
    for number in range(1, 31):
        nature, cause, job_ids, raw_text = _event_context(number)
        state = state_by_number[number]
        extraction_version = 0 if state == "received" else 1
        event_id = _uuid("event", number)
        rows["events"].append(
            {
                "id": event_id,
                "scenario_id": SCENARIO_ID,
                "nature": nature,
                "cause": cause,
                "raw_text": raw_text,
                "file_object_ref": None,
                "state": state,
                "parent_event_id": None,
                "parent_plan_id": plan_by_event.get(number),
                "origin_type": "demo",
                "extraction_version": extraction_version,
                "created_by": "synthetic-operations-desk",
                "created_at": _BASE_TIME + timedelta(minutes=number),
                "updated_at": _BASE_TIME + timedelta(minutes=number),
            }
        )
        if extraction_version:
            extraction = {
                "nature": nature,
                "cause": cause,
                "job_ids": list(job_ids),
                "source_excerpt": raw_text,
                "requested_start": job_rows[int(job_ids[0][-3:])]["start_day"],
                "source_date": _day_label(number % 28),
            }
            extraction_by_event[number] = extraction
            rows["event_extractions"].append(
                {
                    "event_id": event_id,
                    "version": 1,
                    "extracted_json": extraction,
                    "model_name": "deterministic-synthetic-extractor",
                    "prompt_version": SEED_VERSION,
                    "confidence_summary": {
                        "overall": (
                            "low"
                            if state == "clarification_needed"
                            else "high"
                            if number % 2 == 0
                            else "medium"
                        ),
                        "source": "synthetic operational note",
                    },
                    "corrected": number in {12, 14},
                    "correction_actor": "synthetic-planner" if number in {12, 14} else None,
                    "corrected_at": (
                        _BASE_TIME + timedelta(minutes=number + 1)
                        if number in {12, 14}
                        else None
                    ),
                    "created_at": _BASE_TIME + timedelta(minutes=number),
                }
            )

    # These suggestions make extracted and clarification-needed events
    # navigable from the readiness board without changing operational rows.
    for number, readiness_number in ((8, 8), (12, 18), (14, 29)):
        rows["readiness_suggestions"].append(
            {
                "id": _uuid("readiness-suggestion", number),
                "event_id": _uuid("event", number),
                "readiness_item_id": readiness_rows[readiness_number]["id"],
                "proposed_patch": {
                    "status": "ready" if number == 8 else "pending",
                    "eta_latest_day": readiness_rows[readiness_number]["eta_latest_day"],
                },
                "source_excerpt": extraction_by_event[number]["source_excerpt"],
                "confidence": _decimal("0.84" if number == 8 else "0.52"),
                "base_row_version": 1,
                "state": "proposed" if number != 14 else "needs_review",
                "review_actor": None,
                "review_note": None,
                "created_at": _BASE_TIME + timedelta(minutes=number + 2),
                "reviewed_at": None,
                "updated_at": _BASE_TIME + timedelta(minutes=number + 2),
            }
        )

    run_numbers = (13, 14) + tuple(range(19, 31))
    run_by_event: dict[int, UUID] = {}
    for number in run_numbers:
        run_id = _uuid("run", number)
        run_by_event[number] = run_id
        run_state = "failed" if number == 13 else "running" if number == 14 else "completed"
        rows["agent_runs"].append(
            {
                "id": run_id,
                "event_id": _uuid("event", number),
                "extraction_version": 1,
                "state": run_state,
                "attempt": 1,
                "model_config_snapshot": {
                    "provider": "deterministic",
                    "seed_version": SEED_VERSION,
                    "profile": "fleet-scale-story-graph",
                },
                "tool_call_budget": 8,
                "tool_call_usage": 1,
                "token_count": 180 + number,
                "estimated_cost": _decimal("0.000000"),
                "started_at": _BASE_TIME + timedelta(minutes=number),
                "completed_at": (
                    _BASE_TIME + timedelta(minutes=number + 2)
                    if run_state == "completed"
                    else None
                ),
                "timeout_at": (
                    _BASE_TIME + timedelta(minutes=number + 10)
                    if run_state == "running"
                    else None
                ),
                "error_code": "synthetic_extraction_failure" if run_state == "failed" else None,
                "error_detail": (
                    "The source note did not contain a usable sailing window."
                    if run_state == "failed"
                    else None
                ),
                "idempotency_key": f"fleet-scale-v3-run-{number:02d}",
            }
        )
        rows["agent_run_events"].append(
            {
                "run_id": run_id,
                "sequence": 1,
                "event_type": {
                    "failed": "run_failed",
                    "running": "run_started",
                }.get(run_state, "run_completed"),
                "public_payload": {
                    "scenario_id": SCENARIO_ID,
                    "event_number": number,
                    "phase": "extract" if number in {13, 14} else "plan",
                },
                "internal_payload": {"seed_version": SEED_VERSION},
                "created_at": _BASE_TIME + timedelta(minutes=number + 1),
            }
        )
        rows["tool_calls"].append(
            {
                "id": _uuid("tool", number),
                "run_id": run_id,
                "tool_name": "read_schedule_snapshot",
                "ordinal": 1,
                "sanitized_input": {
                    "scenario_id": SCENARIO_ID,
                    "job_ids": list(_event_jobs(number)),
                },
                "sanitized_result": {
                    "status": "failed" if run_state == "failed" else "ok",
                    "resource_groups": ["barge", "supply_boat", "test_bay", "lift_crew"],
                },
                "started_at": _BASE_TIME + timedelta(minutes=number),
                "completed_at": (
                    _BASE_TIME + timedelta(minutes=number + 1)
                    if run_state != "running"
                    else None
                ),
                "status": (
                    "failed"
                    if run_state == "failed"
                    else "running"
                    if run_state == "running"
                    else "completed"
                ),
                "error_code": "synthetic_extraction_failure" if run_state == "failed" else None,
                "input_hash": hashlib.sha256(
                    f"{SEED_VERSION}:tool:{number}".encode()
                ).hexdigest(),
            }
        )

    action_by_event = {
        19: "approve",
        20: "reject",
        21: "reply",
        22: "approve",
        23: "reject",
        24: "reply",
        25: "approve",
        26: "reject",
        27: "reply",
        28: "approve",
        29: "reject",
        30: "reply",
    }
    option_ids: dict[int, dict[str, UUID]] = {}
    for number in range(19, 31):
        action = action_by_event[number]
        plan_id = plan_by_event[number]
        run_id = run_by_event[number]
        status = (
            "approved"
            if action == "approve"
            else "rejected"
            if action == "reject"
            else "proposed"
        )
        feasible_option_id = _uuid("option-feasible", number)
        infeasible_option_id = _uuid("option-infeasible", number)
        option_ids[number] = {
            "feasible": feasible_option_id,
            "infeasible": infeasible_option_id,
        }
        target_job = extraction_by_event[number]["job_ids"][0]
        if target_job in {_job_id(7), _job_id(31)}:
            target_job = _job_id(8)
        target_start = job_rows[int(target_job[-3:])]["start_day"]
        condition_ids = [f"FS2-COND-{number:02d}"] if number % 3 == 0 else []
        rows["plans"].append(
            {
                "id": plan_id,
                "event_id": _uuid("event", number),
                "run_id": run_id,
                "version": 1,
                "verdict": "infeasible" if action == "reject" else "feasible_with_conditions",
                "recommended_option_id": feasible_option_id if action != "reject" else None,
                "base_schedule_version": SCHEDULE_VERSION,
                "explanation": {
                    "summary": f"Dispatch review for {target_job} on {_day_label(target_start)}",
                    "story": (
                        "Synthetic baseline preserves the source, capacity, and readiness evidence."
                    ),
                },
                "counterfactual": {
                    "schedule_version": SCHEDULE_VERSION,
                    "capacity_note": (
                        "Existing over-capacity and unavailable intervals remain visible."
                    ),
                },
                "status": status,
                "supersedes_plan_id": None,
                "created_at": _BASE_TIME + timedelta(minutes=number + 2),
            }
        )
        rows["plan_options"].extend(
            (
                {
                    "id": feasible_option_id,
                    "plan_id": plan_id,
                    "label": "Protect the committed sailing window",
                    "weight_profile": {"schedule_change": 0.7, "risk": 0.3},
                    "solver_status": "feasible",
                    "objective_value": _decimal(str(100 + number)),
                    "solve_milliseconds": 18 + number,
                    "changes": [
                        {
                            "kind": "move_job",
                            "target": target_job,
                            "value": target_start + (1 if number % 2 else 0),
                        }
                    ],
                    "conditions": (
                        [{"id": condition_ids[0], "label": "confirm shorebase handover"}]
                        if condition_ids
                        else []
                    ),
                    "kpi": {"planned_load_percent": 72 + number % 10},
                    "violations": [],
                    "rank": 1,
                    "is_recommended": action != "reject",
                },
                {
                    "id": infeasible_option_id,
                    "plan_id": plan_id,
                    "label": "Keep the original weather-window commitment",
                    "weight_profile": {"schedule_change": 0.2, "risk": 0.8},
                    "solver_status": "infeasible",
                    "objective_value": _decimal(str(160 + number)),
                    "solve_milliseconds": 21 + number,
                    "changes": [
                        {
                            "kind": "move_job",
                            "target": target_job,
                            "value": max(0, target_start - 1),
                        }
                    ],
                    "conditions": [],
                    "kpi": {"planned_load_percent": 104 + number % 8},
                    "violations": [
                        {"kind": "capacity_overflow", "resource_id": supply_boat_ids[0]}
                    ],
                    "rank": 2,
                    "is_recommended": False,
                },
            )
        )
        rows["plan_evidence"].append(
            {
                "plan_id": plan_id,
                "claim_id": f"FS2-CLAIM-{number:02d}",
                "claim_text": (
                    "Source note and schedule snapshot support the "
                    f"{_day_label(target_start)} review."
                ),
                "tool_call_id": _uuid("tool", number),
                "evidence_type": "tool_result",
            }
        )

    for number, action in action_by_event.items():
        context = extraction_by_event[number]
        plan_id = plan_by_event[number]
        decision_id = _uuid("decision", number)
        target_job = context["job_ids"][0]
        selected_option_id = option_ids[number]["feasible"] if action == "approve" else None
        rows["decisions"].append(
            {
                "id": decision_id,
                "plan_id": plan_id,
                "event_id": _uuid("event", number),
                "plan_version": 1,
                # Immutable copy of the exact extraction used by the linked run.
                "event_nature": context["nature"],
                "event_cause": context["cause"],
                "job_ids": list(context["job_ids"]),
                "context_status": "captured",
                "selected_option_id": selected_option_id,
                "action": action,
                "actor": "synthetic-planner",
                "reason": (
                    f"{action.title()} recorded after reviewing {target_job} "
                    "and the source note."
                ),
                "category": "synthetic_baseline",
                "acknowledged_condition_ids": (
                    [f"FS2-COND-{number:02d}"]
                    if action == "approve" and number % 3 == 0
                    else []
                ),
                "schedule_version_before": SCHEDULE_VERSION,
                "schedule_version_after": SCHEDULE_VERSION if action == "approve" else None,
                "created_at": _BASE_TIME + timedelta(minutes=number + 4),
            }
        )
        rows["decision_changes"].append(
            {
                "decision_id": decision_id,
                "entity_type": "job",
                "entity_id": target_job,
                "field": "start_day",
                "change_kind": "applied" if action == "approve" else "proposed",
                "before": {"value": job_rows[int(target_job[-3:])]["start_day"]},
                "after": {
                    "value": job_rows[int(target_job[-3:])]["start_day"]
                    + (1 if action == "approve" else 0)
                },
            }
        )

    return rows


def _normalize(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _normalize(item) for key, item in sorted(value.items())}
    if isinstance(value, (list, tuple)):
        return [_normalize(item) for item in value]
    if isinstance(value, (datetime, UUID)):
        return str(value)
    if isinstance(value, Decimal):
        return format(value.normalize(), "f")
    return value


def canonical_checksum(rows: dict[str, list[dict[str, Any]]]) -> str:
    """Return a stable checksum for every table in the reset graph.

    ``schedule_state.updated_at`` is operational bookkeeping and changes when
    an explicit API reset completes. The logical baseline is represented by
    its scenario and version, so the checksum intentionally ignores only that
    mutable timestamp while retaining every other row and column.
    """

    canonical: list[tuple[str, list[dict[str, Any]]]] = []
    for table in _TABLE_ORDER:
        table_rows = []
        for row in rows[table]:
            normalized = _normalize(row)
            if table == "schedule_state":
                normalized.pop("id", None)
                normalized.pop("updated_at", None)
            table_rows.append(normalized)
        canonical.append(
            (table, sorted(table_rows, key=lambda row: json.dumps(row, sort_keys=True)))
        )
    payload = json.dumps(canonical, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode()).hexdigest()


def _story_cases() -> dict[str, Any]:
    """Expose stable IDs for the curated Timeline and cross-page stories."""

    return {
        "capacity_valid_concurrency": {
            "resource_id": _resource_id(15),
            "booking_ids": [_booking_id(1, 1), _booking_id(11, 1), _booking_id(31, 1)],
            "days": [4, 5],
            "capacity": 3,
            "total_load": 3,
            "reason": "Three test activities share Delta Test Bay 04 within its three slots.",
        },
        "capacity_overflow": {
            "resource_id": _resource_id(6),
            "booking_ids": [_booking_id(7, 0), _booking_id(8, 0)],
            "days": [10, 11],
            "capacity": 80,
            "total_load": 90,
            "reason": "Two sailing jobs overlap at 90 deck units against an 80-unit boat.",
        },
        "maintenance_intersection": {
            "resource_id": _resource_id(2),
            "booking_ids": [_booking_id(number, 0) for number in (11, 12, 13, 14)],
            "exception_id": "FS2-UNAV-001",
            "reason": "Crane inspection and hydraulic service affects the listed dispatch dates.",
        },
        "unavailable_intersection": {
            "resource_id": _resource_id(10),
            "booking_ids": [_booking_id(number, 0) for number in (15, 16, 17, 18)],
            "exception_id": "FS2-UNAV-002",
            "reason": "Port inspection hold overlaps the listed sailing bookings.",
        },
        "area_weather_context": {
            "location": "synthetic-offshore",
            "no_go_days": [6, 17, 26],
            "reason": "Area-wide swell and wind hold, rendered once as shared context.",
        },
        "standby_resource": {
            "resource_id": _resource_id(22),
            "reason": "Held for dispatch cover and intentionally has no bookings.",
        },
        "cross_page_chain": {
            "event_ids": [str(_uuid("event", number)) for number in range(19, 31)],
            "decision_ids": [str(_uuid("decision", number)) for number in range(19, 31)],
            "path": ["event", "extraction", "run", "plan", "decision", "history"],
        },
    }


def manifest() -> dict[str, Any]:
    """Return the versioned baseline metadata advertised by the API/CLI."""

    rows = build_rows()
    return {
        "scenario_id": SCENARIO_ID,
        "seed_version": SEED_VERSION,
        "manifest_version": f"{SEED_VERSION}-manifest",
        "scenario_start_date": SCENARIO_START_DATE,
        "schedule_version": SCHEDULE_VERSION,
        "checksum": canonical_checksum(rows),
        "counts": {table: len(rows[table]) for table in _TABLE_ORDER},
        "audited_chain_count": AUDITED_CHAIN_COUNT,
        "story_cases": _story_cases(),
        "reset_graph": list(_TABLE_ORDER),
    }


__all__ = [
    "AUDITED_CHAIN_COUNT",
    "SCENARIO_ID",
    "SCENARIO_START_DATE",
    "SCHEDULE_VERSION",
    "SEED_VERSION",
    "build_rows",
    "canonical_checksum",
    "manifest",
]
