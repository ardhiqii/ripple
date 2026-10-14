from dataclasses import dataclass
from decimal import Decimal

from app.domain.resources import Booking, Resource


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
) -> CapacityReport:
    """Calculate daily unary overlap or aggregate load for one resource."""

    relevant = tuple(
        booking
        for booking in bookings
        if booking.resource_id == resource.id and booking.status.value != "cancelled"
    )
    if not relevant:
        return CapacityReport(resource.id, resource.unit, ())

    first_day = min(booking.start_day for booking in relevant)
    last_day = max(booking.end_day for booking in relevant)
    points: list[CapacityPoint] = []
    for day in range(first_day, last_day + 1):
        active = tuple(booking for booking in relevant if day in _booking_days(booking))
        if resource.unit == "job":
            used = Decimal(len(active))
        else:
            used = sum((booking.load for booking in active), Decimal("0"))
        overflow = max(used - resource.capacity, Decimal("0"))
        points.append(
            CapacityPoint(
                resource_id=resource.id,
                day=day,
                used=used,
                capacity=resource.capacity,
                overflow=overflow,
                booking_ids=tuple(booking.id for booking in active),
            )
        )
    return CapacityReport(resource.id, resource.unit, tuple(points))


def calculate_all_capacity(
    resources: tuple[Resource, ...] | list[Resource],
    bookings: tuple[Booking, ...] | list[Booking],
) -> tuple[CapacityReport, ...]:
    return tuple(calculate_capacity(resource, bookings) for resource in resources)
