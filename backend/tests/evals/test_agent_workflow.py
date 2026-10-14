import asyncio
from decimal import Decimal
from typing import Any

import pytest
from app.agent.numeric_checker import ExplanationDraft, NumericClaim
from app.agent.tools import PolicyBoundaryViolation
from app.agent.workflow import (
    ControlledAgentWorkflow,
    DeterministicWorkflowModel,
    ExplanationContext,
    LeverChoiceContext,
    WorkflowInput,
)
from app.application.schemas import (
    ChangeEventExtraction,
    RuledOutLeverExtraction,
)
from app.domain.enums import EventNature
from app.domain.policy import OFFSHORE_PACK
from app.solver.types import CargoRequirement
from tests.solver.test_cpsat import AS_OF, _snapshot


def run(coro: Any) -> Any:
    return asyncio.run(coro)


def extraction(*, ruled_out: tuple[str, ...] = ()) -> ChangeEventExtraction:
    source = "A-12 should move to D+5; vendor test is available."
    return ChangeEventExtraction(
        nature=EventNature.REQUEST,
        cause="production priority",
        job_ids=("A-12",),
        objective="Recover A-12 production",
        requested_start=5,
        eta_updates=(),
        hard_constraints=(),
        soft_preferences=(),
        risk_tags=(),
        levers_ruled_out=tuple(
            RuledOutLeverExtraction(lever=name, source_excerpt=source) for name in ruled_out
        ),
        missing_info=(),
        source_excerpt=source,
    )


def workflow_input(event: ChangeEventExtraction) -> WorkflowInput:
    return WorkflowInput(
        extraction=event,
        snapshot=_snapshot(),
        pack=OFFSHORE_PACK,
        cargo_items=(
            CargoRequirement("D-07-drums", Decimal("15"), needed_by_day=11, sailing_day=5),
            CargoRequirement("A-12-pump", Decimal("20"), needed_by_day=5),
        ),
        as_of=AS_OF,
    )


def test_a12_pair_has_different_policy_filtered_lever_paths() -> None:
    normal = run(ControlledAgentWorkflow().run(workflow_input(extraction())))
    constrained = run(
        ControlledAgentWorkflow().run(
            workflow_input(extraction(ruled_out=("expedite_vendor_test",)))
        )
    )

    assert normal.status.value in {"feasible", "feasible_with_conditions"}
    assert constrained.status.value in {"feasible", "feasible_with_conditions", "infeasible"}
    assert normal.lever_path != constrained.lever_path
    assert "expedite_vendor_test" in normal.available_levers
    assert "expedite_vendor_test" not in constrained.available_levers
    for request in constrained.tool_calls:
        if request.name == "optimize":
            assert "expedite_vendor_test" not in request.input["open_levers"]


def test_forbidden_lever_is_rejected_before_any_solver_request() -> None:
    class ForbiddenModel(DeterministicWorkflowModel):
        async def choose_next_lever(self, context: LeverChoiceContext) -> str | None:
            return "move_locked_job"

    with pytest.raises(PolicyBoundaryViolation):
        run(ControlledAgentWorkflow(ForbiddenModel()).run(workflow_input(extraction())))


def test_numeric_mismatch_falls_back_to_deterministic_explanation() -> None:
    class MismatchingModel(DeterministicWorkflowModel):
        async def explain(self, context: ExplanationContext) -> ExplanationDraft:
            return ExplanationDraft(
                planner="The verified result is D+999.",
                management="Mismatch",
                logistics="Review engine output.",
                claims=(NumericClaim("recommended_start", 999, "model:claim"),),
            )

    result = run(ControlledAgentWorkflow(MismatchingModel()).run(workflow_input(extraction())))

    assert result.numeric_check.valid
    assert result.explanation.planner != "The verified result is D+999."
    assert "999" not in result.explanation.planner


def test_clarification_stops_before_solver() -> None:
    event = extraction()
    event = event.model_copy(
        update={
            "job_ids": (),
            "requested_start": None,
            "objective": None,
            "missing_info": ("job_id",),
        }
    )

    result = run(ControlledAgentWorkflow().run(workflow_input(event)))

    assert result.status.value == "clarification_needed"
    assert result.tool_calls == ()
