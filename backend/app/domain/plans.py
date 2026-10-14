from collections.abc import Mapping
from dataclasses import dataclass, field
from decimal import Decimal
from uuid import UUID, uuid4

from app.domain.enums import PlanStatus, PlanVerdict, SolverStatus
from app.domain.errors import InvalidEntityError


@dataclass(frozen=True, slots=True)
class PlanOption:
    plan_id: UUID
    label: str
    solver_status: SolverStatus
    changes: tuple[Mapping[str, object], ...] = ()
    conditions: tuple[str, ...] = ()
    kpi: Mapping[str, Decimal] = field(default_factory=dict)
    violations: tuple[Mapping[str, object], ...] = ()
    rank: int = 1
    recommended: bool = False
    option_id: UUID = field(default_factory=uuid4)

    def __post_init__(self) -> None:
        if not self.label.strip() or self.rank < 1:
            raise InvalidEntityError("plan option label is required and rank must be positive")
        if self.recommended and self.solver_status is SolverStatus.INFEASIBLE:
            raise InvalidEntityError("an infeasible option cannot be recommended")


@dataclass(frozen=True, slots=True)
class Plan:
    event_id: UUID
    run_id: UUID
    version: int
    verdict: PlanVerdict
    base_schedule_version: int
    status: PlanStatus = PlanStatus.PROPOSED
    recommended_option_id: UUID | None = None
    explanation: Mapping[str, object] = field(default_factory=dict)
    counterfactual: Mapping[str, object] = field(default_factory=dict)
    supersedes_plan_id: UUID | None = None
    plan_id: UUID = field(default_factory=uuid4)

    def __post_init__(self) -> None:
        if self.version < 1 or self.base_schedule_version < 0:
            raise InvalidEntityError(
                "plan version must be positive and schedule version non-negative"
            )


@dataclass(frozen=True, slots=True)
class PlanEvidence:
    plan_id: UUID
    claim_id: str
    claim_text: str
    evidence_type: str
    tool_call_id: UUID | None = None

    def __post_init__(self) -> None:
        if not self.claim_id.strip() or not self.claim_text.strip():
            raise InvalidEntityError("plan evidence requires claim id and text")
