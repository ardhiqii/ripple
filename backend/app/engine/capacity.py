from dataclasses import dataclass
from decimal import Decimal

from app.domain.resources import Booking, Resource, ResourceUnavailability


@dataclass(frozen=True, slots=True)
class CapacityPoint:
    resource_id: str
    day: int
    used: Decimal
    capacity: Decimal
    overflow: Decimal
    booking_ids: tuple[str, ...]

    @property
    def utilization_percent(self) -> Decimal:
        if self.capacity == 0:
            return Decimal("0")
        return (self.used / self.capacity) * Decimal("100")


@dataclass(frozen=True, slots=True)
class CapacityReport:
    resource_id: str
    unit: str
    points: tuple[CapacityPoint, ...]

    @property
    def feasible(self) -> bool:
        return all(point.overflow <= 0 for point in self.points)

    @property
    def max_overflow(self) -> Decimal:
        return max((point.overflow for point in self.points), default=Decimal("0"))


def _booking_days(booking: Booking) -> range:
    return range(booking.start_day, booking.end_day + 1)


def calculate_capacity(
    resource: Resource,
    bookings: tuple[Booking, ...] | list[Booking],
    unavailability: tuple[ResourceUnavailability, ...] | list[ResourceUnavailability] = (),
    *,
    from_day: int | None = None,
    to_day: int | None = None,
) -> CapacityReport:
    """Calculate daily unary overlap or aggregate load for one resource."""

    relevant = tuple(
        booking
        for booking in bookings
        if booking.resource_id == resource.id and booking.status.value != "cancelled"
    )
    relevant_unavailability = tuple(
        interval for interval in unavailability if interval.resource_id == resource.id
    )
    if not relevant and not relevant_unavailability and (from_day is None or to_day is None):
        return CapacityReport(resource.id, resource.unit, ())

    starts = [booking.start_day for booking in relevant]
    ends = [booking.end_day for booking in relevant]
    starts.extend(interval.start_day for interval in relevant_unavailability)
    ends.extend(interval.end_day for interval in relevant_unavailability)
    if from_day is not None:
        starts.append(from_day)
    if to_day is not None:
        ends.append(to_day)
    if not starts or not ends:
        return CapacityReport(resource.id, resource.unit, ())
    first_day = min(starts)
    last_day = max(ends)
    if first_day > last_day:
        return CapacityReport(resource.id, resource.unit, ())
    points: list[CapacityPoint] = []
    for day in range(first_day, last_day + 1):
        active = tuple(booking for booking in relevant if day in _booking_days(booking))
        if resource.unit == "job":
            used = Decimal(len(active))
        else:
            used = sum((booking.load for booking in active), Decimal("0"))
        unavailable = any(
            interval.start_day <= day <= interval.end_day for interval in relevant_unavailability
        )
        capacity = Decimal("0") if unavailable else resource.capacity
        overflow = max(used - capacity, Decimal("0"))
        points.append(
            CapacityPoint(
                resource_id=resource.id,
                day=day,
                used=used,
                capacity=capacity,
                overflow=overflow,
                booking_ids=tuple(booking.id for booking in active),
            )
        )
    return CapacityReport(resource.id, resource.unit, tuple(points))


def calculate_all_capacity(
    resources: tuple[Resource, ...] | list[Resource],
    bookings: tuple[Booking, ...] | list[Booking],
    unavailability: tuple[ResourceUnavailability, ...] | list[ResourceUnavailability] = (),
    *,
    from_day: int | None = None,
    to_day: int | None = None,
) -> tuple[CapacityReport, ...]:
    return tuple(
        calculate_capacity(
            resource,
            bookings,
            unavailability,
            from_day=from_day,
            to_day=to_day,
        )
        for resource in resources
    )
