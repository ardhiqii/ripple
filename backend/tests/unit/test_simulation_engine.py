from decimal import Decimal

from app.domain.enums import BookingStatus, JobStatus, ResourceType
from app.domain.jobs import Job
from app.domain.policy import OFFSHORE_PACK
from app.domain.resources import Booking, Resource
from app.engine.capacity import calculate_capacity
from app.engine.simulate import (
    Change,
    ChangeKind,
    ScheduleSnapshot,
    ViolationKind,
    simulate,
)
from app.engine.weather import WeatherObservation


def _boat() -> Resource:
    return Resource(
        id="boat-1",
        scenario_id="demo",
        type=ResourceType.SUPPLY_BOAT,
        name="NUSA PRIDE",
        capacity=Decimal("100"),
        unit="deck_units",
        metadata={"location": "North Delta"},
    )


def _booking(
    booking_id: str,
    start_day: int,
    end_day: int,
    load: str,
    *,
    job_id: str | None = None,
    cargo_id: str | None = None,
) -> Booking:
    return Booking(
        id=booking_id,
        scenario_id="demo",
        resource_id="boat-1",
        start_day=start_day,
        end_day=end_day,
        load=Decimal(load),
        status=BookingStatus.PLANNED,
        job_id=job_id,
        cargo_id=cargo_id,
    )


def _snapshot(bookings: tuple[Booking, ...], jobs: tuple[Job, ...] = ()) -> ScheduleSnapshot:
    return ScheduleSnapshot(
        scenario_id="demo",
        jobs=jobs,
        resources=(_boat(),),
        bookings=bookings,
    )


def test_d5_deck_105_percent_is_capacity_overflow() -> None:
    result = simulate(
        _snapshot(
            (
                _booking("base", 5, 5, "60", cargo_id="base"),
                _booking("drums", 5, 5, "45", cargo_id="drums"),
            )
        ),
        [],
        OFFSHORE_PACK,
    )

    overflow = [
        violation
        for violation in result.violations
        if violation.kind is ViolationKind.CAPACITY_OVERFLOW
    ]
    assert overflow and overflow[0].day == 5
    assert result.kpi_delta.max_capacity_overflow == Decimal("5")
    assert result.feasible is False


def test_moving_drums_produces_d5_90_and_d6_75() -> None:
    drums = Job(
        id="DRUMS",
        scenario_id="demo",
        site="North Delta",
        job_type="cargo_move",
        start_day=5,
        duration_days=1,
        shortfall_bopd=Decimal("0"),
        status=JobStatus.PLANNED,
    )
    snapshot = _snapshot(
        (
            _booking("base-d5", 5, 5, "90", cargo_id="base-d5"),
            _booking("base-d6", 6, 6, "60", cargo_id="base-d6"),
            _booking("drums", 5, 5, "15", job_id="DRUMS"),
        ),
        (drums,),
    )

    result = simulate(snapshot, [Change(ChangeKind.MOVE_JOB, "DRUMS", 6)], OFFSHORE_PACK)
    points = {
        point.day: point.used
        for point in calculate_capacity(_boat(), result.snapshot.bookings).points
    }

    assert points[5] == Decimal("90")
    assert points[6] == Decimal("75")
    assert result.kpi_delta.jobs_moved == 1
    assert result.snapshot.jobs[0].start_day == 6
    assert snapshot.jobs[0].start_day == 5


def test_moving_cargo_updates_the_existing_cargo_booking() -> None:
    result = simulate(
        _snapshot(
            (
                _booking("cargo-d07", 5, 5, "15", cargo_id="D-07-drums"),
            )
        ),
        [Change(ChangeKind.MOVE_CARGO, "D-07-drums", 6)],
        OFFSHORE_PACK,
    )

    assert result.feasible
    assert result.snapshot.bookings[0].start_day == 6
    assert result.snapshot.bookings[0].end_day == 6
    assert len(result.changed_objects) == 1
    assert result.changed_objects[0].entity_type == "booking"
    assert result.changed_objects[0].entity_id == "cargo-d07"
    assert result.changed_objects[0].before["start_day"] == 5
    assert result.changed_objects[0].after["start_day"] == 6


def test_locked_job_move_returns_typed_violation() -> None:
    locked = Job(
        id="LOCKED",
        scenario_id="demo",
        site="North Delta",
        job_type="intervention",
        start_day=5,
        duration_days=1,
        shortfall_bopd=Decimal("10"),
        locked=True,
        lock_reason="client inspection",
    )

    result = simulate(
        _snapshot((_booking("locked-booking", 5, 5, "10", job_id="LOCKED"),), (locked,)),
        [Change(ChangeKind.MOVE_JOB, "LOCKED", 6)],
        OFFSHORE_PACK,
    )

    assert any(violation.kind is ViolationKind.LOCKED_JOB_MOVE for violation in result.violations)
    assert result.feasible is False


def test_no_go_weather_returns_typed_violation() -> None:
    base = _snapshot((_booking("cargo", 5, 5, "10", cargo_id="cargo"),))
    snapshot = ScheduleSnapshot(
        scenario_id=base.scenario_id,
        jobs=base.jobs,
        resources=base.resources,
        bookings=base.bookings,
        readiness_items=base.readiness_items,
        forecast=(
            WeatherObservation(
                scenario_id="demo",
                location="North Delta",
                day=5,
                metric="wave_height_m",
                value=Decimal("2.5"),
                go=False,
                source="seed",
            ),
        ),
    )

    result = simulate(snapshot, [], OFFSHORE_PACK)

    assert any(violation.kind is ViolationKind.WEATHER_NO_GO for violation in result.violations)
    assert result.feasible is False


def test_missing_weather_is_conditional_not_assumed_safe() -> None:
    result = simulate(
        _snapshot((_booking("cargo", 5, 5, "10", cargo_id="cargo"),)),
        [],
        OFFSHORE_PACK,
    )

    assert any(violation.kind is ViolationKind.MISSING_WEATHER for violation in result.violations)
    assert result.conditional is True
    assert result.feasible is True
