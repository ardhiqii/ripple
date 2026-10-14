import asyncio
from collections.abc import Mapping
from decimal import Decimal
from typing import Any

from app.agent.model_gateway import IntakeModelConfig, VertexGatewayConfig, VertexModelGateway
from app.agent.model_gateway_types import IntakeRequest
from app.agent.workflow import (
    ControlledAgentWorkflow,
    VerifiedOption,
    WorkflowInput,
    WorkflowResult,
)
from app.application.schemas import ChangeEventExtraction
from app.domain.policy import OFFSHORE_PACK
from app.solver import CargoRequirement
from tests.solver.test_cpsat import AS_OF, _snapshot

BASE_SOURCE = (
    "A-12 output dropped again, can we move it to this week, D+3 if possible? "
    "Don't touch B-05, the client is inspecting it."
)
TEST_BAY_SENTENCE = "FYI the vendor says the test bay is full until Thursday."
CONSTRAINED_SOURCE = f"{BASE_SOURCE} {TEST_BAY_SENTENCE}"
LOCK_SENTENCE = "Don't touch B-05, the client is inspecting it."


class FakeStructuredClient:
    def __init__(self, responses: tuple[Mapping[str, Any], ...]) -> None:
        self._responses = responses
        self._calls = 0

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
        response = self._responses[min(self._calls, len(self._responses) - 1)]
        self._calls += 1
        return response


def _intake_config() -> VertexGatewayConfig:
    return VertexGatewayConfig(
        project="test-project",
        location="us-central1",
        intake=IntakeModelConfig("test-intake-model"),
    )


def _extraction_payload(
    source: str, *, ruled_out: tuple[str, ...] = ()
) -> dict[str, Any]:
    return {
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
                "source_excerpt": LOCK_SENTENCE,
            }
        ],
        "soft_preferences": ["recover production"],
        "risk_tags": [],
        "levers_ruled_out": [
            {"lever": lever, "source_excerpt": TEST_BAY_SENTENCE}
            for lever in ruled_out
        ],
        "missing_info": [],
        "source_excerpt": source,
    }


def _workflow_input(extraction: ChangeEventExtraction) -> WorkflowInput:
    return WorkflowInput(
        extraction=extraction,
        snapshot=_snapshot(),
        pack=OFFSHORE_PACK,
        cargo_items=(
            CargoRequirement("D-07-drums", Decimal("15"), needed_by_day=11, sailing_day=5),
            CargoRequirement("A-12-pump", Decimal("20"), needed_by_day=5),
        ),
        as_of=AS_OF,
    )


def _a12_start(result: WorkflowResult | VerifiedOption) -> int:
    option = result.recommended if isinstance(result, WorkflowResult) else result
    assert option is not None
    snapshot = option.solve.solve.snapshot
    assert snapshot is not None
    job = next(job for job in snapshot.jobs if job.id == "A-12")
    return job.start_day


def test_a12_constrained_pair_preserves_evidence_and_rules_out_expedite() -> None:
    gateway = VertexModelGateway(
        FakeStructuredClient(
            (
                _extraction_payload(BASE_SOURCE),
                _extraction_payload(CONSTRAINED_SOURCE, ruled_out=("expedite_vendor_test",)),
            )
        ),
        _intake_config(),
    )

    base = asyncio.run(
        gateway.extract_change(
            IntakeRequest(
                source_text=BASE_SOURCE,
                scenario_day=10,
                known_job_ids=("A-12", "B-05"),
            )
        )
    ).extraction
    constrained = asyncio.run(
        gateway.extract_change(
            IntakeRequest(
                source_text=CONSTRAINED_SOURCE,
                scenario_day=10,
                known_job_ids=("A-12", "B-05"),
            )
        )
    ).extraction

    assert TEST_BAY_SENTENCE in constrained.source_excerpt
    assert constrained.levers_ruled_out[0].lever == "expedite_vendor_test"
    assert constrained.levers_ruled_out[0].source_excerpt == TEST_BAY_SENTENCE

    base_result = asyncio.run(ControlledAgentWorkflow().run(_workflow_input(base)))
    constrained_result = asyncio.run(
        ControlledAgentWorkflow().run(_workflow_input(constrained))
    )

    assert _a12_start(base_result) == 5
    assert _a12_start(constrained_result) >= 9
    assert all(
        _a12_start(option_result) >= 9
        for option_result in constrained_result.options
        if option_result.solve.solve.snapshot is not None
    )
    assert "expedite_vendor_test" not in constrained_result.available_levers
    for call in constrained_result.tool_calls:
        if call.name == "optimize":
            assert "expedite_vendor_test" not in call.input["open_levers"]

    base_verdict = (base_result.status.value, _a12_start(base_result))
    constrained_verdict = (
        constrained_result.status.value,
        _a12_start(constrained_result),
    )
    assert constrained_verdict != base_verdict
    assert constrained_result.lever_path != base_result.lever_path
