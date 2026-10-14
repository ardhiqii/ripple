from dataclasses import dataclass
from decimal import Decimal
from enum import StrEnum

from app.domain.policy import DomainPack
from app.domain.resources import Booking, Resource


class WeatherStatus(StrEnum):
    GO = "go"
    NO_GO = "no_go"
    INSUFFICIENT_DATA = "insufficient_data"


@dataclass(frozen=True, slots=True)
class WeatherObservation:
    scenario_id: str
    location: str
    day: int
    metric: str
    value: Decimal | None
    go: bool | None
    source: str


@dataclass(frozen=True, slots=True)
class WeatherFinding:
    status: WeatherStatus
    location: str
    day: int
    evidence: str


def _location(resource: Resource) -> str:
    configured = resource.metadata.get("location")
    return configured if isinstance(configured, str) and configured else resource.name


def assess_weather(
    location: str,
    day: int,
    forecast: tuple[WeatherObservation, ...] | list[WeatherObservation],
    pack: DomainPack,
) -> WeatherFinding:
    observations = tuple(
        item
        for item in forecast
        if item.location == location and item.day == day and item.metric == pack.weather.metric
    )
    if not observations:
        return WeatherFinding(
            WeatherStatus.INSUFFICIENT_DATA,
            location,
            day,
            f"No {pack.weather.metric} forecast for {location} on D+{day}",
        )
    observation = observations[0]
    if observation.go is False:
        return WeatherFinding(
            WeatherStatus.NO_GO,
            location,
            day,
            f"Forecast source {observation.source} marks D+{day} as no-go",
        )
    if observation.value is None or observation.go is None:
        return WeatherFinding(
            WeatherStatus.INSUFFICIENT_DATA,
            location,
            day,
            f"Forecast for {location} on D+{day} is missing a usable go/value signal",
        )
    if observation.value > pack.weather.maximum:
        return WeatherFinding(
            WeatherStatus.NO_GO,
            location,
            day,
            f"{observation.metric}={observation.value} exceeds limit {pack.weather.maximum}",
        )
    return WeatherFinding(
        WeatherStatus.GO,
        location,
        day,
        f"{observation.metric}={observation.value} within limit {pack.weather.maximum}",
    )


def check_booking_weather(
    booking: Booking,
    resource: Resource,
    forecast: tuple[WeatherObservation, ...] | list[WeatherObservation],
    pack: DomainPack,
) -> tuple[WeatherFinding, ...]:
    if booking.status.value == "cancelled":
        return ()
    if resource.type not in pack.weather.applies_to:
        return ()
    location = _location(resource)
    return tuple(
        assess_weather(location, day, forecast, pack)
        for day in range(booking.start_day, booking.end_day + 1)
    )
