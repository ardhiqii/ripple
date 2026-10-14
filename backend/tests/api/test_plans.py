import asyncio
import os
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from app.application.errors import ApplicationError
from app.application.plan_service import PlanDraft, PlanEvidenceDraft, PlanOptionDraft, PlanService
from app.config import Settings
from app.main import create_app
from app.persistence.database import create_async_engine, create_session_factory
from app.persistence.models import (
    AgentRun,
    Decision,
    DecisionChange,
    Event,
    Plan,
    PlanEvidence,
    PlanOption,
)
from fastapi.testclient import TestClient
from sqlalchemy import delete


def test_openapi_exposes_plan_and_decision_read_contract() -> None:
    document = create_app(Settings(environment="test")).openapi()
    paths = set(document["paths"])

    assert {
        "/api/v1/plans/{plan_id}",
        "/api/v1/plans/{plan_id}/approve",
        "/api/v1/plans/{plan_id}/reject",
        "/api/v1/plans/{plan_id}/reply",
        "/api/v1/decisions",
        "/api/v1/decisions/{decision_id}",
    } <= paths


def test_plan_and_decision_database_routes_return_typed_unavailable_error() -> None:
    object_id = "11111111-1111-1111-1111-111111111111"
    with TestClient(create_app(Settings(environment="test", database_url=None))) as client:
        plan_response = client.get(f"/api/v1/plans/{object_id}")
        decision_response = client.get("/api/v1/decisions")
        approval_response = client.post(
            f"/api/v1/plans/{object_id}/approve",
            headers={"Idempotency-Key": "be13-contract"},
            json={
                "option_id": object_id,
                "expected_schedule_version": 1,
                "acknowledged_condition_ids": [],
            },
        )
        rejection_response = client.post(
            f"/api/v1/plans/{object_id}/reject",
            headers={"Idempotency-Key": "be13-contract-reject"},
            json={"reason": "not now"},
        )
        reply_response = client.post(
            f"/api/v1/plans/{object_id}/reply",
            headers={"Idempotency-Key": "be13-contract-reply"},
            json={"context": "try another option"},
        )

    assert plan_response.status_code == 503
    assert plan_response.json()["error"]["code"] == "database_unavailable"
    assert decision_response.status_code == 503
    assert decision_response.json()["error"]["code"] == "database_unavailable"
    assert approval_response.status_code == 503
    assert approval_response.json()["error"]["code"] == "database_unavailable"
    assert rejection_response.status_code == 503
    assert rejection_response.json()["error"]["code"] == "database_unavailable"
    assert reply_response.status_code == 503
    assert reply_response.json()["error"]["code"] == "database_unavailable"


def _settings() -> Settings:
    database_url = os.getenv("RIPPLE_DATABASE_URL")
    if not database_url:
        pytest.skip("set RIPPLE_DATABASE_URL for PostgreSQL API integration fixtures")
    return Settings(environment="test", database_url=database_url)


def _run_plan_acceptance() -> None:
    async def exercise() -> None:
        database_url = os.environ["RIPPLE_DATABASE_URL"]
        engine = create_async_engine(database_url)
        factory = create_session_factory(engine)
        scenario_id = f"be12-{uuid4()}"
        event_id = uuid4()
        run_one_id = uuid4()
        run_two_id = uuid4()
        decision_ids = (uuid4(), uuid4())
        first_plan_id: UUID | None = None
        second_plan_id: UUID | None = None
        try:
            async with factory() as session:
                async with session.begin():
                    session.add(
                        Event(
                            id=event_id,
                            scenario_id=scenario_id,
                            nature="disruption",
                            cause="vendor delay",
                            raw_text="Vendor ETA changed.",
                            state="planning",
                            origin_type="api",
                            extraction_version=1,
                            created_by="be12-test",
                        )
                    )
                    await session.flush()
                    session.add(
                        AgentRun(
                            id=run_one_id,
                            event_id=event_id,
                            extraction_version=1,
                            state="completed",
                            model_config_snapshot={"test": True},
                            tool_call_budget=15,
                        )
                    )
                    session.add(
                        AgentRun(
                            id=run_two_id,
                            event_id=event_id,
                            extraction_version=1,
                            state="completed",
                            model_config_snapshot={"test": True},
                            tool_call_budget=15,
                        )
                    )

                service = PlanService(session)
                invalid = PlanDraft(
                    event_id=event_id,
                    run_id=run_one_id,
                    verdict="feasible",
                    base_schedule_version=1,
                    explanation={"summary": "invalid recommendation"},
                    options=(
                        PlanOptionDraft(
                            label="Violating recommendation",
                            weight_profile="balanced",
                            solver_status="feasible",
                            violations=(
                                {"kind": "capacity_overflow", "amount": 5},
                            ),
                            recommended=True,
                        ),
                    ),
                )
                with pytest.raises(ApplicationError, match="violations"):
                    await service.create(scenario_id, invalid)

                first = await service.create(
                    scenario_id,
                    PlanDraft(
                        event_id=event_id,
                        run_id=run_one_id,
                        verdict="feasible",
                        base_schedule_version=1,
                        explanation={"summary": "Move A-12 to day 6."},
                        counterfactual={"if_unchanged": {"shortfall": 10}},
                        evidence=(
                            PlanEvidenceDraft(
                                claim_id="capacity-check",
                                claim_text="The selected move stays within deck capacity.",
                                evidence_type="tool_result",
                            ),
                        ),
                        options=(
                            PlanOptionDraft(
                                label="Balanced recovery",
                                weight_profile="balanced",
                                solver_status="optimal",
                                objective_value=Decimal("12.5"),
                                changes=({"entity_type": "job", "entity_id": "A-12"},),
                                kpi={"shortfall_bopd": Decimal("0")},
                                recommended=True,
                            ),
                        ),
                    ),
                )
                first_plan_id = first.id
                assert first.version == 1
                await session.rollback()

                second = await service.create(
                    scenario_id,
                    PlanDraft(
                        event_id=event_id,
                        run_id=run_two_id,
                        verdict="feasible_with_conditions",
                        base_schedule_version=1,
                        explanation={"summary": "Use the weather-safe alternative."},
                        supersedes_plan_id=first.id,
                        options=(
                            PlanOptionDraft(
                                label="Weather-safe recovery",
                                weight_profile={"name": "risk-aware", "risk_weight": 2},
                                solver_status="feasible",
                                conditions=("Confirm weather window",),
                                kpi={"shortfall_bopd": 1},
                                recommended=True,
                            ),
                        ),
                    ),
                )
                second_plan_id = second.id
                assert second.version == 2
                assert [item.version for item in second.lineage] == [1, 2]
                assert second.lineage[0].status == "superseded"
                await session.rollback()

                old = await service.detail(scenario_id, first.id)
                assert old.status == "superseded"
                assert old.version == 1
                await session.rollback()

                now = datetime.now(UTC).replace(tzinfo=None)
                async with session.begin():
                    for index, decision_id in enumerate(decision_ids):
                        session.add(
                            Decision(
                                id=decision_id,
                                plan_id=second.id,
                                selected_option_id=second.recommended_option_id,
                                action="reject" if index else "approve",
                                actor="be12-test",
                                reason="Needs another review" if index else None,
                                category="safety" if index else None,
                                acknowledged_condition_ids=[],
                                schedule_version_before=1,
                                schedule_version_after=None,
                                created_at=now + timedelta(seconds=index),
                            )
                        )
                    session.add(
                        DecisionChange(
                            decision_id=decision_ids[0],
                            entity_type="job",
                            entity_id="A-12",
                            field="start_day",
                            change_kind="updated",
                            before_value={"start_day": 5},
                            after_value={"start_day": 6},
                        )
                    )

                listed = await service.list_decisions(
                    scenario_id,
                    action=None,
                    plan_id=None,
                    limit=1,
                    after=None,
                )
                assert len(listed.decisions) == 1
                assert listed.next_cursor is not None
                next_page = await service.list_decisions(
                    scenario_id,
                    action=None,
                    plan_id=None,
                    limit=1,
                    after=listed.next_cursor,
                )
                assert len(next_page.decisions) == 1
                detail = await service.decision_detail(scenario_id, decision_ids[0])
                assert detail.changes[0].field == "start_day"
        finally:
            async with factory() as session:
                async with session.begin():
                    await session.execute(
                        delete(DecisionChange).where(DecisionChange.decision_id.in_(decision_ids))
                    )
                    await session.execute(
                        delete(Decision).where(Decision.id.in_(decision_ids))
                    )
                    if first_plan_id is not None or second_plan_id is not None:
                        plan_ids = tuple(
                            plan_id
                            for plan_id in (first_plan_id, second_plan_id)
                            if plan_id is not None
                        )
                        await session.execute(
                            delete(PlanEvidence).where(PlanEvidence.plan_id.in_(plan_ids))
                        )
                        await session.execute(
                            delete(PlanOption).where(PlanOption.plan_id.in_(plan_ids))
                        )
                        await session.execute(delete(Plan).where(Plan.id.in_(plan_ids)))
                    await session.execute(
                        delete(AgentRun).where(AgentRun.id.in_((run_one_id, run_two_id)))
                    )
                    await session.execute(delete(Event).where(Event.id == event_id))
            await engine.dispose()

    asyncio.run(exercise())


@pytest.mark.skipif(
    not os.getenv("RIPPLE_DATABASE_URL"),
    reason="set RIPPLE_DATABASE_URL for PostgreSQL API integration fixtures",
)
def test_plan_lineage_rejects_violations_and_keeps_superseded_reads() -> None:
    _settings()
    _run_plan_acceptance()
