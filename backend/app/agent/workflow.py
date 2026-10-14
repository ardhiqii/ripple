from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from typing import Protocol

from app.agent.evidence import EvidenceClaim, ToolCallRecord, new_claim
from app.agent.numeric_checker import (
    ExplanationDraft,
    NumericChecker,
    NumericCheckResult,
    NumericClaim,
)
from app.agent.tools import (
    PolicyBoundaryViolation,
    SolveToolResult,
    ToolBudgetExceeded,
    WorkflowToolbox,
)
from app.application.schemas import ChangeEventExtraction
from app.domain.policy import DomainPack
from app.engine.simulate import ScheduleSnapshot
from app.solver.types import CargoRequirement, CounterfactualResult


class WorkflowState(StrEnum):
    LOAD_EVENT = "load_event"
    EXTRACT_OR_LOAD = "extract_or_load_extraction"
    REQUIRE_CLARIFICATION = "require_clarification"
    LOAD_POLICY = "load_policy"
    INVESTIGATE = "investigate"
    FRAME_ALLOWED_LEVERS = "frame_allowed_levers"
    BASELINE_SOLVE = "baseline_solve"
    ITERATIVE_LEVER_LOOP = "iterative_lever_loop"
    PROFILE_COMPARISON = "profile_comparison"
    COUNTERFACTUAL_IF_NEEDED = "counterfactual_if_needed"
    VALIDATE_OPTIONS = "validate_options"
    GENERATE_EXPLANATIONS = "generate_explanations"
    NUMERIC_CHECK = "numeric_check"
    COMPLETE = "complete"


class WorkflowStatus(StrEnum):
    FEASIBLE = "feasible"
    FEASIBLE_WITH_CONDITIONS = "feasible_with_conditions"
    INFEASIBLE = "infeasible"
    CLARIFICATION_NEEDED = "clarification_needed"


@dataclass(frozen=True, slots=True)
class WorkflowLimits:
    max_tool_calls: int = 15
    max_lever_solver_calls: int = 5
    max_profile_solves: int = 3
    max_counterfactual_solves: int = 6


@dataclass(frozen=True, slots=True)
class WorkflowInput:
    extraction: ChangeEventExtraction
    snapshot: ScheduleSnapshot
    pack: DomainPack
    cargo_items: tuple[CargoRequirement, ...] = ()
    as_of: datetime | None = None
    limits: WorkflowLimits = WorkflowLimits()


@dataclass(frozen=True, slots=True)
class LeverChoiceContext:
    candidate_levers: tuple[str, ...]
    opened_levers: frozenset[str]
    target_start: int | None
    current_start: int | None
    lever_costs: Mapping[str, Decimal]


@dataclass(frozen=True, slots=True)
class ExplanationContext:
    status: WorkflowStatus
    authoritative_numbers: Mapping[str, object]
    lever_path: tuple[str, ...]
    claims: tuple[EvidenceClaim, ...]


class WorkflowModel(Protocol):
    async def choose_next_lever(self, context: LeverChoiceContext) -> str | None: ...

    async def explain(self, context: ExplanationContext) -> ExplanationDraft: ...


class DeterministicWorkflowModel:
    """Safe fallback model: chooses policy-allowed levers by configured cost only."""

    async def choose_next_lever(self, context: LeverChoiceContext) -> str | None:
        candidates = [
            name for name in context.candidate_levers if name not in context.opened_levers
        ]
        if not candidates:
            return None
        return min(candidates, key=lambda name: (context.lever_costs[name], name))

    async def explain(self, context: ExplanationContext) -> ExplanationDraft:
        numbers = context.authoritative_numbers
        evidence_refs = {claim.claim_id: claim.source_ref for claim in context.claims}
        claims = tuple(
            NumericClaim(field, value, evidence_refs.get(field, "workflow:engine"))
            for field, value in numbers.items()
            if isinstance(value, (int, Decimal)) and not isinstance(value, bool)
        )
        baseline = numbers.get("baseline_start")
        recommended = numbers.get("recommended_start")
        planner = (
            f"Baseline start D+{baseline}; recommended start D+{recommended}."
            if baseline is not None and recommended is not None
            else "The engine returned a verified schedule result."
        )
        management = (
            f"Verified status: {context.status.value}; lever path: "
            f"{', '.join(context.lever_path) if context.lever_path else 'baseline'}."
        )
        logistics = "All listed conditions come from deterministic tool results."
        return ExplanationDraft(planner, management, logistics, claims)


@dataclass(frozen=True, slots=True)
class LeverDecision:
    lever: str
    opened_levers: tuple[str, ...]
    actual_start: int | None
    feasible: bool


@dataclass(frozen=True, slots=True)
class VerifiedOption:
    label: str
    profile_name: str
    levers: tuple[str, ...]
    solve: SolveToolResult


@dataclass(frozen=True, slots=True)
class WorkflowResult:
    state: WorkflowState
    states: tuple[WorkflowState, ...]
    status: WorkflowStatus
    available_levers: tuple[str, ...]
    lever_path: tuple[str, ...]
    lever_decisions: tuple[LeverDecision, ...]
    options: tuple[VerifiedOption, ...]
    recommended: VerifiedOption | None
    counterfactual: CounterfactualResult | None
    evidence: tuple[EvidenceClaim, ...]
    tool_calls: tuple[ToolCallRecord, ...]
    explanation: ExplanationDraft
    numeric_check: NumericCheckResult


class ControlledAgentWorkflow:
    """Deterministic controller around one injectable agent model."""

    def __init__(
        self,
        model: WorkflowModel | None = None,
        *,
        numeric_checker: NumericChecker | None = None,
    ) -> None:
        self._model = model or DeterministicWorkflowModel()
        self._numeric_checker = numeric_checker or NumericChecker()

    async def run(self, workflow_input: WorkflowInput) -> WorkflowResult:
        extraction = workflow_input.extraction
        if extraction.missing_info or not extraction.job_ids:
            explanation = ExplanationDraft(
                planner="Clarification is required before optimization.",
                management="No solver call was made because the event is ambiguous.",
                logistics="Provide the missing fields and start a new extraction version.",
            )
            return WorkflowResult(
                state=WorkflowState.REQUIRE_CLARIFICATION,
                states=(
                    WorkflowState.LOAD_EVENT,
                    WorkflowState.EXTRACT_OR_LOAD,
                    WorkflowState.REQUIRE_CLARIFICATION,
                ),
                status=WorkflowStatus.CLARIFICATION_NEEDED,
                available_levers=(),
                lever_path=(),
                lever_decisions=(),
                options=(),
                recommended=None,
                counterfactual=None,
                evidence=(),
                tool_calls=(),
                explanation=explanation,
                numeric_check=NumericCheckResult(True, ()),
            )

        focus_job_id = extraction.job_ids[0]
        if focus_job_id not in {job.id for job in workflow_input.snapshot.jobs}:
            raise PolicyBoundaryViolation(f"unknown focus job: {focus_job_id}")
        toolbox = WorkflowToolbox(
            workflow_input.snapshot,
            workflow_input.pack,
            extraction,
            cargo_items=workflow_input.cargo_items,
            as_of=workflow_input.as_of,
            max_tool_calls=workflow_input.limits.max_tool_calls,
            max_lever_solver_calls=workflow_input.limits.max_lever_solver_calls,
            max_profile_solves=workflow_input.limits.max_profile_solves,
            max_counterfactual_solves=workflow_input.limits.max_counterfactual_solves,
        )
        try:
            toolbox.get_schedule()
            target_start = extraction.requested_start
            readiness = toolbox.check_readiness(focus_job_id, target_start)
            available = toolbox.available_levers
            lever_costs = {
                name: toolbox.pack.action_registry.get(name).cost_weight for name in available
            }
            baseline = await toolbox.optimize(frozenset())
            options = [
                VerifiedOption(
                    "baseline",
                    toolbox.pack.default_weight_profile,
                    (),
                    baseline,
                )
            ]
            decisions: list[LeverDecision] = []
            opened: set[str] = set()
            current = baseline
            while (
                target_start is not None
                and (current_start := _actual_start(current, focus_job_id)) is not None
                and current_start > target_start
            ):
                choice = await self._model.choose_next_lever(
                    LeverChoiceContext(
                        candidate_levers=available,
                        opened_levers=frozenset(opened),
                        target_start=target_start,
                        current_start=_actual_start(current, focus_job_id),
                        lever_costs=lever_costs,
                    )
                )
                if choice is None:
                    break
                if choice not in set(available) or choice in opened:
                    raise PolicyBoundaryViolation(
                        f"agent selected unavailable lever: {choice}"
                    )
                opened.add(choice)
                current = await toolbox.optimize(frozenset(opened))
                options.append(
                    VerifiedOption(
                        f"lever_path_{len(opened)}",
                        toolbox.pack.default_weight_profile,
                        tuple(sorted(opened)),
                        current,
                    )
                )
                decisions.append(
                    LeverDecision(
                        choice,
                        tuple(sorted(opened)),
                        _actual_start(current, focus_job_id),
                        current.solve.feasible,
                    )
                )

            profile_options = await self._profile_options(toolbox, frozenset(opened))
            options.extend(profile_options)
            recommended = _select_recommended(options, focus_job_id, target_start)
            counterfactual = None
            if (
                target_start is not None
                and recommended is not None
                and (recommended_start := _actual_start(recommended.solve, focus_job_id))
                is not None
                and recommended_start > target_start
            ):
                try:
                    counterfactual = await toolbox.counterfactual(
                        job_id=focus_job_id, target_start=target_start
                    )
                except ToolBudgetExceeded:
                    counterfactual = None
            status = _workflow_status(recommended, focus_job_id, target_start)
            numbers = _authoritative_numbers(
                workflow_input.snapshot,
                focus_job_id,
                baseline,
                recommended,
                target_start,
            )
            claims = _claims(
                baseline,
                recommended,
                readiness,
                toolbox.records,
                focus_job_id,
                numbers,
            )
            context = ExplanationContext(status, numbers, tuple(sorted(opened)), claims)
            draft = await self._model.explain(context)
            numeric_check = self._numeric_checker.check(draft, numbers)
            if not numeric_check.valid:
                draft = _deterministic_fallback(context)
                numeric_check = self._numeric_checker.check(draft, numbers)
            return WorkflowResult(
                state=WorkflowState.COMPLETE,
                states=(
                    WorkflowState.LOAD_EVENT,
                    WorkflowState.EXTRACT_OR_LOAD,
                    WorkflowState.LOAD_POLICY,
                    WorkflowState.INVESTIGATE,
                    WorkflowState.FRAME_ALLOWED_LEVERS,
                    WorkflowState.BASELINE_SOLVE,
                    WorkflowState.ITERATIVE_LEVER_LOOP,
                    WorkflowState.PROFILE_COMPARISON,
                    WorkflowState.COUNTERFACTUAL_IF_NEEDED,
                    WorkflowState.VALIDATE_OPTIONS,
                    WorkflowState.GENERATE_EXPLANATIONS,
                    WorkflowState.NUMERIC_CHECK,
                    WorkflowState.COMPLETE,
                ),
                status=status,
                available_levers=available,
                lever_path=tuple(sorted(opened)),
                lever_decisions=tuple(decisions),
                options=tuple(options),
                recommended=recommended,
                counterfactual=counterfactual,
                evidence=claims,
                tool_calls=toolbox.records,
                explanation=draft,
                numeric_check=numeric_check,
            )
        finally:
            toolbox.close()

    async def _profile_options(
        self, toolbox: WorkflowToolbox, open_levers: frozenset[str]
    ) -> tuple[VerifiedOption, ...]:
        names = tuple(
            name
            for name in ("production_first", "stability_first", "lowest_risk")
            if name in toolbox.pack.weight_profiles
        )
        results: list[VerifiedOption] = []
        for profile_name in names:
            result = await toolbox.optimize(
                open_levers,
                profile_name=profile_name,
                purpose="profile",
            )
            results.append(
                VerifiedOption(
                    f"profile_{profile_name}", profile_name, tuple(sorted(open_levers)), result
                )
            )
        return tuple(results)


def _actual_start(result: SolveToolResult, job_id: str) -> int | None:
    if result.solve.snapshot is None:
        return None
    return next((job.start_day for job in result.solve.snapshot.jobs if job.id == job_id), None)


def _select_recommended(
    options: Sequence[VerifiedOption], job_id: str, target_start: int | None
) -> VerifiedOption | None:
    feasible = [option for option in options if option.solve.solve.feasible]
    if not feasible:
        return None

    def option_key(option: VerifiedOption) -> tuple[object, ...]:
        actual_start = _actual_start(option.solve, job_id)
        simulation = option.solve.simulation
        kpi = simulation.kpi_delta if simulation is not None else None
        return (
            actual_start if actual_start is not None else 2**31,
            kpi.shortfall_bopd_days if kpi is not None else Decimal("Infinity"),
            kpi.max_capacity_overflow if kpi is not None else Decimal("Infinity"),
            len(option.levers),
            option.label,
        )

    return min(
        feasible,
        key=option_key,
    )


def _workflow_status(
    recommended: VerifiedOption | None, job_id: str, target_start: int | None
) -> WorkflowStatus:
    if recommended is None:
        return WorkflowStatus.INFEASIBLE
    if target_start is None:
        return WorkflowStatus.FEASIBLE
    actual = _actual_start(recommended.solve, job_id)
    return (
        WorkflowStatus.FEASIBLE
        if actual is not None and actual <= target_start
        else WorkflowStatus.FEASIBLE_WITH_CONDITIONS
    )


def _claims(
    baseline: SolveToolResult,
    recommended: VerifiedOption | None,
    readiness: Mapping[str, object],
    records: Sequence[ToolCallRecord],
    job_id: str,
    authoritative_numbers: Mapping[str, object],
) -> tuple[EvidenceClaim, ...]:
    readiness_ref = next(
        (f"tool_call:{record.call_id}" for record in records if record.name == "check_readiness"),
        "tool_call:check_readiness",
    )
    claims = [
        new_claim(
            "readiness",
            f"Readiness was checked for {job_id}.",
            readiness_ref,
        )
    ]
    baseline_ref = next(
        (f"tool_call:{record.call_id}" for record in records if record.name == "optimize"),
        "tool_call:baseline",
    )
    claims.append(new_claim("baseline", "Baseline came from the solver.", baseline_ref))
    if recommended is not None:
        claims.append(
            new_claim(
                "recommended",
                f"Recommended option is {recommended.label}.",
                f"tool_call:{records[-1].call_id}" if records else "tool_call:solver",
            )
        )
    for field in authoritative_numbers:
        claims.append(
            new_claim(
                field,
                f"{field} is supplied by the deterministic engine.",
                baseline_ref,
            )
        )
    return tuple(claims)


def _authoritative_numbers(
    snapshot: ScheduleSnapshot,
    job_id: str,
    baseline: SolveToolResult,
    recommended: VerifiedOption | None,
    target_start: int | None,
) -> dict[str, object]:
    baseline_start = _actual_start(baseline, job_id)
    recommended_start = _actual_start(recommended.solve, job_id) if recommended else None
    simulation = recommended.solve.simulation if recommended else None
    result: dict[str, object] = {
        "baseline_start": baseline_start,
        "recommended_start": recommended_start,
        "target_start": target_start,
        "schedule_version": snapshot.schedule_version,
        "jobs_moved": simulation.kpi_delta.jobs_moved if simulation else 0,
        "total_delay_days": simulation.kpi_delta.total_delay_days if simulation else 0,
        "shortfall_bopd_days": (
            simulation.kpi_delta.shortfall_bopd_days if simulation else Decimal("0")
        ),
        "max_capacity_overflow": (
            simulation.kpi_delta.max_capacity_overflow if simulation else Decimal("0")
        ),
    }
    return {key: value for key, value in result.items() if value is not None}


def _deterministic_fallback(context: ExplanationContext) -> ExplanationDraft:
    numbers = context.authoritative_numbers
    evidence_refs = {claim.claim_id: claim.source_ref for claim in context.claims}
    claims = tuple(
        NumericClaim(field, value, evidence_refs.get(field, "workflow:engine"))
        for field, value in numbers.items()
        if isinstance(value, (int, Decimal)) and not isinstance(value, bool)
    )
    baseline = numbers.get("baseline_start")
    recommended = numbers.get("recommended_start")
    planner = (
        f"Baseline start D+{baseline}; recommended start D+{recommended}."
        if baseline is not None and recommended is not None
        else "The engine returned a verified schedule result."
    )
    management = f"Verified status: {context.status.value}."
    logistics = "The recommendation is derived from deterministic schedule and policy checks."
    return ExplanationDraft(planner, management, logistics, claims)
