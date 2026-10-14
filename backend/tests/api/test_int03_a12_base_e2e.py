import asyncio
import os
from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from app.agent.workflow import ControlledAgentWorkflow, WorkflowInput
from app.application.plan_service import (
    PlanDraft,
    PlanEvidenceDraft,
    PlanOptionDraft,
    PlanService,
)
from app.application.run_service import RunService
from app.application.schemas import ChangeEventExtraction
from app.config import Settings
from app.domain.enums import EventNature
from app.domain.policy import OFFSHORE_PACK
from app.main import create_app
from app.persistence.database import create_async_engine, create_session_factory
from app.persistence.repositories import ScheduleRepository
from app.solver import CargoRequirement, CounterfactualStatus, what_would_it_take
from fastapi.testclient import TestClient
from tests.solver.test_cpsat import AS_OF, _request, _snapshot

SCENARIO_ID = "A-12-base"
SOURCE_TEXT = (
    "A-12 output dropped again, can we move it to this week, D+3 if possible? "
    "Don't touch B-05, the client is inspecting it."
)
CONDITION_IDS = ("vendor-test-d2", "d07-cargo-d6")

# This is the proposal's intended D+5 option. The integration test deliberately
# keeps the solver's `move_cargo` shape intact so approval must prove that the
# persistence contract can apply the same change, rather than silently changing
# it into an unrelated `assign_cargo` operation.
PROPOSED_CHANGES: tuple[dict[str, object], ...] = (
    {"kind": "move_job", "target": "A-12", "value": 5},
    {"kind": "set_item_date", "target": "A-12-function-test", "value": 2},
    {"kind": "set_item_date", "target": "A-12-paperwork", "value": 3},
    {"kind": "set_item_date", "target": "A-12-shorebase", "value": 4},
    {"kind": "set_item_date", "target": "A-12-load-sail", "value": 5},
    {"kind": "move_cargo", "target": "D-07-drums", "value": 6},
)
CONDITIONS: tuple[dict[str, str], ...] = (
    {"id": CONDITION_IDS[0], "text": "Vendor test is completed by D+2."},
    {"id": CONDITION_IDS[1], "text": "D-07 drums sail on the D+6 boat."},
)


def _cargo_requirements() -> tuple[CargoRequirement, ...]:
    return (
        CargoRequirement("D-07-drums", Decimal("15"), needed_by_day=11, sailing_day=5),
        CargoRequirement("A-12-pump", Decimal("20"), needed_by_day=5),
    )


def _workflow_input(target_start: int) -> WorkflowInput:
    source = f"A-12 should move to D+{target_start}; recover production."
    extraction = ChangeEventExtraction(
        nature=EventNature.REQUEST,
        cause="production priority",
        job_ids=("A-12",),
        objective="Recover A-12 production",
        requested_start=target_start,
        source_excerpt=source,
    )
    return WorkflowInput(
        extraction=extraction,
        snapshot=_snapshot(),
        pack=OFFSHORE_PACK,
        cargo_items=_cargo_requirements(),
        as_of=AS_OF,
    )


def test_a12_base_d3_is_impossible_and_d5_opens_required_levers() -> None:
    d3 = what_would_it_take(
        _request(),
        job_id="A-12",
        target_start=3,
    )
    assert d3.status is CounterfactualStatus.IMPOSSIBLE
    assert d3.levers == ()
    assert any("D+1" in blocker for blocker in d3.blockers)

    d5 = asyncio.run(ControlledAgentWorkflow().run(_workflow_input(5)))
    assert d5.recommended is not None
    assert d5.lever_path == ("expedite_vendor_test", "move_cargo")
    assert d5.recommended.solve.simulation is not None
    assert d5.recommended.solve.simulation.violations == ()

    recommended_snapshot = d5.recommended.solve.solve.snapshot
    assert recommended_snapshot is not None
    assert next(job.start_day for job in recommended_snapshot.jobs if job.id == "A-12") == 5
    cargo_days = {
        booking.cargo_id: booking.start_day
        for booking in recommended_snapshot.bookings
        if booking.cargo_id in {"A-12-pump", "D-07-drums"}
    }
    assert cargo_days == {"A-12-pump": 5, "D-07-drums": 6}


def _settings() -> Settings:
    database_url = os.getenv("RIPPLE_DATABASE_URL")
    if not database_url:
        pytest.skip("set RIPPLE_DATABASE_URL for PostgreSQL API integration fixtures")
    return Settings(environment="test", database_url=database_url)


def _materialize_plan_and_finish_run(event_id: UUID, run_id: UUID) -> tuple[UUID, UUID]:
    async def persist() -> tuple[UUID, UUID]:
        database_url = os.environ["RIPPLE_DATABASE_URL"]
        engine = create_async_engine(database_url)
        factory = create_session_factory(engine)
        option_id = uuid4()
        try:
            async with factory() as session:
                snapshot = await ScheduleRepository(session).load_snapshot(SCENARIO_ID)
                await session.rollback()
                created = await PlanService(session).create(
                    SCENARIO_ID,
                    PlanDraft(
                        event_id=event_id,
                        run_id=run_id,
                        verdict="feasible_with_conditions",
                        base_schedule_version=snapshot.schedule_version,
                        explanation={
                            "summary": "A-12 starts D+5 with vendor and cargo conditions.",
                            "lever_path": ["expedite_vendor_test", "move_cargo"],
                        },
                        counterfactual={
                            "status": "impossible",
                            "job_id": "A-12",
                            "target_start": 3,
                            "blockers": ["The pump cannot be tested before D+1."],
                        },
                        evidence=(
                            PlanEvidenceDraft(
                                claim_id="a12-readiness",
                                claim_text="A-12 readiness was checked before planning.",
                                evidence_type="solver_result",
                            ),
                            PlanEvidenceDraft(
                                claim_id="d07-cargo",
                                claim_text="D-07 drums move to the D+6 sailing.",
                                evidence_type="solver_result",
                            ),
                        ),
                        options=(
                            PlanOptionDraft(
                                option_id=option_id,
                                label="Move A-12 to D+5 with cargo coordination",
                                weight_profile="production_first",
                                solver_status="feasible",
                                changes=PROPOSED_CHANGES,
                                conditions=CONDITIONS,
                                kpi={"estimated_recovered_bbl": 1000},
                                rank=1,
                                recommended=True,
                            ),
                        ),
                    ),
                )
                await session.rollback()

                # The run stream is persistence-only today. Publish the verified
                # plan and terminal event here so the API read contracts can be
                # checked without inventing an agent orchestration endpoint.
                run_service = RunService(session)
                await run_service.publish_event(
                    SCENARIO_ID,
                    run_id,
                    "plan",
                    {
                        "summary": "Verified A-12 D+5 conditional plan.",
                        "plan_id": str(created.id),
                        "lever_path": ["expedite_vendor_test", "move_cargo"],
                    },
                    phase="planning",
                )
                await run_service.finish(
                    SCENARIO_ID,
                    run_id,
                    state="completed",
                    summary="A-12 base verification completed.",
                )
                await session.rollback()
                return created.id, option_id
        finally:
            await engine.dispose()

    return asyncio.run(persist())


@pytest.mark.skipif(
    not os.getenv("RIPPLE_DATABASE_URL"),
    reason="set RIPPLE_DATABASE_URL for PostgreSQL API integration fixtures",
)
def test_a12_base_api_flow_applies_atomic_schedule_changes_and_history() -> None:
    settings = _settings()
    with TestClient(create_app(settings)) as client:
        reset = client.post("/api/v1/demo/reset", json={"scenario_id": SCENARIO_ID})
        assert reset.status_code == 200

        try:
            created = client.post(
                "/api/v1/events",
                json={"raw_text": SOURCE_TEXT, "nature": "request"},
            )
            assert created.status_code == 201
            event_id = UUID(created.json()["id"])

            extraction = client.patch(
                f"/api/v1/events/{event_id}/extraction",
                json={
                    "expected_extraction_version": 0,
                    "extraction": {
                        "nature": "request",
                        "cause": "production priority",
                        "job_ids": ["A-12"],
                        "objective": "Recover A-12 production",
                        "requested_start": 3,
                        "eta_updates": [],
                        "hard_constraints": [
                            {
                                "kind": "lock_job",
                                "value": "B-05",
                                "source_excerpt": "Don't touch B-05, the client is inspecting it.",
                            }
                        ],
                        "soft_preferences": ["recover production"],
                        "risk_tags": [],
                        "levers_ruled_out": [],
                        "missing_info": [],
                        "source_excerpt": SOURCE_TEXT,
                    },
                },
            )
            assert extraction.status_code == 200
            assert extraction.json()["event"]["state"] == "extracted"

            run = client.post(
                f"/api/v1/events/{event_id}/runs",
                headers={"Idempotency-Key": "int03-a12-run"},
            )
            assert run.status_code == 201
            run_id = UUID(run.json()["run_id"])
            plan_id, option_id = _materialize_plan_and_finish_run(event_id, run_id)

            event_detail = client.get(f"/api/v1/events/{event_id}")
            run_detail = client.get(f"/api/v1/runs/{run_id}")
            plan_detail = client.get(f"/api/v1/plans/{plan_id}")
            stream = client.get(f"/api/v1/runs/{run_id}/stream")
            schedule_before = client.get("/api/v1/schedule")

            assert event_detail.status_code == 200
            assert [plan["id"] for plan in event_detail.json()["plans"]] == [str(plan_id)]
            assert run_detail.status_code == 200
            assert run_detail.json()["state"] == "completed"
            assert [event["type"] for event in run_detail.json()["events"]] == [
                "run_started",
                "plan",
                "done",
            ]
            assert plan_detail.status_code == 200
            option = plan_detail.json()["options"][0]
            assert plan_detail.json()["recommended_option_id"] == str(option_id)
            assert option["conditions"] == list(CONDITIONS)
            assert {change["kind"] for change in option["changes"]} >= {
                "move_job",
                "set_item_date",
                "move_cargo",
            }
            assert stream.status_code == 200
            assert "event: plan" in stream.text
            assert "expedite_vendor_test" in stream.text
            assert schedule_before.status_code == 200

            approval = client.post(
                f"/api/v1/plans/{plan_id}/approve",
                headers={"Idempotency-Key": "int03-a12-approval"},
                json={
                    "option_id": str(option_id),
                    "expected_schedule_version": schedule_before.json()["version"],
                    "acknowledged_condition_ids": list(CONDITION_IDS),
                },
            )
            assert approval.status_code == 200
            approval_body = approval.json()
            decision_id = UUID(approval_body["decision_id"])
            assert approval_body["schedule_version_before"] == schedule_before.json()["version"]
            assert approval_body["schedule_version_after"] == schedule_before.json()["version"] + 1
            changed_objects = {
                (item["entity_type"], item["entity_id"]): item
                for item in approval_body["changed_objects"]
            }
            assert changed_objects[("job", "A-12")]["after"]["start_day"] == 5
            assert changed_objects[("booking", "cargo-D-07-drums")]["after"]["start_day"] == 6

            schedule_after = client.get("/api/v1/schedule")
            history = client.get("/api/v1/decisions", params={"plan_id": str(plan_id), "limit": 10})
            decision = client.get(f"/api/v1/decisions/{decision_id}")
            assert schedule_after.status_code == 200
            assert schedule_after.json()["version"] == schedule_before.json()["version"] + 1
            jobs = {job["id"]: job for job in schedule_after.json()["jobs"]}
            bookings = {booking["id"]: booking for booking in schedule_after.json()["bookings"]}
            assert jobs["A-12"]["start_day"] == 5
            assert jobs["B-05"]["start_day"] == 7
            assert bookings["cargo-D-07-drums"]["start_day"] == 6
            assert history.status_code == 200
            assert [item["id"] for item in history.json()["decisions"]] == [str(decision_id)]
            assert decision.status_code == 200
            audit = [
                (
                    item["entity_type"],
                    item["entity_id"],
                    item["field"],
                    item["before"],
                    item["after"],
                )
                for item in decision.json()["changes"]
            ]
            expected_audit = [
                (
                    "job",
                    "A-12",
                    "start_day",
                    {"start_day": 9},
                    {"start_day": 5},
                ),
                (
                    "booking",
                    "booking-A-12",
                    "end_day",
                    {"end_day": 10},
                    {"end_day": 6},
                ),
                (
                    "booking",
                    "booking-A-12",
                    "start_day",
                    {"start_day": 9},
                    {"start_day": 5},
                ),
                (
                    "booking",
                    "cargo-D-07-drums",
                    "end_day",
                    {"end_day": 5},
                    {"end_day": 6},
                ),
                (
                    "booking",
                    "cargo-D-07-drums",
                    "start_day",
                    {"start_day": 5},
                    {"start_day": 6},
                ),
                (
                    "readiness_item",
                    "A-12-function-test",
                    "planned_day",
                    {"planned_day": 4},
                    {"planned_day": 2},
                ),
                (
                    "readiness_item",
                    "A-12-load-sail",
                    "planned_day",
                    {"planned_day": 7},
                    {"planned_day": 5},
                ),
                (
                    "readiness_item",
                    "A-12-paperwork",
                    "planned_day",
                    {"planned_day": 5},
                    {"planned_day": 3},
                ),
                (
                    "readiness_item",
                    "A-12-shorebase",
                    "planned_day",
                    {"planned_day": 6},
                    {"planned_day": 4},
                ),
            ]
            assert sorted(audit, key=repr) == sorted(expected_audit, key=repr)
        finally:
            restored = client.post("/api/v1/demo/reset", json={"scenario_id": SCENARIO_ID})
            assert restored.status_code == 200
