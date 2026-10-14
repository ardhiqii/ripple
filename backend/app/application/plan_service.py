from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

from app.application.errors import ApplicationError
from app.application.schemas import ApiModel
from app.domain.enums import DecisionAction, PlanStatus, PlanVerdict, SolverStatus
from app.persistence.models import Decision, DecisionChange, Plan, PlanEvidence, PlanOption
from app.persistence.repositories import (
    DecisionRepository,
    EventRepository,
    PlanReadBundle,
    PlanRepository,
    RunRepository,
)
from app.security.input_boundary import InputBoundaryError, decode_cursor, encode_cursor
from sqlalchemy.ext.asyncio import AsyncSession


@dataclass(frozen=True, slots=True)
class PlanOptionDraft:
    label: str
    weight_profile: Mapping[str, object] | str
    solver_status: str
    objective_value: Decimal | float | int | None = None
    solve_milliseconds: int | None = None
    changes: tuple[Mapping[str, object], ...] = ()
    conditions: tuple[object, ...] = ()
    kpi: Mapping[str, object] = field(default_factory=dict)
    violations: tuple[Mapping[str, object], ...] = ()
    rank: int = 1
    recommended: bool = False
    option_id: UUID = field(default_factory=uuid4)


@dataclass(frozen=True, slots=True)
class PlanEvidenceDraft:
    claim_id: str
    claim_text: str
    evidence_type: str
    tool_call_id: UUID | None = None


@dataclass(frozen=True, slots=True)
class PlanDraft:
    event_id: UUID
    run_id: UUID
    verdict: str
    base_schedule_version: int
    explanation: Mapping[str, object]
    options: tuple[PlanOptionDraft, ...]
    evidence: tuple[PlanEvidenceDraft, ...] = ()
    counterfactual: Mapping[str, object] | None = None
    recommended_option_id: UUID | None = None
    supersedes_plan_id: UUID | None = None


class PlanOptionResponse(ApiModel):
    id: UUID
    plan_id: UUID
    label: str
    weight_profile: dict[str, Any]
    solver_status: str
    objective_value: Decimal | None
    solve_milliseconds: int | None
    changes: tuple[dict[str, Any], ...]
    conditions: tuple[Any, ...]
    kpi: dict[str, Any]
    violations: tuple[dict[str, Any], ...]
    rank: int
    is_recommended: bool


class PlanEvidenceResponse(ApiModel):
    plan_id: UUID
    claim_id: str
    claim_text: str
    tool_call_id: UUID | None
    evidence_type: str


class PlanLineageResponse(ApiModel):
    id: UUID
    event_id: UUID
    run_id: UUID
    version: int
    verdict: str
    status: str
    supersedes_plan_id: UUID | None
    created_at: datetime


class PlanDetailResponse(ApiModel):
    id: UUID
    event_id: UUID
    run_id: UUID
    version: int
    verdict: str
    recommended_option_id: UUID | None
    base_schedule_version: int
    explanation: dict[str, Any]
    counterfactual: dict[str, Any] | None
    status: str
    created_at: datetime
    options: tuple[PlanOptionResponse, ...]
    evidence: tuple[PlanEvidenceResponse, ...]
    lineage: tuple[PlanLineageResponse, ...]


class DecisionSummaryResponse(ApiModel):
    id: UUID
    plan_id: UUID
    selected_option_id: UUID | None
    action: str
    actor: str
    reason: str | None
    category: str | None
    acknowledged_condition_ids: tuple[str, ...]
    schedule_version_before: int | None
    schedule_version_after: int | None
    created_at: datetime


class DecisionChangeResponse(ApiModel):
    decision_id: UUID
    entity_type: str
    entity_id: str
    field: str
    change_kind: str
    before: dict[str, Any]
    after: dict[str, Any]


class DecisionDetailResponse(DecisionSummaryResponse):
    changes: tuple[DecisionChangeResponse, ...]


class DecisionListResponse(ApiModel):
    decisions: tuple[DecisionSummaryResponse, ...]
    next_cursor: str | None


class PlanService:
    """Persist immutable plan versions and expose scenario-scoped audit reads."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, scenario_id: str, draft: PlanDraft) -> PlanDetailResponse:
        verdict = self._parse_verdict(draft.verdict)
        recommended_option_id = self._validate_draft(draft)
        async with self._session.begin():
            event = await EventRepository(self._session).get(
                draft.event_id, scenario_id, for_update=True
            )
            if event is None:
                raise self._not_found("event", draft.event_id)
            run = await RunRepository(self._session).get(draft.run_id, scenario_id)
            if run is None or run.event_id != draft.event_id:
                raise self._not_found("run", draft.run_id)

            repository = PlanRepository(self._session)
            superseded = None
            if draft.supersedes_plan_id is not None:
                superseded = await repository.get_full(draft.supersedes_plan_id, scenario_id)
                if superseded is None or superseded.plan.event_id != draft.event_id:
                    raise ApplicationError(
                        422,
                        "invalid_plan_lineage",
                        "A replacement plan must supersede a plan in the same event lineage.",
                        details={"supersedes_plan_id": str(draft.supersedes_plan_id)},
                    )

            plan_id = uuid4()
            option_values = tuple(
                {
                    "id": option.option_id,
                    "label": option.label.strip(),
                    "weight_profile": self._weight_profile(option.weight_profile),
                    "solver_status": option.solver_status,
                    "objective_value": option.objective_value,
                    "solve_milliseconds": option.solve_milliseconds,
                    "changes": self._json_value(option.changes),
                    "conditions": self._json_value(option.conditions),
                    "kpi": self._json_value(option.kpi),
                    "violations": self._json_value(option.violations),
                    "rank": option.rank,
                    "is_recommended": option.option_id == recommended_option_id,
                }
                for option in draft.options
            )
            evidence_values = tuple(
                {
                    "claim_id": evidence.claim_id.strip(),
                    "claim_text": evidence.claim_text.strip(),
                    "tool_call_id": evidence.tool_call_id,
                    "evidence_type": evidence.evidence_type,
                }
                for evidence in draft.evidence
            )
            await repository.create_plan(
                plan_values={
                    "id": plan_id,
                    "event_id": draft.event_id,
                    "run_id": draft.run_id,
                    "version": await repository.next_version(draft.event_id, scenario_id),
                    "verdict": verdict.value,
                    "recommended_option_id": recommended_option_id,
                    "base_schedule_version": draft.base_schedule_version,
                    "explanation": self._json_value(draft.explanation),
                    "counterfactual": (
                        self._json_value(draft.counterfactual)
                        if draft.counterfactual is not None
                        else None
                    ),
                    "status": PlanStatus.PROPOSED.value,
                    "supersedes_plan_id": draft.supersedes_plan_id,
                },
                option_values=option_values,
                evidence_values=evidence_values,
            )
            if draft.supersedes_plan_id is not None and superseded is not None:
                await repository.mark_superseded(draft.supersedes_plan_id, scenario_id)

        return await self.detail(scenario_id, plan_id)

    async def detail(self, scenario_id: str, plan_id: UUID) -> PlanDetailResponse:
        bundle = await PlanRepository(self._session).get_full(plan_id, scenario_id)
        if bundle is None:
            raise self._not_found("plan", plan_id)
        return self._plan_response(bundle)

    async def list_decisions(
        self,
        scenario_id: str,
        *,
        action: DecisionAction | None,
        plan_id: UUID | None,
        limit: int,
        after: str | None,
    ) -> DecisionListResponse:
        after_created_at: datetime | None = None
        after_id: UUID | None = None
        if after is not None:
            try:
                after_created_at, after_id = decode_cursor(after)
            except InputBoundaryError as exc:
                raise ApplicationError(422, "validation_error", str(exc)) from exc
        rows = await DecisionRepository(self._session).list_for_scenario(
            scenario_id,
            action=action.value if action is not None else None,
            plan_id=plan_id,
            after_created_at=after_created_at,
            after_id=after_id,
            limit=limit + 1,
        )
        visible = rows[:limit]
        next_cursor = None
        if len(rows) > limit and visible:
            last = visible[-1]
            next_cursor = encode_cursor(last.created_at, last.id)
        return DecisionListResponse(
            decisions=tuple(self._decision_summary(row) for row in visible),
            next_cursor=next_cursor,
        )

    async def decision_detail(
        self, scenario_id: str, decision_id: UUID
    ) -> DecisionDetailResponse:
        bundle = await DecisionRepository(self._session).get_read(decision_id, scenario_id)
        if bundle is None:
            raise self._not_found("decision", decision_id)
        summary = self._decision_summary(bundle.decision)
        return DecisionDetailResponse(
            **summary.model_dump(),
            changes=tuple(self._decision_change_response(row) for row in bundle.changes),
        )

    @staticmethod
    def _validate_draft(draft: PlanDraft) -> UUID | None:
        if draft.base_schedule_version < 0:
            raise ApplicationError(
                422, "validation_error", "Base schedule version cannot be negative."
            )
        if not draft.options:
            raise ApplicationError(
                422, "validation_error", "A plan must contain at least one option."
            )
        option_ids = [option.option_id for option in draft.options]
        if len(set(option_ids)) != len(option_ids):
            raise ApplicationError(422, "validation_error", "Plan option IDs must be unique.")
        ranks = [option.rank for option in draft.options]
        if any(rank < 1 for rank in ranks) or len(set(ranks)) != len(ranks):
            raise ApplicationError(
                422,
                "validation_error",
                "Plan option ranks must be unique and positive.",
            )
        for option in draft.options:
            if not option.label.strip():
                raise ApplicationError(422, "validation_error", "Plan option labels are required.")
            if option.solve_milliseconds is not None and option.solve_milliseconds < 0:
                raise ApplicationError(
                    422,
                    "validation_error",
                    "Plan solve time cannot be negative.",
                )
            try:
                SolverStatus(option.solver_status)
            except ValueError as exc:
                raise ApplicationError(422, "validation_error", "Invalid solver status.") from exc
        marked = [option.option_id for option in draft.options if option.recommended]
        recommended_option_id = draft.recommended_option_id
        if recommended_option_id is not None and recommended_option_id not in option_ids:
            raise ApplicationError(
                422,
                "validation_error",
                "The recommended option must belong to the plan.",
            )
        if len(marked) > 1 or (
            recommended_option_id is not None and marked and marked != [recommended_option_id]
        ):
            raise ApplicationError(
                422,
                "validation_error",
                "A plan can have only one recommended option.",
            )
        if recommended_option_id is None and marked:
            recommended_option_id = marked[0]
        recommended = next(
            (option for option in draft.options if option.option_id == recommended_option_id),
            None,
        )
        if recommended is not None:
            if recommended.solver_status == SolverStatus.INFEASIBLE.value:
                raise ApplicationError(
                    422,
                    "invalid_recommended_option",
                    "An infeasible option cannot be recommended.",
                )
            if recommended.violations:
                raise ApplicationError(
                    422,
                    "invalid_recommended_option",
                    "A recommended option cannot contain violations.",
                )
        claim_ids = [evidence.claim_id.strip() for evidence in draft.evidence]
        if any(not claim_id for claim_id in claim_ids) or len(set(claim_ids)) != len(claim_ids):
            raise ApplicationError(
                422,
                "validation_error",
                "Evidence claim IDs must be unique and non-empty.",
            )
        if any(not evidence.claim_text.strip() for evidence in draft.evidence):
            raise ApplicationError(422, "validation_error", "Evidence claim text is required.")
        return recommended_option_id

    @staticmethod
    def _parse_verdict(value: str) -> PlanVerdict:
        try:
            return PlanVerdict(value)
        except ValueError as exc:
            raise ApplicationError(422, "validation_error", "Invalid plan verdict.") from exc

    @staticmethod
    def _weight_profile(value: Mapping[str, object] | str) -> dict[str, object]:
        if isinstance(value, str):
            return {"name": value}
        return PlanService._mapping(PlanService._json_value(value))

    @staticmethod
    def _json_value(value: object) -> object:
        if isinstance(value, Decimal):
            return float(value)
        if isinstance(value, UUID):
            return str(value)
        if isinstance(value, Mapping):
            return {str(key): PlanService._json_value(nested) for key, nested in value.items()}
        if isinstance(value, (list, tuple)):
            return [PlanService._json_value(nested) for nested in value]
        return value

    @staticmethod
    def _plan_response(bundle: PlanReadBundle) -> PlanDetailResponse:
        return PlanDetailResponse(
            id=bundle.plan.id,
            event_id=bundle.plan.event_id,
            run_id=bundle.plan.run_id,
            version=bundle.plan.version,
            verdict=bundle.plan.verdict,
            recommended_option_id=bundle.plan.recommended_option_id,
            base_schedule_version=bundle.plan.base_schedule_version,
            explanation=PlanService._mapping(bundle.plan.explanation),
            counterfactual=(
                PlanService._mapping(bundle.plan.counterfactual)
                if bundle.plan.counterfactual is not None
                else None
            ),
            status=bundle.plan.status,
            created_at=bundle.plan.created_at or datetime.now(UTC),
            options=tuple(PlanService._option_response(row) for row in bundle.options),
            evidence=tuple(PlanService._evidence_response(row) for row in bundle.evidence),
            lineage=tuple(PlanService._lineage_response(row) for row in bundle.lineage),
        )

    @staticmethod
    def _option_response(row: PlanOption) -> PlanOptionResponse:
        return PlanOptionResponse(
            id=row.id,
            plan_id=row.plan_id,
            label=row.label,
            weight_profile=PlanService._mapping(row.weight_profile),
            solver_status=row.solver_status,
            objective_value=row.objective_value,
            solve_milliseconds=row.solve_milliseconds,
            changes=PlanService._mappings(row.changes),
            conditions=PlanService._sequence(row.conditions),
            kpi=PlanService._mapping(row.kpi),
            violations=PlanService._mappings(row.violations),
            rank=row.rank,
            is_recommended=row.is_recommended,
        )

    @staticmethod
    def _evidence_response(row: PlanEvidence) -> PlanEvidenceResponse:
        return PlanEvidenceResponse(
            plan_id=row.plan_id,
            claim_id=row.claim_id,
            claim_text=row.claim_text,
            tool_call_id=row.tool_call_id,
            evidence_type=row.evidence_type,
        )

    @staticmethod
    def _lineage_response(row: Plan) -> PlanLineageResponse:
        return PlanLineageResponse(
            id=row.id,
            event_id=row.event_id,
            run_id=row.run_id,
            version=row.version,
            verdict=row.verdict,
            status=row.status,
            supersedes_plan_id=row.supersedes_plan_id,
            created_at=row.created_at or datetime.now(UTC),
        )

    @staticmethod
    def _decision_summary(row: Decision) -> DecisionSummaryResponse:
        condition_ids = row.acknowledged_condition_ids
        if not isinstance(condition_ids, list):
            condition_ids = []
        return DecisionSummaryResponse(
            id=row.id,
            plan_id=row.plan_id,
            selected_option_id=row.selected_option_id,
            action=row.action,
            actor=row.actor,
            reason=row.reason,
            category=row.category,
            acknowledged_condition_ids=tuple(str(value) for value in condition_ids),
            schedule_version_before=row.schedule_version_before,
            schedule_version_after=row.schedule_version_after,
            created_at=row.created_at or datetime.now(UTC),
        )

    @staticmethod
    def _decision_change_response(row: DecisionChange) -> DecisionChangeResponse:
        return DecisionChangeResponse(
            decision_id=row.decision_id,
            entity_type=row.entity_type,
            entity_id=row.entity_id,
            field=row.field,
            change_kind=row.change_kind,
            before=PlanService._mapping(row.before_value),
            after=PlanService._mapping(row.after_value),
        )

    @staticmethod
    def _mapping(value: object) -> dict[str, Any]:
        return dict(value) if isinstance(value, Mapping) else {}

    @staticmethod
    def _mappings(value: object) -> tuple[dict[str, Any], ...]:
        if not isinstance(value, list):
            return ()
        return tuple(dict(item) for item in value if isinstance(item, Mapping))

    @staticmethod
    def _sequence(value: object) -> tuple[Any, ...]:
        return tuple(value) if isinstance(value, list) else ()

    @staticmethod
    def _not_found(entity: str, entity_id: UUID) -> ApplicationError:
        return ApplicationError(
            404,
            "unknown_entity",
            f"The requested {entity} does not exist in this scenario.",
            details={f"{entity}_id": str(entity_id)},
        )


__all__ = [
    "DecisionChangeResponse",
    "DecisionDetailResponse",
    "DecisionListResponse",
    "DecisionSummaryResponse",
    "PlanDetailResponse",
    "PlanDraft",
    "PlanEvidenceDraft",
    "PlanEvidenceResponse",
    "PlanLineageResponse",
    "PlanOptionDraft",
    "PlanOptionResponse",
    "PlanService",
]
