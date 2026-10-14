"""Counterfactual search over the explicitly allowed lever set."""

from __future__ import annotations

from dataclasses import replace
from decimal import Decimal
from itertools import combinations

from app.domain.policy import DomainPack
from app.solver.cpsat import solve
from app.solver.types import (
    CounterfactualResult,
    CounterfactualStatus,
    SolveRequest,
)


def _lever_subsets(pack: DomainPack) -> tuple[tuple[str, ...], ...]:
    names = tuple(sorted(lever.name for lever in pack.action_registry.allowed))
    subsets: list[tuple[str, ...]] = []
    for size in range(len(names) + 1):
        subsets.extend(combinations(names, size))
    return tuple(
        sorted(
            subsets,
            key=lambda subset: (
                sum(pack.action_registry.get(name).cost_weight for name in subset),
                len(subset),
                subset,
            ),
        )
    )


def _physical_blockers(request: SolveRequest, job_id: str, target_start: int) -> tuple[str, ...]:
    job = next((job for job in request.snapshot.jobs if job.id == job_id), None)
    if job is None:
        return (f"job {job_id} does not exist in the snapshot",)
    items = [item for item in request.snapshot.readiness_items if item.job_id == job_id]
    steps = request.pack.readiness_templates.get(job.job_type, ())
    blockers: list[str] = []
    for item in items:
        if item.not_before_day is None:
            continue
        position = next(
            (index for index, step in enumerate(steps) if step.name == item.stage),
            item.step_order - 1,
        )
        earliest = item.not_before_day + len(steps) - position - 1
        if target_start < earliest:
            blockers.append(
                f"{item.stage} cannot be scheduled before D+{item.not_before_day} "
                f"(job earliest D+{earliest})"
            )
    return tuple(blockers)


def what_would_it_take(
    request: SolveRequest,
    *,
    job_id: str,
    target_start: int,
) -> CounterfactualResult:
    """Find the least-cost allowed lever set reaching an exact target day."""

    diagnostics = []
    for subset in _lever_subsets(request.pack):
        result = solve(
            replace(
                request,
                focus_job_id=job_id,
                target_start=target_start,
                open_levers=frozenset(subset),
            )
        )
        diagnostics.append(result.diagnostics)
        if not result.feasible or result.snapshot is None:
            continue
        actual = next((job.start_day for job in result.snapshot.jobs if job.id == job_id), None)
        if actual != target_start:
            continue
        cost = sum(request.pack.action_registry.get(name).cost_weight for name in subset)
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

    blockers = _physical_blockers(request, job_id, target_start)
    if not blockers:
        blockers = (f"no allowed lever combination reaches D+{target_start}",)
    return CounterfactualResult(
        status=CounterfactualStatus.IMPOSSIBLE,
        job_id=job_id,
        target_start=target_start,
        levers=(),
        total_lever_cost=Decimal("0"),
        changes=(),
        blockers=blockers,
        diagnostics=tuple(diagnostics),
    )
