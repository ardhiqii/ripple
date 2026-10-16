from decimal import Decimal

from app.domain.enums import BookingStatus, ResourceType
from app.domain.policy import OFFSHORE_PACK
from app.domain.resources import Booking, Resource, ResourceUnavailability
from app.engine.capacity import calculate_capacity
from app.engine.simulate import ScheduleSnapshot, ViolationKind, simulate


def _resource() -> Resource:
    return Resource(
        id="BRG-1",
        scenario_id="demo",
        type=ResourceType.BARGE,
        name="Intervention barge",
        capacity=Decimal("1"),
        unit="job",
    )


def _booking(booking_id: str, start_day: int, end_day: int) -> Booking:
    return Booking(
        id=booking_id,
        scenario_id="demo",
        resource_id="BRG-1",
        start_day=start_day,
        end_day=end_day,
        load=Decimal("1"),
        status=BookingStatus.PLANNED,
        cargo_id=booking_id,
    )


def _interval(start_day: int, end_day: int) -> ResourceUnavailability:
    return ResourceUnavailability(
        id="maintenance-1",
        scenario_id="demo",
        resource_id="BRG-1",
        start_day=start_day,
        end_day=end_day,
        kind="maintenance",
        reason="planned maintenance",
    )


def _snapshot(
    bookings: tuple[Booking, ...],
    unavailability: tuple[ResourceUnavailability, ...],
) -> ScheduleSnapshot:
    return ScheduleSnapshot(
        scenario_id="demo",
        jobs=(),
        resources=(_resource(),),
        bookings=bookings,
        unavailability=unavailability,
    )


def test_unavailability_uses_inclusive_first_and_last_days() -> None:
    interval = _interval(3, 5)

    first = simulate(_snapshot((_booking("first", 3, 3),), (interval,)), [], OFFSHORE_PACK)
    last = simulate(_snapshot((_booking("last", 5, 5),), (interval,)), [], OFFSHORE_PACK)
    outside = simulate(_snapshot((_booking("outside", 6, 6),), (interval,)), [], OFFSHORE_PACK)

    first_days = {
        finding.day
        for finding in first.violations
        if finding.kind is ViolationKind.RESOURCE_UNAVAILABLE
    }
    last_days = {
        finding.day
        for finding in last.violations
        if finding.kind is ViolationKind.RESOURCE_UNAVAILABLE
    }
    assert first_days == {3}
    assert last_days == {5}
    assert not any(
        finding.kind is ViolationKind.RESOURCE_UNAVAILABLE for finding in outside.violations
    )


def test_unavailability_overlap_is_infeasible_and_preserves_historical_booking() -> None:
    booking = _booking("historical", 4, 4)
    result = simulate(_snapshot((booking,), (_interval(5, 6),)), [], OFFSHORE_PACK)

    assert result.feasible
    assert result.snapshot.bookings == (booking,)

    conflicting = simulate(_snapshot((booking,), (_interval(4, 6),)), [], OFFSHORE_PACK)
    assert not conflicting.feasible
    assert any(
        finding.kind is ViolationKind.RESOURCE_UNAVAILABLE
        and finding.object_id == "historical"
        for finding in conflicting.violations
    )
    assert conflicting.snapshot.bookings == (booking,)


def test_unavailable_days_have_zero_capacity_and_are_not_eligible_points() -> None:
    report = calculate_capacity(
        _resource(),
        (),
        (_interval(3, 4),),
        from_day=2,
        to_day=5,
    )

    assert [(point.day, point.capacity) for point in report.points] == [
        (2, Decimal("1")),
        (3, Decimal("0")),
        (4, Decimal("0")),
        (5, Decimal("1")),
    ]
    assert report.points[1].utilization_percent == Decimal("0")
