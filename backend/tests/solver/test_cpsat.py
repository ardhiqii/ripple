from dataclasses import replace
from datetime import UTC, datetime
from decimal import Decimal
from types import SimpleNamespace

import pytest
from app.domain.enums import BookingStatus, JobStatus, ResourceType
from app.domain.jobs import Job
from app.domain.policy import OFFSHORE_PACK
from app.domain.readiness import ReadinessItem
from app.domain.resources import Booking, Resource
from app.engine.simulate import ScheduleSnapshot
from app.engine.weather import WeatherObservation
from app.solver import (
    BoundedSolverWorker,
    CargoRequirement,
    CounterfactualStatus,
    SolveRequest,
    SolveResult,
    SolverRunStatus,
    cpsat,
    solve,
    what_would_it_take,
)

AS_OF = datetime(2026, 10, 13, 12, tzinfo=UTC)


def _job(job_id: str, start_day: int, *, locked: bool = False) -> Job:
    return Job(
        id=job_id,
        scenario_id="golden",
        site="offshore",
        job_type="esp_replacement",
        start_day=start_day,
        duration_days=2,
        shortfall_bopd=Decimal("100"),
        locked=locked,
        lock_reason="client commitment" if locked else None,
        status=JobStatus.PLANNED,
    )


def _readiness() -> tuple[ReadinessItem, ...]:
    stages = ("function_test", "paperwork", "shorebase_staging", "load_and_sail")
    return tuple(
        ReadinessItem(
            id=f"A-12-{stage}",
            scenario_id="golden",
            job_id="A-12",
            stage=stage,
            step_order=index,
            lead_time_days=1,
            planned_day=3 + index,
            eta_earliest=3 + index,
            eta_latest=3 + index,
            not_before_day=1 if index == 1 else None,
            last_updated=AS_OF,
        )
        for index, stage in enumerate(stages, start=1)
    )


def _snapshot() -> ScheduleSnapshot:
    jobs = (
        _job("C-03", 3),
        _job("B-05", 7, locked=True),
        _job("A-12", 9),
        _job("D-07", 11),
        _job("E-02", 13),
    )
    resources = (
        Resource(
            id="BRG-1",
            scenario_id="golden",
            type=ResourceType.BARGE,
            name="Intervention Barge",
            capacity=Decimal("1"),
            unit="job",
            metadata={"location": "offshore"},
        ),
        Resource(
            id="SB-1",
            scenario_id="golden",
            type=ResourceType.SUPPLY_BOAT,
            name="Supply Boat",
            capacity=Decimal("100"),
            unit="deck_units",
            metadata={"location": "offshore"},
        ),
    )
    job_bookings = tuple(
        Booking(
            id=f"barge-{job.id}",
            scenario_id="golden",
            resource_id="BRG-1",
            start_day=job.start_day,
            end_day=job.start_day + job.duration_days - 1,
            load=Decimal("1"),
            status=BookingStatus.PLANNED,
            job_id=job.id,
        )
        for job in jobs
    )
    cargo_bookings = (
        Booking(
            id="cargo-other",
            scenario_id="golden",
            resource_id="SB-1",
            start_day=5,
            end_day=5,
            load=Decimal("70"),
            cargo_id="other-cargo",
        ),
        Booking(
            id="cargo-D-07-drums",
            scenario_id="golden",
            resource_id="SB-1",
            start_day=5,
            end_day=5,
            load=Decimal("15"),
            cargo_id="D-07-drums",
        ),
        Booking(
            id="cargo-existing",
            scenario_id="golden",
            resource_id="SB-1",
            start_day=6,
            end_day=6,
            load=Decimal("60"),
            cargo_id="existing-cargo",
        ),
    )
    forecast = tuple(
        WeatherObservation(
            scenario_id="golden",
            location="offshore",
            day=day,
            metric="wave_height_m",
            value=Decimal("1.0"),
            go=True,
            source="golden-test",
        )
        for day in range(15)
    )
    return ScheduleSnapshot(
        scenario_id="golden",
        jobs=jobs,
        resources=resources,
        bookings=job_bookings + cargo_bookings,
        readiness_items=_readiness(),
        forecast=forecast,
        schedule_version=1,
    )


def _request(*, open_levers: frozenset[str] = frozenset()) -> SolveRequest:
    return SolveRequest(
        snapshot=_snapshot(),
        pack=OFFSHORE_PACK,
        cargo_items=(
            CargoRequirement("D-07-drums", Decimal("15"), needed_by_day=11, sailing_day=5),
            CargoRequirement("A-12-pump", Decimal("20"), needed_by_day=5),
        ),
        focus_job_id="A-12",
        open_levers=open_levers,
        as_of=AS_OF,
    )


def _job_starts(result: SolveResult) -> tuple[tuple[str, int], ...]:
    snapshot = result.snapshot
    assert snapshot is not None
    return tuple((job.id, job.start_day) for job in snapshot.jobs)


def test_a12_baseline_solver_golden_is_feasible_without_open_levers() -> None:
    result = solve(_request())

    assert result.status is SolverRunStatus.OPTIMAL
    assert result.feasible
    assert result.diagnostics.wall_time_ms < 2000
    assert _job_starts(result)[2] == ("A-12", 9)
    assert result.changes == ()
    assert result.violations == ()


def test_a12_open_levers_expedite_and_move_cargo_to_d5() -> None:
    request = _request(open_levers=frozenset({"expedite_vendor_test", "move_cargo"}))
    result = solve(request)

    assert result.status is SolverRunStatus.OPTIMAL
    assert result.feasible
    assert result.snapshot is not None
    assert _job_starts(result)[2] == ("A-12", 5)
    assert {
        item.id: item.planned_day
        for item in result.snapshot.readiness_items
        if item.job_id == "A-12"
    } == {
        "A-12-function_test": 1,
        "A-12-paperwork": 2,
        "A-12-shorebase_staging": 3,
        "A-12-load_and_sail": 4,
    }
    cargo_days = {
        booking.cargo_id: booking.start_day
        for booking in result.snapshot.bookings
        if booking.cargo_id in {"A-12-pump", "D-07-drums"}
    }
    assert cargo_days == {"A-12-pump": 5, "D-07-drums": 6}
    assert result.violations == ()


def test_solver_is_reproducible_with_fixed_seed_and_one_worker() -> None:
    request = _request(open_levers=frozenset({"expedite_vendor_test", "move_cargo"}))

    first = solve(request)
    second = solve(request)

    assert first.status is second.status
    assert first.feasible == second.feasible
    assert first.diagnostics.model_fingerprint == second.diagnostics.model_fingerprint
    assert first.diagnostics.objective_value == second.diagnostics.objective_value
    assert first.changes == second.changes
    assert _job_starts(first) == _job_starts(second)


def test_counterfactual_reports_physical_impossibility_before_d4() -> None:
    result = what_would_it_take(_request(), job_id="A-12", target_start=3)

    assert result.status is CounterfactualStatus.IMPOSSIBLE
    assert result.levers == ()
    assert any("D+1" in blocker for blocker in result.blockers)
    assert any("D+4" in blocker for blocker in result.blockers)


def test_model_invalid_is_explicit_for_bad_horizon() -> None:
    result = solve(replace(_request(), horizon_start=5, horizon_end=4))

    assert result.status is SolverRunStatus.MODEL_INVALID
    assert not result.feasible
    assert result.snapshot is None
    assert result.diagnostics.error == "horizon_end must be on or after horizon_start"


def test_forbidden_levers_do_not_create_cp_sat_variables() -> None:
    state = cpsat._build_model(
        _request(open_levers=frozenset({"move_locked_job", "add_vessel"}))
    )
    variable_names = {variable.name for variable in state.model.Proto().variables}

    assert "lever_used_move_locked_job" not in variable_names
    assert "lever_used_add_vessel" not in variable_names


def test_unknown_status_is_preserved(monkeypatch: pytest.MonkeyPatch) -> None:
    class UnknownSolver:
        def __init__(self) -> None:
            self.parameters = SimpleNamespace()

        def Solve(self, _model: object) -> object:
            return cpsat.cp_model.UNKNOWN

        def NumBranches(self) -> int:
            return 0

        def NumConflicts(self) -> int:
            return 0

    monkeypatch.setattr(cpsat.cp_model, "CpSolver", UnknownSolver)

    result = solve(_request())

    assert result.status is SolverRunStatus.UNKNOWN
    assert not result.feasible
    assert result.snapshot is None


def test_bounded_worker_executes_solver_at_async_boundary() -> None:
    request = _request()
    with BoundedSolverWorker(max_workers=1) as worker:
        result = worker.solve(request)

    assert result.status is SolverRunStatus.OPTIMAL
    assert result.feasible
