from dataclasses import dataclass
from decimal import Decimal

from app.domain.enums import JobStatus
from app.domain.errors import InvalidEntityError


@dataclass(frozen=True, slots=True)
class Job:
    id: str
    scenario_id: str
    site: str
    job_type: str
    start_day: int
    duration_days: int
    shortfall_bopd: Decimal
    locked: bool = False
    lock_reason: str | None = None
    status: JobStatus = JobStatus.PLANNED
    row_version: int = 1

    def __post_init__(self) -> None:
        if not self.id.strip() or not self.scenario_id.strip():
            raise InvalidEntityError("job id and scenario_id are required")
        if self.duration_days <= 0:
            raise InvalidEntityError("job duration_days must be positive")
        if self.shortfall_bopd < 0:
            raise InvalidEntityError("job shortfall_bopd cannot be negative")
        if self.row_version <= 0:
            raise InvalidEntityError("job row_version must be positive")
        if self.locked and not self.lock_reason:
            raise InvalidEntityError("locked jobs require a lock_reason")
