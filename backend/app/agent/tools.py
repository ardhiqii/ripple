from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, replace
from datetime import datetime
from decimal import Decimal
from itertools import combinations

from app.agent.evidence import ToolCallRecord, call_id
from app.application.schemas import ChangeEventExtraction
from app.domain.errors import InvalidEntityError
from app.domain.policy import ActionRegistry, DomainPack
from app.engine.capacity import calculate_all_capacity
from app.engine.readiness import check_readiness
from app.engine.simulate import (
    Change,
    ChangeKind,
    ScheduleSnapshot,
    SimulationResult,
    _kpi_delta,
    simulate,
)
from app.engine.weather import assess_weather
from app.solver import BoundedSolverWorker
from app.solver.types import (
    CargoRequirement,
    CounterfactualResult,
    CounterfactualStatus,
    SolveRequest,
    SolveResult,
)


@dataclass(frozen=True, slots=True)
class SolveToolResult:
    solve: SolveResult
    simulation: SimulationResult | None


class ToolBudgetExceeded(RuntimeError):
    pass


class PolicyBoundaryViolation(RuntimeError):
    pass


class WorkflowToolbox:
    """Read/analysis tools exposed to one controlled workflow."""

    def __init__(
        self,
        snapshot: ScheduleSnapshot,
        pack: DomainPack,
        extraction: ChangeEventExtraction,
        *,
        cargo_items: tuple[CargoRequirement, ...] = (),
        as_of: datetime | None = None,
        max_tool_calls: int = 15,
        max_lever_solver_calls: int = 5,
        max_profile_solves: int = 3,
        max_counterfactual_solves: int = 6,
        worker: BoundedSolverWorker | None = None,
    ) -> None:
        self.snapshot = snapshot
        self.extraction = extraction
        self.source_as_of = as_of
        self.cargo_items = cargo_items
        self.max_tool_calls = max_tool_calls
        self.max_lever_solver_calls = max_lever_solver_calls
        self.max_profile_solves = max_profile_solves
        self.max_counterfactual_solves = max_counterfactual_solves
        self._tool_calls = 0
        self._lever_solver_calls = 0
        self._profile_solves = 0
        self._counterfactual_solves = 0
        self._owns_worker = worker is None
        self._worker = worker or BoundedSolverWorker()
        ruled_out = {item.lever for item in extraction.levers_ruled_out}
        allowed = {
            lever.name: lever
            for lever in pack.action_registry.allowed
            if lever.name not in ruled_out
        }
        self.pack = replace(pack, action_registry=ActionRegistry(allowed))
        self.available_levers = tuple(
            sorted(allowed, key=lambda name: (allowed[name].cost_weight, name))
        )
        self.solver_requests: list[SolveRequest] = []
        self._records: list[ToolCallRecord] = []

    @property
    def records(self) -> tuple[ToolCallRecord, ...]:
        return tuple(self._records)

    def close(self) -> None:
        if self._owns_worker:
            self._worker.close()

    def get_schedule(self) -> Mapping[str, object]:
        self._reserve("get_schedule")
        result = {
            "schedule_version": self.snapshot.schedule_version,
            "jobs": tuple(
                {
                    "id": job.id,
                    "start_day": job.start_day,
                    "duration_days": job.duration_days,
                    "locked": job.locked,
                    "status": job.status.value,
                }
                for job in self.snapshot.jobs
            ),
        }
        self._record("get_schedule", {}, result)
        return result

    def check_readiness(self, job_id: str, target_start: int | None) -> Mapping[str, object]:
        self._reserve("check_readiness")
        job = next((item for item in self.snapshot.jobs if item.id == job_id), None)
        if job is None:
            raise InvalidEntityError(f"unknown job: {job_id}")
        items = tuple(item for item in self.snapshot.readiness_items if item.job_id == job_id)
        report = check_readiness(
            job,
            items,
            self.pack,
            target_start=target_start,
            as_of=self.source_as_of,
            risk_tags=tuple(item.tag for item in self.extraction.risk_tags),
        )
        result = {
            "job_id": report.job_id,
            "target_start": report.target_start,
            "earliest_feasible_start": report.earliest_feasible_start,
            "feasible": report.feasible,
            "blocking_item_ids": report.blocking_item_ids,
            "vendor_expedite_required": report.vendor_expedite_required,
        }
        self._record("check_readiness", {"job_id": job_id, "target_start": target_start}, result)
        return result

    def check_capacity(self, *, resource_id: str | None = None) -> Mapping[str, object]:
        self._reserve("check_capacity")
        reports = calculate_all_capacity(self.snapshot.resources, self.snapshot.bookings)
        result = {
            "resources": tuple(
                {
                    "resource_id": report.resource_id,
                    "unit": report.unit,
                    "max_overflow": str(report.max_overflow),
                    "feasible": report.feasible,
                }
                for report in reports
                if resource_id is None or report.resource_id == resource_id
            )
        }
        self._record("check_capacity", {"resource_id": resource_id}, result)
        return result

    def check_weather(self, *, from_day: int, to_day: int) -> Mapping[str, object]:
        self._reserve("check_weather")
        findings = []
        for resource in self.snapshot.resources:
            location = resource.metadata.get("location")
            if not isinstance(location, str):
                location = resource.name
            if resource.type not in self.pack.weather.applies_to:
                continue
            for day in range(from_day, to_day + 1):
                finding = assess_weather(location, day, self.snapshot.forecast, self.pack)
                findings.append(
                    {
                        "location": location,
                        "day": day,
                        "status": finding.status.value,
                        "evidence": finding.evidence,
                    }
                )
        result = {"findings": tuple(findings)}
        self._record("check_weather", {"from_day": from_day, "to_day": to_day}, result)
        return result

    def simulate(self, changes: Sequence[Mapping[str, object]]) -> SimulationResult:
        self._reserve("simulate")
        parsed = tuple(
            Change(
                kind=ChangeKind(str(change["kind"])),
                target=str(change["target"]),
                value=_change_value(change["value"]),
            )
            for change in changes
        )
        result = simulate(self.snapshot, parsed, self.pack)
        self._record(
            "simulate",
            {"change_count": len(parsed)},
            {
                "feasible": result.feasible,
                "violation_count": len(result.violations),
                "jobs_moved": result.kpi_delta.jobs_moved,
            },
        )
        return result

    async def optimize(
        self,
        open_levers: frozenset[str],
        *,
        profile_name: str | None = None,
        purpose: str = "lever",
        target_start: int | None = None,
    ) -> SolveToolResult:
        if not open_levers.issubset(set(self.available_levers)):
            invalid = sorted(open_levers - set(self.available_levers))
            raise PolicyBoundaryViolation(
                f"solver request contains forbidden or ruled-out levers: {invalid}"
            )
        self._reserve("optimize")
        if purpose == "lever":
            self._lever_solver_calls += 1
            if self._lever_solver_calls > self.max_lever_solver_calls:
                raise ToolBudgetExceeded("lever solver call budget exceeded")
        elif purpose == "profile":
            self._profile_solves += 1
            if self._profile_solves > self.max_profile_solves:
                raise ToolBudgetExceeded("profile comparison solve budget exceeded")
        request = SolveRequest(
            snapshot=self.snapshot,
            pack=self.pack,
            cargo_items=self.cargo_items,
            focus_job_id=self.extraction.job_ids[0] if self.extraction.job_ids else None,
            target_start=target_start,
            open_levers=open_levers,
            horizon_start=0,
            horizon_end=14,
            profile_name=profile_name,
            as_of=self.source_as_of,
        )
        self.solver_requests.append(request)
        result = await self._worker.solve_async(request)
        simulation_result = None
        if result.snapshot is not None:
            simulation_result = self._validate_solver_snapshot(result.snapshot)
        self._record(
            "optimize",
            {
                "open_levers": tuple(sorted(open_levers)),
                "profile": profile_name,
                "purpose": purpose,
            },
            {
                "status": result.status.value,
                "feasible": result.feasible,
                "change_count": len(result.changes),
                "objective_value": result.diagnostics.objective_value,
            },
        )
        return SolveToolResult(result, simulation_result)

    async def counterfactual(self, *, job_id: str, target_start: int) -> CounterfactualResult:
        subsets = [
            subset
            for size in range(len(self.available_levers) + 1)
            for subset in combinations(self.available_levers, size)
        ]
        diagnostics = []
        for subset in subsets:
            self._reserve("what_would_it_take")
            self._counterfactual_solves += 1
            if self._counterfactual_solves > self.max_counterfactual_solves:
                raise ToolBudgetExceeded("counterfactual solve budget exceeded")
            request = SolveRequest(
                snapshot=self.snapshot,
                pack=self.pack,
                cargo_items=self.cargo_items,
                focus_job_id=job_id,
                target_start=target_start,
                open_levers=frozenset(subset),
                horizon_start=0,
                horizon_end=14,
                as_of=self.source_as_of,
            )
            self.solver_requests.append(request)
            result = await self._worker.solve_async(request)
            diagnostics.append(result.diagnostics)
            if result.feasible and result.snapshot is not None:
                actual = next(
                    (job.start_day for job in result.snapshot.jobs if job.id == job_id), None
                )
                if actual == target_start:
                    cost = sum(self.pack.action_registry.get(name).cost_weight for name in subset)
                    self._record(
                        "what_would_it_take",
                        {"job_id": job_id, "target_start": target_start},
                        {"status": "feasible", "levers": subset},
                    )
                    return CounterfactualResult(
                        status=CounterfactualStatus.FEASIBLE,
                        job_id=job_id,
                        target_start=target_start,
                        levers=subset,
                        total_lever_cost=Decimal(str(cost)),
                        changes=result.changes,
                        blockers=(),
                        diagnostics=tuple(diagnostics),
                    )
        self._record(
            "what_would_it_take",
            {"job_id": job_id, "target_start": target_start},
            {"status": "impossible", "levers": ()},
        )
        return CounterfactualResult(
            status=CounterfactualStatus.IMPOSSIBLE,
            job_id=job_id,
            target_start=target_start,
            levers=(),
            total_lever_cost=Decimal("0"),
            changes=(),
            blockers=(f"no available lever combination reaches D+{target_start}",),
            diagnostics=tuple(diagnostics),
        )

    def _validate_solver_snapshot(self, candidate: ScheduleSnapshot) -> SimulationResult:
        validation = simulate(candidate, [], self.pack)
        capacity_reports = calculate_all_capacity(candidate.resources, candidate.bookings)
        return replace(
            validation,
            kpi_delta=_kpi_delta(self.snapshot, candidate, capacity_reports),
        )

    def _reserve(self, tool_name: str) -> None:
        self._tool_calls += 1
        if self._tool_calls > self.max_tool_calls:
            raise ToolBudgetExceeded(f"tool call budget exceeded at {tool_name}")

    def _record(
        self, name: str, input_value: Mapping[str, object], output: Mapping[str, object]
    ) -> None:
        self._records.append(
            ToolCallRecord(
                call_id=call_id(),
                name=name,
                input=dict(input_value),
                public_result=dict(output),
            )
        )


def _change_value(value: object) -> int | str:
    if isinstance(value, (int, str)) and not isinstance(value, bool):
        return value
    raise ValueError("solver change value must be an integer or string")
