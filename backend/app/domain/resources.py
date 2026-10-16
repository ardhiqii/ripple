from dataclasses import dataclass, field
from decimal import Decimal

from app.domain.enums import BookingStatus, ResourceType
from app.domain.errors import InvalidEntityError


@dataclass(frozen=True, slots=True)
class Resource:
    id: str
    scenario_id: str
    type: ResourceType
    name: str
    capacity: Decimal
    unit: str
    active: bool = True
    metadata: dict[str, object] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not self.id.strip() or not self.scenario_id.strip() or not self.name.strip():
            raise InvalidEntityError("resource id, scenario_id, and name are required")
        if self.capacity <= 0:
            raise InvalidEntityError("resource capacity must be positive")
        if not self.unit.strip():
            raise InvalidEntityError("resource unit is required")


@dataclass(frozen=True, slots=True)
class ResourceUnavailability:
    """Inclusive interval during which a resource cannot accept a booking."""

    id: str
    scenario_id: str
    resource_id: str
    start_day: int
    end_day: int
    kind: str
    reason: str

    def __post_init__(self) -> None:
        if not self.id.strip() or not self.scenario_id.strip() or not self.resource_id.strip():
            raise InvalidEntityError(
                "resource unavailability id, scenario_id, and resource_id are required"
            )
        if self.end_day < self.start_day:
            raise InvalidEntityError(
                "resource unavailability end_day must be on or after start_day"
            )
        if self.kind not in {"maintenance", "unavailable"}:
            raise InvalidEntityError("resource unavailability kind is invalid")
        if not self.reason.strip():
            raise InvalidEntityError("resource unavailability reason is required")


@dataclass(frozen=True, slots=True)
class Booking:
    id: str
    scenario_id: str
    resource_id: str
    start_day: int
    end_day: int
    load: Decimal
    status: BookingStatus = BookingStatus.PLANNED
    job_id: str | None = None
    cargo_id: str | None = None
    row_version: int = 1

    def __post_init__(self) -> None:
        if self.end_day < self.start_day:
            raise InvalidEntityError("booking end_day must be on or after start_day")
        if (self.job_id is None) == (self.cargo_id is None):
            raise InvalidEntityError("booking must reference exactly one job or cargo item")
        if self.load < 0:
            raise InvalidEntityError("booking load cannot be negative")
        if self.row_version <= 0:
            raise InvalidEntityError("booking row_version must be positive")
