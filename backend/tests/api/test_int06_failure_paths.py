from __future__ import annotations

import asyncio
import os
from collections.abc import Mapping
from dataclasses import replace
from pathlib import Path
from typing import Any, cast
from uuid import UUID, uuid4

import pytest
from app.agent.model_gateway import IntakeModelConfig, VertexGatewayConfig, VertexModelGateway
from app.agent.model_gateway_types import IntakeRequest, ModelGatewayError
from app.agent.numeric_checker import ExplanationDraft, NumericClaim
from app.agent.workflow import (
    ControlledAgentWorkflow,
    DeterministicWorkflowModel,
    ExplanationContext,
    WorkflowInput,
    WorkflowState,
)
from app.application.demo_service import DemoService
from app.application.errors import ApplicationError
from app.application.plan_service import PlanDraft, PlanOptionDraft, PlanService
from app.application.run_service import RunService
from app.application.schemas import ChangeEventExtraction
from app.config import Settings
from app.domain.enums import EventNature
from app.domain.policy import OFFSHORE_PACK
from app.main import create_app
from app.persistence.database import create_async_engine, create_session_factory
from app.persistence.models import ScheduleState
from app.solver import SolverRunStatus, solve, what_would_it_take
from app.streaming.run_stream import stream_run
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from tests.solver.test_cpsat import AS_OF, _request, _snapshot

SCENARIO_ID = "A-12-base"
SOURCE_TEXT = "A-12 output dropped again, can we move it to D+5?"


class _UnavailableStructuredClient:
    async def generate(
        self,
        *,
        prompt: str,
        model_name: str,
        temperature: float,
        max_output_tokens: int,
        response_schema: Mapping[str, Any],
    ) -> Mapping[str, Any]:
        del prompt, model_name, temperature, max_output_tokens, response_schema
        raise RuntimeError("provider unavailable")


class _MismatchingModel(DeterministicWorkflowModel):
    async def explain(self, context: ExplanationContext) -> ExplanationDraft:
        del context
        return ExplanationDraft(
            planner="The verified result is D+999.",
            management="Mismatch from the model.",
            logistics="Review the engine output.",
            claims=(NumericClaim("recommended_start", 999, "model:claim"),),
        )


class _NoopTransaction:
    async def __aenter__(self) -> _NoopTransaction:
        return self

    async def __aexit__(self, *_args: object) -> None:
        return None


class _NoopSession:
    def begin(self) -> _NoopTransaction:
        return _NoopTransaction()


def _workflow_input() -> WorkflowInput:
    extraction = {
        "nature": EventNature.REQUEST,
        "cause": "production priority",
        "job_ids": ("A-12",),
        "objective": "Recover A-12 production",
        "requested_start": 5,
        "source_excerpt": SOURCE_TEXT,
    }
    return WorkflowInput(
        extraction=ChangeEventExtraction.model_validate(extraction),
        snapshot=_snapshot(),
        pack=OFFSHORE_PACK,
        as_of=AS_OF,
    )


def _database_settings() -> Settings:
    database_url = os.getenv("RIPPLE_DATABASE_URL")
    if not database_url:
        pytest.skip("set RIPPLE_DATABASE_URL for PostgreSQL API integration fixtures")
    return Settings(environment="test", database_url=database_url)


def _extraction_payload() -> dict[str, Any]:
    return {
        "expected_extraction_version": 0,
        "extraction": {
            "nature": "request",
            "cause": "production priority",
            "job_ids": ["A-12"],
            "objective": "Recover A-12 production",
            "requested_start": 5,
            "eta_updates": [],
            "hard_constraints": [],
            "soft_preferences": [],
            "risk_tags": [],
            "levers_ruled_out": [],
            "missing_info": [],
            "source_excerpt": SOURCE_TEXT,
        },
    }


def _create_started_run(client: TestClient) -> tuple[UUID, UUID]:
    event = client.post(
        "/api/v1/events",
        json={"raw_text": SOURCE_TEXT, "nature": "request"},
    )
    assert event.status_code == 201
    event_id = UUID(event.json()["id"])

    extraction = client.patch(
        f"/api/v1/events/{event_id}/extraction",
        json=_extraction_payload(),
    )
    assert extraction.status_code == 200

    run = client.post(
        f"/api/v1/events/{event_id}/runs",
        headers={"Idempotency-Key": f"int06-{uuid4()}"},
    )
    assert run.status_code == 201
    return event_id, UUID(run.json()["run_id"])


def test_model_unavailable_is_typed_and_never_a_success() -> None:
    gateway = VertexModelGateway(
        _UnavailableStructuredClient(),
        VertexGatewayConfig(
            project="test-project",
            location="us-central1",
            intake=IntakeModelConfig("test-intake-model"),
        ),
    )

    with pytest.raises(ModelGatewayError) as failure:
        asyncio.run(
            gateway.extract_change(
                IntakeRequest(
                    source_text=SOURCE_TEXT,
                    known_job_ids=("A-12",),
                )
            )
        )

    assert failure.value.code == "provider_error"
    assert failure.value.retryable
    assert not isinstance(failure.value, dict)


def test_numeric_mismatch_uses_inspectable_deterministic_fallback() -> None:
    result = asyncio.run(ControlledAgentWorkflow(_MismatchingModel()).run(_workflow_input()))

    assert result.state is WorkflowState.COMPLETE
    assert result.recommended is not None
    assert result.numeric_check.valid
    assert result.evidence
    assert "999" not in result.explanation.planner
    assert "Baseline start" in result.explanation.planner


def test_solver_infeasible_exposes_blockers_without_a_recommendation() -> None:
    infeasible = solve(replace(_request(), target_start=3))
    counterfactual = what_would_it_take(_request(), job_id="A-12", target_start=3)

    assert infeasible.status is SolverRunStatus.INFEASIBLE
    assert not infeasible.feasible
    assert infeasible.snapshot is None
    assert counterfactual.status.value == "impossible"
    assert counterfactual.changes == ()
    assert counterfactual.blockers
    assert all(
        diagnostic.status is SolverRunStatus.INFEASIBLE
        for diagnostic in counterfactual.diagnostics
    )


def test_recorded_demo_fallback_completes_with_a_public_trace(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("MOCK_MODEL_MODE", "full")
    run_id = "11111111-1111-1111-1111-111111111111"

    with TestClient(create_app(Settings(environment="test", database_url=None))) as client:
        response = client.get(f"/api/v1/demo/scenarios/{SCENARIO_ID}/runs/{run_id}/stream")

    assert response.status_code == 200
    assert "event: plan" in response.text
    assert "event: done" in response.text
    assert '"status":"completed"' in response.text
    assert "event: error" not in response.text


def test_database_unavailable_is_typed_and_never_a_success() -> None:
    object_id = "11111111-1111-1111-1111-111111111111"
    with TestClient(create_app(Settings(environment="test", database_url=None))) as client:
        responses = (
            client.post("/api/v1/events", json={"raw_text": SOURCE_TEXT}),
            client.get(f"/api/v1/runs/{object_id}/stream"),
            client.post("/api/v1/demo/reset", json={"scenario_id": SCENARIO_ID}),
        )

    for response in responses:
        assert response.status_code == 503
        assert response.json()["error"]["code"] == "database_unavailable"
        assert response.json()["error"]["retryable"] is True


def test_demo_reset_failure_and_disabled_never_report_success(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setenv("MOCK_MODEL_MODE", "live")
    with pytest.raises(ApplicationError) as disabled:
        asyncio.run(
            DemoService().reset(
                SCENARIO_ID,
                environment="production",
                demo_scenario_id=SCENARIO_ID,
            )
        )
    assert disabled.value.code == "demo_reset_disabled"
    assert disabled.value.status_code == 403

    service = DemoService(cast(AsyncSession, _NoopSession()))
    monkeypatch.setattr(service, "_seed_path", tmp_path / "missing-seed.sql")

    async def skip_delete(_scenario_id: str) -> None:
        return None

    monkeypatch.setattr(service, "_delete_scenario_graph", skip_delete)
    with pytest.raises(ApplicationError) as failure:
        asyncio.run(
            service.reset(
                SCENARIO_ID,
                environment="test",
                demo_scenario_id=SCENARIO_ID,
            )
        )
    assert failure.value.code == "seed_unavailable"
    assert failure.value.status_code == 500


def _finish_run_after_disconnect(run_id: UUID) -> tuple[str, str]:
    async def exercise() -> tuple[str, str]:
        database_url = os.environ["RIPPLE_DATABASE_URL"]
        engine = create_async_engine(database_url)
        factory = create_session_factory(engine)
        try:
            async with factory() as session:
                service = RunService(session)
                await service.publish_event(
                    SCENARIO_ID,
                    run_id,
                    "step",
                    {"summary": "Partial readiness trace is inspectable."},
                    phase="investigation",
                )
                stream = stream_run(factory, SCENARIO_ID, run_id, after_sequence=0)
                started = await anext(stream)
                partial = await anext(stream)
                await cast(Any, stream).aclose()
                await service.finish(
                    SCENARIO_ID,
                    run_id,
                    state="failed",
                    error_code="model_unavailable",
                    summary="The model became unavailable after the partial trace.",
                )
                return started, partial
        finally:
            await engine.dispose()

    return asyncio.run(exercise())


@pytest.mark.skipif(
    not os.getenv("RIPPLE_DATABASE_URL"),
    reason="set RIPPLE_DATABASE_URL for PostgreSQL API integration fixtures",
)
def test_sse_disconnect_replays_partial_trace_without_false_success() -> None:
    with TestClient(create_app(_database_settings())) as client:
        reset = client.post("/api/v1/demo/reset", json={"scenario_id": SCENARIO_ID})
        assert reset.status_code == 200
        try:
            _event_id, run_id = _create_started_run(client)
            started, partial = _finish_run_after_disconnect(run_id)
            resumed = client.get(
                f"/api/v1/runs/{run_id}/stream",
                params={"after": 2},
            )
            detail = client.get(f"/api/v1/runs/{run_id}")
        finally:
            restored = client.post("/api/v1/demo/reset", json={"scenario_id": SCENARIO_ID})
            assert restored.status_code == 200

    assert "event: run_started" in started
    assert "event: step" in partial
    assert "Partial readiness trace is inspectable." in partial
    assert resumed.status_code == 200
    assert "event: error" in resumed.text
    assert "model_unavailable" in resumed.text
    assert "event: done" in resumed.text
    assert '"status":"failed"' in resumed.text
    assert '"status":"completed"' not in resumed.text
    assert detail.status_code == 200
    assert detail.json()["state"] == "failed"
    assert [event["type"] for event in detail.json()["events"]] == [
        "run_started",
        "step",
        "error",
        "done",
    ]
    assert detail.json()["events"][1]["public"]["summary"] == (
        "Partial readiness trace is inspectable."
    )


def _create_stale_plan(event_id: UUID, run_id: UUID, base_version: int) -> tuple[UUID, UUID]:
    async def exercise() -> tuple[UUID, UUID]:
        database_url = os.environ["RIPPLE_DATABASE_URL"]
        engine = create_async_engine(database_url)
        factory = create_session_factory(engine)
        try:
            async with factory() as session:
                created = await PlanService(session).create(
                    SCENARIO_ID,
                    PlanDraft(
                        event_id=event_id,
                        run_id=run_id,
                        verdict="feasible",
                        base_schedule_version=base_version,
                        explanation={"summary": "Stale approval test plan."},
                        options=(
                            PlanOptionDraft(
                                label="Stale approval option",
                                weight_profile="balanced",
                                solver_status="feasible",
                                changes=(),
                                recommended=True,
                            ),
                        ),
                    ),
                )
                option_id = created.recommended_option_id
                assert option_id is not None
                await session.rollback()
                async with session.begin():
                    state = await session.scalar(
                        select(ScheduleState).where(ScheduleState.scenario_id == SCENARIO_ID)
                    )
                    assert state is not None
                    state.version = base_version + 1
                return created.id, option_id
        finally:
            await engine.dispose()

    return asyncio.run(exercise())


@pytest.mark.skipif(
    not os.getenv("RIPPLE_DATABASE_URL"),
    reason="set RIPPLE_DATABASE_URL for PostgreSQL API integration fixtures",
)
def test_stale_approval_is_rejected_with_recompute_context() -> None:
    with TestClient(create_app(_database_settings())) as client:
        reset = client.post("/api/v1/demo/reset", json={"scenario_id": SCENARIO_ID})
        assert reset.status_code == 200
        try:
            event_id, run_id = _create_started_run(client)
            schedule = client.get("/api/v1/schedule")
            assert schedule.status_code == 200
            base_version = schedule.json()["version"]
            plan_id, option_id = _create_stale_plan(event_id, run_id, base_version)

            approval = client.post(
                f"/api/v1/plans/{plan_id}/approve",
                headers={"Idempotency-Key": f"int06-stale-approval-{uuid4()}"},
                json={
                    "option_id": str(option_id),
                    "expected_schedule_version": base_version,
                    "acknowledged_condition_ids": [],
                },
            )
            plan = client.get(f"/api/v1/plans/{plan_id}")
            current_schedule = client.get("/api/v1/schedule")
        finally:
            restored = client.post("/api/v1/demo/reset", json={"scenario_id": SCENARIO_ID})
            assert restored.status_code == 200

    assert approval.status_code == 409
    error = approval.json()["error"]
    assert error["code"] == "schedule_version_conflict"
    assert error["details"] == {
        "expected_version": base_version,
        "current_version": base_version + 1,
    }
    assert plan.status_code == 200
    assert plan.json()["status"] == "proposed"
    assert current_schedule.status_code == 200
    assert current_schedule.json()["version"] == base_version + 1
