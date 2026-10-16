"""Fresh-model CP-SAT solver for bounded Ripple schedule alternatives."""

from __future__ import annotations

import hashlib
import json
import time
from collections import defaultdict
from dataclasses import dataclass, replace
from decimal import Decimal
from typing import Any

from app.domain.jobs import Job
from app.domain.policy import DomainPack
from app.domain.readiness import ReadinessItem
from app.domain.resources import Booking
from app.engine.readiness import check_readiness
from app.engine.simulate import ScheduleSnapshot, simulate
from app.solver.types import (
    CargoRequirement,
    SolverDiagnostics,
    SolveRequest,
    SolveResult,
    SolverRunStatus,
)
from ortools.sat.python import cp_model

_OBJECTIVE_SCALE = 1000


@dataclass(slots=True)
class _ModelState:
    model: Any
    job_starts: dict[str, Any]
    test_dates: dict[str, Any]
    cargo_assignments: dict[str, dict[int, Any]]
    cargo_requirements: dict[str, CargoRequirement]
    lever_used: dict[str, Any]
    earliest_starts: dict[str, int]
    baseline_test_dates: dict[str, int]


def _scaled(value: Decimal | int | float) -> int:
    return int(Decimal(str(value)) * _OBJECTIVE_SCALE)


def _unscaled(value: float) -> Decimal:
    return Decimal(int(round(value))) / _OBJECTIVE_SCALE


def _fingerprint(request: SolveRequest) -> str:
    snapshot = request.snapshot
    payload: dict[str, Any] = {
        "scenario_id": snapshot.scenario_id,
        "schedule_version": snapshot.schedule_version,
        "jobs": [
            {
                "id": job.id,
                "start": job.start_day,
                "duration": job.duration_days,
                "shortfall": str(job.shortfall_bopd),
                "locked": job.locked,
            }
            for job in snapshot.jobs
        ],
        "resources": [
            {"id": resource.id, "type": resource.type.value, "capacity": str(resource.capacity)}
            for resource in snapshot.resources
        ],
        "unavailability": [
            {
                "id": interval.id,
                "resource": interval.resource_id,
                "start": interval.start_day,
                "end": interval.end_day,
                "kind": interval.kind,
            }
            for interval in snapshot.unavailability
        ],
        "bookings": [
            {
                "id": booking.id,
                "job": booking.job_id,
                "cargo": booking.cargo_id,
                "resource": booking.resource_id,
                "start": booking.start_day,
                "end": booking.end_day,
                "load": str(booking.load),
            }
            for booking in snapshot.bookings
        ],
        "readiness": [
            {
                "id": item.id,
                "job": item.job_id,
                "stage": item.stage,
                "planned": item.planned_day,
                "earliest": item.eta_earliest,
                "latest": item.eta_latest,
                "not_before": item.not_before_day,
                "buffer": item.risk_buffer_days,
            }
            for item in snapshot.readiness_items
        ],
        "weather": [
            {"location": item.location, "day": item.day, "value": str(item.value), "go": item.go}
            for item in snapshot.forecast
        ],
        "cargo": [
            {
                "id": item.id,
                "units": str(item.deck_units),
                "needed_by": item.needed_by_day,
                "sailing": item.sailing_day,
            }
            for item in request.cargo_items
        ],
        "open_levers": sorted(request.open_levers),
        "focus_job_id": request.focus_job_id,
        "target_start": request.target_start,
        "profile": request.profile_name or request.pack.default_weight_profile,
        "as_of": request.resolved_as_of.isoformat(),
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


def _job_items(snapshot: ScheduleSnapshot) -> dict[str, tuple[ReadinessItem, ...]]:
    result: dict[str, list[ReadinessItem]] = defaultdict(list)
    for item in snapshot.readiness_items:
        result[item.job_id].append(item)
    return {job_id: tuple(items) for job_id, items in result.items()}


def _earliest_start(job: Job, items: tuple[ReadinessItem, ...], request: SolveRequest) -> int:
    if not items:
        return request.horizon_start
    report = check_readiness(job, items, request.pack, as_of=request.resolved_as_of)
    if report.earliest_feasible_start is None:
        return request.horizon_end + 1
    return report.earliest_feasible_start


def _test_item(
    items: tuple[ReadinessItem, ...], pack: DomainPack, job_type: str
) -> tuple[ReadinessItem, int] | None:
    steps = pack.readiness_templates.get(job_type, ())
    for item in items:
        if item.stage != "function_test":
            continue
        position = next((index for index, step in enumerate(steps) if step.name == item.stage), 0)
        return item, len(steps) - position - 1
    return None


def _allowed_levers(request: SolveRequest) -> set[str]:
    allowed = {lever.name for lever in request.pack.action_registry.allowed}
    return set(request.open_levers) & allowed


def _bad_weather_days(request: SolveRequest) -> set[int]:
    return {
        observation.day
        for observation in request.snapshot.forecast
        if observation.metric == request.pack.weather.metric
        and (
            observation.go is False
            or (observation.value is not None and observation.value > request.pack.weather.maximum)
        )
    }


def _unavailable_days(request: SolveRequest, resource_id: str) -> set[int]:
    days: set[int] = set()
    for interval in request.snapshot.unavailability:
        if interval.resource_id != resource_id:
            continue
        days.update(
            range(
                max(interval.start_day, request.horizon_start),
                min(interval.end_day, request.horizon_end) + 1,
            )
        )
    return days


def _booking_by_job(snapshot: ScheduleSnapshot) -> dict[str, tuple[Booking, ...]]:
    result: dict[str, list[Booking]] = defaultdict(list)
    for booking in snapshot.bookings:
        if booking.job_id is not None:
            result[booking.job_id].append(booking)
    return {job_id: tuple(bookings) for job_id, bookings in result.items()}


def _build_model(request: SolveRequest) -> _ModelState:
    model: Any = cp_model.CpModel()
    jobs = {job.id: job for job in request.snapshot.jobs}
    items_by_job = _job_items(request.snapshot)
    allowed_levers = _allowed_levers(request)
    job_starts: dict[str, Any] = {}
    test_dates: dict[str, Any] = {}
    earliest_starts: dict[str, int] = {}
    baseline_test_dates: dict[str, int] = {}
    lever_used: dict[str, Any] = {}

    for lever_name in sorted(allowed_levers):
        lever_used[lever_name] = model.NewBoolVar(f"lever_used_{lever_name}")

    for job in request.snapshot.jobs:
        items = items_by_job.get(job.id, ())
        earliest = _earliest_start(job, items, request)
        earliest_starts[job.id] = earliest
        test_info = _test_item(items, request.pack, job.job_type)
        can_expedite = (
            "expedite_vendor_test" in allowed_levers
            and test_info is not None
            and (request.focus_job_id is None or request.focus_job_id == job.id)
        )
        can_move = not job.locked and (
            "swap_jobs" in allowed_levers
            or (can_expedite and request.focus_job_id in (None, job.id))
        )
        if can_expedite:
            lower = request.horizon_start
        else:
            lower = max(
                request.horizon_start,
                earliest if can_move or job.locked else job.start_day,
            )
        upper = request.horizon_end - job.duration_days + 1
        if not can_move and not job.locked:
            lower = upper = job.start_day
        if job.locked:
            lower = upper = job.start_day
        start = model.NewIntVar(lower, upper, f"job_start_{job.id}")
        job_starts[job.id] = start
        if not can_expedite:
            model.Add(start >= earliest)

        if request.focus_job_id == job.id and request.target_start is not None:
            model.Add(start == request.target_start)

        if can_expedite and test_info is not None:
            item, steps_after = test_info
            baseline = item.planned_day
            if baseline is None:
                baseline = item.eta_latest or item.eta_earliest
            if baseline is not None:
                baseline_test_dates[job.id] = baseline
                lower_test = max(
                    request.horizon_start,
                    item.not_before_day
                    if item.not_before_day is not None
                    else item.eta_earliest or baseline,
                )
                test_date = model.NewIntVar(
                    lower_test,
                    max(lower_test, baseline),
                    f"test_day_{job.id}",
                )
                test_dates[job.id] = test_date
                model.Add(start >= test_date + steps_after)
                expedite_used = lever_used.get("expedite_vendor_test")
                if expedite_used is not None:
                    model.Add(test_date == baseline).OnlyEnforceIf(expedite_used.Not())
                    model.Add(test_date < baseline).OnlyEnforceIf(expedite_used)

    by_resource: dict[str, list[Any]] = defaultdict(list)
    booking_by_job = _booking_by_job(request.snapshot)
    for job_id, bookings in booking_by_job.items():
        start = job_starts[job_id]
        duration = jobs[job_id].duration_days
        for booking in bookings:
            resource = next(
                (item for item in request.snapshot.resources if item.id == booking.resource_id),
                None,
            )
            if resource is not None and resource.unit == "job":
                by_resource[resource.id].append(
                    model.NewIntervalVar(
                        start, duration, start + duration, f"interval_{booking.id}"
                    )
                )
    for intervals in by_resource.values():
        model.AddNoOverlap(intervals)

    for job_id, bookings in booking_by_job.items():
        job = jobs[job_id]
        possible_starts = range(
            request.horizon_start,
            request.horizon_end - job.duration_days + 2,
        )
        for booking in bookings:
            resource = next(
                (item for item in request.snapshot.resources if item.id == booking.resource_id),
                None,
            )
            if resource is None or resource.unit != "job":
                continue
            unavailable_days = _unavailable_days(request, resource.id)
            for possible_start in possible_starts:
                if any(
                    day in unavailable_days
                    for day in range(possible_start, possible_start + job.duration_days)
                ):
                    model.Add(job_starts[job_id] != possible_start)

    bad_days = _bad_weather_days(request)
    for job_id, bookings in booking_by_job.items():
        job = jobs[job_id]
        for booking in bookings:
            resource = next(
                (item for item in request.snapshot.resources if item.id == booking.resource_id),
                None,
            )
            if resource is None or resource.type not in request.pack.weather.applies_to:
                continue
            for day in bad_days:
                for possible_start in range(
                    request.horizon_start, request.horizon_end - job.duration_days + 2
                ):
                    if possible_start <= day < possible_start + job.duration_days:
                        model.Add(job_starts[job_id] != possible_start)

    cargo_requirements = {cargo.id: cargo for cargo in request.cargo_items}
    cargo_assignments: dict[str, dict[int, Any]] = {}
    deck_resources = [
        resource for resource in request.snapshot.resources if resource.unit == "deck_units"
    ]
    available_days: dict[str, set[int]] = defaultdict(set)
    for booking in request.snapshot.bookings:
        resource = next((item for item in deck_resources if item.id == booking.resource_id), None)
        if resource is not None:
            available_days[resource.id].add(booking.start_day)
    for resource in deck_resources:
        if not available_days[resource.id]:
            available_days[resource.id].update(
                range(request.horizon_start, request.horizon_end + 1)
            )
        available_days[resource.id].difference_update(_unavailable_days(request, resource.id))

    fixed_load: dict[tuple[str, int], int] = defaultdict(int)
    for booking in request.snapshot.bookings:
        resource = next((item for item in deck_resources if item.id == booking.resource_id), None)
        if resource is None or booking.cargo_id in cargo_requirements:
            continue
        for day in range(booking.start_day, booking.end_day + 1):
            fixed_load[(resource.id, day)] += _scaled(booking.load)

    move_cargo = "move_cargo" in allowed_levers
    cargo_changes: list[Any] = []
    for cargo in request.cargo_items:
        original_booking = next(
            (booking for booking in request.snapshot.bookings if booking.cargo_id == cargo.id),
            None,
        )
        original_day = cargo.sailing_day
        if original_day is None and original_booking is not None:
            original_day = original_booking.start_day
        resource_id = cargo.resource_id or (
            original_booking.resource_id if original_booking is not None else deck_resources[0].id
        )
        days = sorted(
            day
            for day in available_days[resource_id]
            if request.horizon_start <= day <= cargo.needed_by_day
        )
        if not move_cargo and original_day is not None:
            days = [original_day] if original_day in available_days[resource_id] else []
        assignments = {day: model.NewBoolVar(f"cargo_{cargo.id}_{day}") for day in days}
        cargo_assignments[cargo.id] = assignments
        must_assign = original_day is not None or (move_cargo and cargo.assign_if_open)
        if assignments:
            total = sum(assignments.values())
            model.Add(total == 1 if must_assign else total <= 1)
            if original_day is not None and not move_cargo:
                model.Add(assignments.get(original_day, next(iter(assignments.values()))) == 1)
            for day, variable in assignments.items():
                if day in bad_days:
                    model.Add(variable == 0)
        elif must_assign:
            model.AddBoolOr([])
        if move_cargo:
            changed = model.NewBoolVar(f"cargo_changed_{cargo.id}")
            if original_day is None:
                model.Add(changed == 1 if must_assign else changed == 0)
            else:
                changed_days = [
                    variable for day, variable in assignments.items() if day != original_day
                ]
                model.Add(sum(changed_days) == changed)
            cargo_changes.append(changed)

    for resource in deck_resources:
        capacity = _scaled(resource.capacity)
        days = sorted(
            (available_days[resource.id] | set(bad_days))
            - _unavailable_days(request, resource.id)
        )
        for day in days:
            terms = [
                _scaled(cargo.deck_units) * cargo_assignments[cargo.id][day]
                for cargo in request.cargo_items
                if day in cargo_assignments[cargo.id]
                and (cargo.resource_id or resource.id) == resource.id
            ]
            model.Add(fixed_load[(resource.id, day)] + sum(terms) <= capacity)

    if move_cargo and cargo_changes:
        move_used = lever_used.get("move_cargo")
        if move_used is not None:
            model.Add(sum(cargo_changes) >= move_used)
            for changed in cargo_changes:
                model.AddImplication(changed, move_used)

    objective_terms: list[Any] = []
    profile = request.profile
    for job in request.snapshot.jobs:
        start = job_starts[job.id]
        objective_terms.append(
            _scaled(job.shortfall_bopd * profile.delay_weight) * (start - job.start_day)
        )
        movement = model.NewIntVar(
            0, request.horizon_end + request.horizon_start + 30, f"movement_{job.id}"
        )
        model.AddAbsEquality(movement, start - job.start_day)
        objective_terms.append(_scaled(profile.movement_weight) * movement)
    for lever_name, variable in lever_used.items():
        lever = request.pack.action_registry.get(lever_name)
        objective_terms.append(_scaled(lever.cost_weight * profile.lever_cost_weight) * variable)
    model.Minimize(sum(objective_terms) if objective_terms else 0)
    return _ModelState(
        model=model,
        job_starts=job_starts,
        test_dates=test_dates,
        cargo_assignments=cargo_assignments,
        cargo_requirements=cargo_requirements,
        lever_used=lever_used,
        earliest_starts=earliest_starts,
        baseline_test_dates=baseline_test_dates,
    )


def _status(value: Any) -> SolverRunStatus:
    return {
        cp_model.OPTIMAL: SolverRunStatus.OPTIMAL,
        cp_model.FEASIBLE: SolverRunStatus.FEASIBLE,
        cp_model.INFEASIBLE: SolverRunStatus.INFEASIBLE,
        cp_model.MODEL_INVALID: SolverRunStatus.MODEL_INVALID,
    }.get(value, SolverRunStatus.UNKNOWN)


def _candidate_snapshot(
    request: SolveRequest,
    state: _ModelState,
    solver: Any,
) -> tuple[ScheduleSnapshot, tuple[dict[str, object], ...]]:
    job_values = {job_id: solver.Value(variable) for job_id, variable in state.job_starts.items()}
    jobs = tuple(replace(job, start_day=job_values[job.id]) for job in request.snapshot.jobs)
    changes: list[dict[str, object]] = []
    for job in request.snapshot.jobs:
        value = job_values[job.id]
        if value != job.start_day:
            changes.append(
                {"kind": "move_job", "target": job.id, "value": value, "from": job.start_day}
            )

    test_values = {job_id: solver.Value(variable) for job_id, variable in state.test_dates.items()}
    readiness: list[ReadinessItem] = []
    for item in request.snapshot.readiness_items:
        value = item.planned_day
        if item.job_id in test_values:
            value = test_values[item.job_id] + (item.step_order - 1)
            if value != item.planned_day:
                changes.append(
                    {
                        "kind": "set_item_date",
                        "target": item.id,
                        "value": value,
                        "from": item.planned_day,
                    }
                )
        readiness.append(replace(item, planned_day=value))

    cargo_days: dict[str, int] = {}
    for cargo_id, assignments in state.cargo_assignments.items():
        selected = [day for day, variable in assignments.items() if solver.Value(variable) == 1]
        if selected:
            cargo_days[cargo_id] = selected[0]

    bookings: list[Booking] = []
    booking_by_cargo = {
        booking.cargo_id: booking for booking in request.snapshot.bookings if booking.cargo_id
    }
    for booking in request.snapshot.bookings:
        if booking.job_id is not None:
            delta = job_values[booking.job_id] - next(
                job.start_day for job in request.snapshot.jobs if job.id == booking.job_id
            )
            bookings.append(
                replace(
                    booking, start_day=booking.start_day + delta, end_day=booking.end_day + delta
                )
            )
            continue
        if booking.cargo_id in cargo_days:
            day = cargo_days[booking.cargo_id]
            if day != booking.start_day:
                changes.append(
                    {
                        "kind": "move_cargo",
                        "target": booking.cargo_id,
                        "value": day,
                        "from": booking.start_day,
                    }
                )
            bookings.append(replace(booking, start_day=day, end_day=day))
        else:
            bookings.append(booking)
    for cargo_id, day in cargo_days.items():
        if cargo_id in booking_by_cargo:
            continue
        cargo = state.cargo_requirements[cargo_id]
        resource_id = cargo.resource_id or next(
            resource.id for resource in request.snapshot.resources if resource.unit == "deck_units"
        )
        bookings.append(
            Booking(
                id=f"solver-{cargo_id}",
                scenario_id=request.snapshot.scenario_id,
                resource_id=resource_id,
                start_day=day,
                end_day=day,
                load=cargo.deck_units,
                cargo_id=cargo_id,
            )
        )
        changes.append({"kind": "move_cargo", "target": cargo_id, "value": day, "from": None})

    candidate = ScheduleSnapshot(
        scenario_id=request.snapshot.scenario_id,
        jobs=jobs,
        resources=request.snapshot.resources,
        bookings=tuple(sorted(bookings, key=lambda booking: (booking.start_day, booking.id))),
        readiness_items=tuple(readiness),
        forecast=request.snapshot.forecast,
        schedule_version=request.snapshot.schedule_version,
        unavailability=request.snapshot.unavailability,
    )
    return candidate, tuple(
        sorted(changes, key=lambda item: (str(item["kind"]), str(item["target"])))
    )


def solve(request: SolveRequest) -> SolveResult:
    """Build and solve one fresh CP-SAT model."""

    started = time.perf_counter()
    fingerprint = _fingerprint(request)
    profile = request.profile
    weights = {
        "delay_weight": profile.delay_weight,
        "lever_cost_weight": profile.lever_cost_weight,
        "movement_weight": profile.movement_weight,
        "risk_weight": profile.risk_weight,
    }
    if request.horizon_end < request.horizon_start:
        diagnostics = SolverDiagnostics(
            status=SolverRunStatus.MODEL_INVALID,
            wall_time_ms=0,
            objective_value=None,
            best_bound=None,
            model_fingerprint=fingerprint,
            profile_name=profile.name,
            weights=weights,
            random_seed=request.random_seed,
            num_workers=request.num_workers,
            error="horizon_end must be on or after horizon_start",
        )
        return SolveResult(SolverRunStatus.MODEL_INVALID, False, None, (), (), diagnostics)
    if request.focus_job_id is not None and request.focus_job_id not in {
        job.id for job in request.snapshot.jobs
    }:
        diagnostics = SolverDiagnostics(
            status=SolverRunStatus.MODEL_INVALID,
            wall_time_ms=0,
            objective_value=None,
            best_bound=None,
            model_fingerprint=fingerprint,
            profile_name=profile.name,
            weights=weights,
            random_seed=request.random_seed,
            num_workers=request.num_workers,
            error=f"unknown focus job: {request.focus_job_id}",
        )
        return SolveResult(SolverRunStatus.MODEL_INVALID, False, None, (), (), diagnostics)

    try:
        state = _build_model(request)
    except (KeyError, ValueError, IndexError) as exc:
        diagnostics = SolverDiagnostics(
            status=SolverRunStatus.MODEL_INVALID,
            wall_time_ms=int((time.perf_counter() - started) * 1000),
            objective_value=None,
            best_bound=None,
            model_fingerprint=fingerprint,
            profile_name=profile.name,
            weights=weights,
            random_seed=request.random_seed,
            num_workers=request.num_workers,
            error=str(exc),
        )
        return SolveResult(SolverRunStatus.MODEL_INVALID, False, None, (), (), diagnostics)

    solver: Any = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = max(request.time_limit_seconds, 0.0)
    solver.parameters.random_seed = request.random_seed
    solver.parameters.num_search_workers = request.num_workers
    status_code = solver.Solve(state.model)
    status = _status(status_code)
    elapsed_ms = int((time.perf_counter() - started) * 1000)
    objective = None
    best_bound = None
    if status in (SolverRunStatus.OPTIMAL, SolverRunStatus.FEASIBLE):
        objective = _unscaled(solver.ObjectiveValue())
        best_bound = _unscaled(solver.BestObjectiveBound())
    diagnostics = SolverDiagnostics(
        status=status,
        wall_time_ms=elapsed_ms,
        objective_value=objective,
        best_bound=best_bound,
        model_fingerprint=fingerprint,
        profile_name=profile.name,
        weights=weights,
        random_seed=request.random_seed,
        num_workers=request.num_workers,
        branches=solver.NumBranches(),
        conflicts=solver.NumConflicts(),
    )
    if status not in (SolverRunStatus.OPTIMAL, SolverRunStatus.FEASIBLE):
        return SolveResult(status, False, None, (), (), diagnostics)

    candidate, changes = _candidate_snapshot(request, state, solver)
    simulation = simulate(candidate, [], request.pack)
    return SolveResult(
        status=status,
        feasible=simulation.feasible,
        snapshot=candidate if simulation.feasible else None,
        changes=changes,
        violations=simulation.violations,
        diagnostics=diagnostics,
    )
