from dataclasses import dataclass
from datetime import datetime

from app.domain.enums import Confidence, ReadinessStatus
from app.domain.errors import InvalidEntityError


@dataclass(frozen=True, slots=True)
class ReadinessItem:
    id: str
    scenario_id: str
    job_id: str
    stage: str
    step_order: int
    lead_time_days: int
    planned_day: int | None = None
    eta_earliest: int | None = None
    eta_latest: int | None = None
    confidence: Confidence = Confidence.MEDIUM
    status: ReadinessStatus = ReadinessStatus.PENDING
    source_type: str = "manual"
    source_reference: str | None = None
    not_before_day: int | None = None
    risk_buffer_days: int = 0
    last_updated: datetime | None = None
    row_version: int = 1

    def __post_init__(self) -> None:
        if not self.id.strip() or not self.scenario_id.strip() or not self.job_id.strip():
            raise InvalidEntityError("readiness id, scenario_id, and job_id are required")
        if self.step_order < 1:
            raise InvalidEntityError("readiness step_order must be positive")
        if self.lead_time_days < 0 or self.risk_buffer_days < 0:
            raise InvalidEntityError("readiness lead and buffer days cannot be negative")
        if self.eta_earliest is not None and self.eta_latest is not None:
            if self.eta_latest < self.eta_earliest:
                raise InvalidEntityError("eta_latest must be on or after eta_earliest")
        if self.row_version <= 0:
            raise InvalidEntityError("readiness row_version must be positive")

    @property
    def effective_eta_latest(self) -> int | None:
        if self.eta_latest is None:
            return None
        return self.eta_latest + self.risk_buffer_days
