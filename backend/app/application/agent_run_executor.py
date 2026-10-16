"""Execute one persisted agent run and publish its verified plan.

RunService only registers a run; this module does the work the stream endpoint
replays: load the pinned extraction and schedule, run the controlled workflow,
persist each tool call as a public trace event, store the plan, and finish the run.
"""

import asyncio
import logging
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import cast
from uuid import UUID

from app.agent.evidence import EvidenceClaim, ToolCallRecord
from app.agent.tools import PolicyBoundaryViolation, ToolBudgetExceeded, solved_start
from app.agent.workflow import (
    ControlledAgentWorkflow,
    VerifiedOption,
    WorkflowInput,
    WorkflowResult,
    WorkflowStatus,
)
from app.application.plan_service import (
    PlanDraft,
    PlanEvidenceDraft,
    PlanOptionDraft,
    PlanService,
    json_value,
)
from app.application.run_service import RunService
from app.application.schemas import ChangeEventExtraction
from app.domain.enums import PlanVerdict, SolverStatus
from app.domain.policy import DomainPack
from app.engine.simulate import ScheduleSnapshot, SimulationResult
from app.persistence.repositories import EventRepository, RunRepository, ScheduleRepository
from app.solver.types import CargoRequirement, SolverRunStatus
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger("ripple.agent_run")

# The run row times out at 60s; finishing earlier keeps the stream's deadline
# check from racing the plan write.
RUN_DEADLINE_SECONDS = 50.0
MAX_PLAN_OPTIONS = 4

_FAILURES: dict[type[Exception], tuple[str, str]] = {
    TimeoutError: ("run_timeout", "The investigation exceeded its time budget."),
    PolicyBoundaryViolation: ("policy_violation", "The run attempted a forbidden lever."),
    ToolBudgetExceeded: ("tool_budget_exceeded", "The run used its full tool budget."),
}
_VERDICTS = {
    WorkflowStatus.FEASIBLE: PlanVerdict.FEASIBLE,
    WorkflowStatus.FEASIBLE_WITH_CONDITIONS: PlanVerdict.FEASIBLE_WITH_CONDITIONS,
    WorkflowStatus.INFEASIBLE: PlanVerdict.INFEASIBLE,
}
_SOLVER_STATUSES = {
    SolverRunStatus.OPTIMAL: SolverStatus.OPTIMAL,
    SolverRunStatus.FEASIBLE: SolverStatus.FEASIBLE,
}
_LEVER_CONDITIONS = {
    "expedite_vendor_test": ("Vendor confirms the expedited function test dates.", True),
    "move_cargo": ("Logistics confirms the cargo re-booking.", False),
    "swap_jobs": ("Owners of the swapped jobs accept their new slots.", False),
}


class RunAbortedError(RuntimeError):
    def __init__(self, code: str, summary: str) -> None:
        super().__init__(summary)
        self.code = code


@dataclass(frozen=True, slots=True)
class _RunInputs:
    event_id: UUID
    extraction: ChangeEventExtraction
    snapshot: ScheduleSnapshot
    cargo: tuple[CargoRequirement, ...]


class AgentRunExecutor:
    def __init__(self, session_factory: Callable[[], AsyncSession], pack: DomainPack) -> None:
        self._session_factory = session_factory
        self._pack = pack

    async def execute(self, scenario_id: str, run_id: UUID) -> None:
        try:
            await asyncio.wait_for(self._execute(scenario_id, run_id), RUN_DEADLINE_SECONDS)
        except RunAbortedError as error:
            await self._fail(scenario_id, run_id, error.code, str(error))
        except tuple(_FAILURES) as error:
            await self._fail(scenario_id, run_id, *_FAILURES[type(error)])
        except Exception as error:
            # The JSON log formatter drops tracebacks, so carry the cause explicitly.
            logger.exception(
                "agent_run.failed",
                extra={"run_id": str(run_id), "error": f"{type(error).__name__}: {error}"[:500]},
            )
            await self._fail(
                scenario_id, run_id, "run_failed", "The investigation could not complete."
            )

    async def _execute(self, scenario_id: str, run_id: UUID) -> None:
        inputs = await self._load(scenario_id, run_id)
        async with self._session_factory() as session:
            await RunService(session).publish_event(
                scenario_id,
                run_id,
                "step",
                {"summary": _intake_summary(inputs.extraction)},
                phase="intake",
            )
        result = await self._run_workflow(scenario_id, run_id, inputs)
        if result.status is WorkflowStatus.CLARIFICATION_NEEDED:
            raise RunAbortedError("missing_information", result.explanation.planner)
        if not await self._is_running(scenario_id, run_id):
            return

        async with self._session_factory() as session:
            plan = await PlanService(session).create(
                scenario_id, _plan_draft(inputs, run_id, result, self._pack)
            )
            summary = _plan_summary(result)
            runs = RunService(session)
            await runs.publish_event(
                scenario_id,
                run_id,
                "plan",
                {
                    "summary": summary,
                    "plan_id": str(plan.id),
                    "verdict": plan.verdict,
                    "lever_path": list(result.lever_path),
                },
                phase="planning",
            )
            await runs.finish(scenario_id, run_id, state="completed", summary=summary)

    async def _load(self, scenario_id: str, run_id: UUID) -> _RunInputs:
        async with self._session_factory() as session:
            run = await RunRepository(session).get(run_id, scenario_id)
            if run is None:
                raise RunAbortedError("unknown_run", "The run no longer exists.")
            extractions = await EventRepository(session).list_extractions(
                run.event_id, scenario_id
            )
            pinned = next(
                (row for row in extractions if row.version == run.extraction_version), None
            )
            if pinned is None:
                raise RunAbortedError(
                    "extraction_required", "The pinned extraction version is missing."
                )
            schedule = ScheduleRepository(session)
            return _RunInputs(
                event_id=run.event_id,
                extraction=ChangeEventExtraction.model_validate(pinned.extracted_json),
                snapshot=await schedule.load_snapshot(scenario_id),
                cargo=await schedule.list_cargo_requirements(scenario_id),
            )

    async def _is_running(self, scenario_id: str, run_id: UUID) -> bool:
        """The stream may have timed the run out while the workflow was solving."""

        async with self._session_factory() as session:
            run = await RunRepository(session).get(run_id, scenario_id)
            return run is not None and run.state == "running"

    async def _run_workflow(
        self, scenario_id: str, run_id: UUID, inputs: _RunInputs
    ) -> WorkflowResult:
        records: asyncio.Queue[ToolCallRecord | None] = asyncio.Queue()
        publisher = asyncio.create_task(self._publish_tool_records(scenario_id, run_id, records))
        try:
            return await ControlledAgentWorkflow().run(
                WorkflowInput(
                    extraction=inputs.extraction,
                    snapshot=inputs.snapshot,
                    pack=self._pack,
                    cargo_items=inputs.cargo,
                    on_tool_record=records.put_nowait,
                )
            )
        finally:
            records.put_nowait(None)
            await publisher

    async def _publish_tool_records(
        self,
        scenario_id: str,
        run_id: UUID,
        records: asyncio.Queue[ToolCallRecord | None],
    ) -> None:
        ordinal = 0
        async with self._session_factory() as session:
            repository = RunRepository(session)
            runs = RunService(session)
            while (record := await records.get()) is not None:
                ordinal += 1
                tool_input = _json_dict(record.input)
                tool_result = _json_dict(record.public_result)
                async with session.begin():
                    await repository.record_tool_call(
                        tool_call_id=record.call_id,
                        run_id=run_id,
                        tool_name=record.name,
                        ordinal=ordinal,
                        sanitized_input=tool_input,
                        sanitized_result=tool_result,
                    )
                await runs.publish_event(
                    scenario_id,
                    run_id,
                    "tool_result",
                    {
                        "summary": _tool_summary(record),
                        "tool": record.name,
                        "tool_call_id": str(record.call_id),
                        "input": tool_input,
                        "result": tool_result,
                    },
                    phase=_tool_phase(record.name),
                )

    async def _fail(self, scenario_id: str, run_id: UUID, code: str, summary: str) -> None:
        try:
            async with self._session_factory() as session:
                await RunService(session).finish(
                    scenario_id, run_id, state="failed", error_code=code, summary=summary
                )
        except Exception:
            logger.exception("agent_run.finish_failed", extra={"run_id": str(run_id)})


def _plan_draft(
    inputs: _RunInputs, run_id: UUID, result: WorkflowResult, pack: DomainPack
) -> PlanDraft:
    focus_job_id = inputs.extraction.job_ids[0]
    tool_call_ids = {record.call_id for record in result.tool_calls}
    options = tuple(
        _option_draft(option, rank, option is result.recommended, focus_job_id, pack)
        for rank, option in enumerate(_distinct_options(result), start=1)
    )
    return PlanDraft(
        event_id=inputs.event_id,
        run_id=run_id,
        verdict=_VERDICTS[result.status].value,
        base_schedule_version=inputs.snapshot.schedule_version,
        explanation={
            "planner": result.explanation.planner,
            "management": result.explanation.management,
            "logistics": result.explanation.logistics,
            "lever_path": list(result.lever_path),
            "numeric_check": {
                "valid": result.numeric_check.valid,
                "mismatches": list(result.numeric_check.mismatches),
            },
        },
        counterfactual=_counterfactual(result),
        evidence=tuple(_evidence_draft(claim, tool_call_ids) for claim in result.evidence),
        options=options,
    )


def _distinct_options(result: WorkflowResult) -> tuple[VerifiedOption, ...]:
    """Recommended first, then each other distinct schedule outcome once."""

    ordered = [result.recommended] if result.recommended is not None else []
    ordered.extend(option for option in result.options if option is not result.recommended)
    seen: set[tuple[object, ...]] = set()
    distinct: list[VerifiedOption] = []
    for option in ordered:
        key = (
            option.solve.solve.feasible,
            tuple(
                sorted(
                    (str(change["kind"]), str(change["target"]), str(change["value"]))
                    for change in option.solve.solve.changes
                )
            ),
        )
        if key in seen:
            continue
        seen.add(key)
        distinct.append(option)
    return tuple(distinct[:MAX_PLAN_OPTIONS])


def _option_draft(
    option: VerifiedOption,
    rank: int,
    recommended: bool,
    focus_job_id: str,
    pack: DomainPack,
) -> PlanOptionDraft:
    solve = option.solve.solve
    simulation = option.solve.simulation
    changes, booking_conditions = _split_changes(solve.changes)
    violations = tuple(
        {"code": violation.kind.value, "summary": violation.evidence}
        for violation in (simulation.violations if simulation is not None else solve.violations)
        if violation.hard
    )
    focus_start = solved_start(solve, focus_job_id)
    return PlanOptionDraft(
        label=_option_label(option, focus_job_id, focus_start),
        weight_profile=option.profile_name,
        solver_status=_SOLVER_STATUSES.get(solve.status, SolverStatus.INFEASIBLE).value,
        objective_value=solve.diagnostics.objective_value,
        solve_milliseconds=solve.diagnostics.wall_time_ms,
        changes=changes,
        conditions=booking_conditions + _lever_conditions(option.levers, pack),
        kpi=_kpi(simulation, changes, booking_conditions, focus_job_id, focus_start),
        violations=violations,
        rank=rank,
        recommended=recommended and not violations,
    )


def _split_changes(
    changes: Sequence[Mapping[str, object]],
) -> tuple[tuple[Mapping[str, object], ...], tuple[Mapping[str, object], ...]]:
    """Approval can only move existing cargo bookings, so a first-time booking
    of unbooked cargo becomes a condition the planner confirms instead."""

    approvable: list[Mapping[str, object]] = []
    conditions: list[Mapping[str, object]] = []
    for change in changes:
        if change["kind"] == "move_cargo" and change.get("from") is None:
            conditions.append(
                {
                    "id": f"book-{change['target']}",
                    "text": f"Book {change['target']} on the D+{change['value']} sailing.",
                    "source": "solver",
                    "approver": "planner",
                    "outside_model": False,
                }
            )
            continue
        approvable.append(dict(change))
    return tuple(approvable), tuple(conditions)


def _lever_conditions(
    levers: Sequence[str], pack: DomainPack
) -> tuple[Mapping[str, object], ...]:
    conditions: list[Mapping[str, object]] = []
    for name in levers:
        lever = pack.action_registry.get(name)
        text, outside_model = _LEVER_CONDITIONS.get(
            name, (f"{_lever_text((name,)).capitalize()} is confirmed.", False)
        )
        conditions.append(
            {
                "id": f"lever-{name}",
                "text": text,
                "source": "action_registry",
                "approver": lever.approval.value if lever.approval is not None else "planner",
                "outside_model": outside_model,
            }
        )
    return tuple(conditions)


def _kpi(
    simulation: SimulationResult | None,
    changes: Sequence[Mapping[str, object]],
    booking_conditions: Sequence[Mapping[str, object]],
    focus_job_id: str,
    focus_start: int | None,
) -> dict[str, object]:
    kpi: dict[str, object] = {
        "focus_job_id": focus_job_id,
        "focus_start": focus_start,
        "readiness_dates_changed": sum(1 for c in changes if c["kind"] == "set_item_date"),
        "resource_changes": sum(1 for c in changes if c["kind"] == "move_cargo")
        + len(booking_conditions),
    }
    if simulation is not None:
        delta = simulation.kpi_delta
        kpi |= {
            "jobs_moved": delta.jobs_moved,
            "total_delay_days": delta.total_delay_days,
            "shortfall_bopd_days": delta.shortfall_bopd_days,
            "max_capacity_overflow": delta.max_capacity_overflow,
        }
    return kpi


def _counterfactual(result: WorkflowResult) -> dict[str, object] | None:
    counterfactual = result.counterfactual
    if counterfactual is None:
        return None
    return {
        "status": counterfactual.status.value,
        "job_id": counterfactual.job_id,
        "target_start": counterfactual.target_start,
        "levers": list(counterfactual.levers),
        "blockers": list(counterfactual.blockers),
    }


def _evidence_draft(claim: EvidenceClaim, tool_call_ids: set[UUID]) -> PlanEvidenceDraft:
    tool_call_id = None
    if claim.source_ref.startswith("tool_call:"):
        try:
            candidate = UUID(claim.source_ref.removeprefix("tool_call:"))
        except ValueError:
            candidate = None
        tool_call_id = candidate if candidate in tool_call_ids else None
    return PlanEvidenceDraft(
        claim_id=claim.claim_id,
        claim_text=claim.text,
        evidence_type=claim.evidence_type,
        tool_call_id=tool_call_id,
    )


def _option_label(option: VerifiedOption, job_id: str, focus_start: int | None) -> str:
    if focus_start is None:
        return f"No feasible schedule for {job_id}"
    if not option.levers:
        return f"Keep {job_id} on D+{focus_start} (no levers)"
    return f"{job_id} on D+{focus_start} via {_lever_text(option.levers)}"


def _lever_text(levers: Iterable[object]) -> str:
    return " + ".join(str(name).replace("_", " ") for name in levers)


def _intake_summary(extraction: ChangeEventExtraction) -> str:
    nature = extraction.nature.value if extraction.nature is not None else "change"
    target = (
        f", target D+{extraction.requested_start}"
        if extraction.requested_start is not None
        else ""
    )
    ruled_out = (
        f"; ruled out by the message: {', '.join(i.lever for i in extraction.levers_ruled_out)}"
        if extraction.levers_ruled_out
        else ""
    )
    return f"Investigating {nature} for {', '.join(extraction.job_ids)}{target}{ruled_out}."


def _plan_summary(result: WorkflowResult) -> str:
    if result.recommended is None:
        return "No feasible plan was found within the allowed levers."
    return result.explanation.planner


def _tool_summary(record: ToolCallRecord) -> str:
    result = record.public_result
    if record.name == "get_schedule":
        return f"Loaded schedule v{result.get('schedule_version')}."
    if record.name == "check_readiness":
        summary = (
            f"Readiness: {result.get('job_id')} can start "
            f"D+{result.get('earliest_feasible_start')} at the earliest"
        )
        target = result.get("target_start")
        if target is not None and not result.get("feasible"):
            summary += f"; D+{target} is not ready in time"
        return summary + "."
    if record.name == "optimize":
        lever_text = _lever_text(record.input.get("open_levers") or ()) or "no levers"
        if record.input.get("purpose") == "profile":
            lever_text += f", {record.input.get('profile')} profile"
        if not result.get("feasible"):
            return f"Solver ({lever_text}): no feasible schedule."
        return (
            f"Solver ({lever_text}): {result.get('focus_job_id')} lands on "
            f"D+{result.get('focus_start')}."
        )
    if record.name == "what_would_it_take":
        return (
            f"Counterfactual for D+{record.input.get('target_start')}: "
            f"{result.get('status')}."
        )
    return f"{_lever_text((record.name,)).capitalize()} completed."


def _tool_phase(tool_name: str) -> str:
    if tool_name in {"get_schedule", "check_readiness", "check_capacity", "check_weather"}:
        return "investigate"
    return "solve"


def _json_dict(value: Mapping[str, object]) -> dict[str, object]:
    return cast(dict[str, object], json_value(value))
