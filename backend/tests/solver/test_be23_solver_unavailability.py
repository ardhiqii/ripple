from decimal import Decimal

from app.domain.enums import BookingStatus, JobStatus, ResourceType
from app.domain.jobs import Job
from app.domain.policy import OFFSHORE_PACK
from app.domain.resources import Booking, Resource, ResourceUnavailability
from app.engine.simulate import ScheduleSnapshot
from app.engine.weather import WeatherObservation
from app.solver import CargoRequirement, SolveRequest, SolverRunStatus, solve


def _barge_snapshot(*, unavailability: tuple[ResourceUnavailability, ...]) -> ScheduleSnapshot:
    job = Job(
        id="JOB-1",
        scenario_id="demo",
        site="offshore",
        job_type="esp_replacement",
        start_day=5,
        duration_days=1,
        shortfall_bopd=Decimal("10"),
        status=JobStatus.PLANNED,
    )
    return ScheduleSnapshot(
        scenario_id="demo",
        jobs=(job,),
        resources=(
            Resource(
                id="BRG-1",
                scenario_id="demo",
                type=ResourceType.BARGE,
                name="Intervention barge",
                capacity=Decimal("1"),
                unit="job",
            ),
        ),
        bookings=(
            Booking(
                id="booking-1",
                scenario_id="demo",
                resource_id="BRG-1",
                start_day=5,
                end_day=5,
                load=Decimal("1"),
                status=BookingStatus.PLANNED,
                job_id="JOB-1",
            ),
        ),
        forecast=tuple(
            WeatherObservation(
                scenario_id="demo",
                location="Intervention barge",
                day=day,
                metric="wave_height_m",
                value=Decimal("1"),
                go=True,
                source="test",
            )
            for day in range(4, 7)
        ),
        unavailability=unavailability,
    )


def test_solver_avoids_unavailable_job_day() -> None:
    interval = ResourceUnavailability(
        id="maintenance-1",
        scenario_id="demo",
        resource_id="BRG-1",
        start_day=5,
        end_day=5,
        kind="maintenance",
        reason="planned maintenance",
    )
    result = solve(
        SolveRequest(
            snapshot=_barge_snapshot(unavailability=(interval,)),
            pack=OFFSHORE_PACK,
            open_levers=frozenset({"swap_jobs"}),
            horizon_start=4,
            horizon_end=6,
        )
    )

    assert result.status is SolverRunStatus.OPTIMAL
    assert result.feasible
    assert result.snapshot is not None
    assert result.snapshot.jobs[0].start_day != 5
    assert result.violations == ()


def test_solver_reports_infeasible_when_fixed_option_only_uses_unavailable_day() -> None:
    interval = ResourceUnavailability(
        id="maintenance-1",
        scenario_id="demo",
        resource_id="BRG-1",
        start_day=5,
        end_day=5,
        kind="maintenance",
        reason="planned maintenance",
    )
    result = solve(
        SolveRequest(
            snapshot=_barge_snapshot(unavailability=(interval,)),
            pack=OFFSHORE_PACK,
            horizon_start=5,
            horizon_end=5,
        )
    )

    assert result.status is SolverRunStatus.INFEASIBLE
    assert not result.feasible
    assert result.snapshot is None


def test_solver_excludes_unavailable_cargo_days() -> None:
    interval = ResourceUnavailability(
        id="inspection-1",
        scenario_id="demo",
        resource_id="SB-1",
        start_day=5,
        end_day=5,
        kind="unavailable",
        reason="inspection",
    )
    snapshot = ScheduleSnapshot(
        scenario_id="demo",
        jobs=(),
        resources=(
            Resource(
                id="SB-1",
                scenario_id="demo",
                type=ResourceType.SUPPLY_BOAT,
                name="Supply boat",
                capacity=Decimal("100"),
                unit="deck_units",
            ),
        ),
        bookings=(),
        unavailability=(interval,),
    )
    result = solve(
        SolveRequest(
            snapshot=snapshot,
            pack=OFFSHORE_PACK,
            cargo_items=(CargoRequirement("cargo-1", Decimal("10"), needed_by_day=6),),
            open_levers=frozenset({"move_cargo"}),
            horizon_start=4,
            horizon_end=6,
        )
    )

    assert result.status is SolverRunStatus.OPTIMAL
    assert result.feasible
    assert result.snapshot is not None
    cargo_booking = next(item for item in result.snapshot.bookings if item.cargo_id == "cargo-1")
    assert cargo_booking.start_day != 5
