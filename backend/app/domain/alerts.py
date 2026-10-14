from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import datetime
from uuid import UUID, uuid4

from app.domain.enums import AlertSeverity, AlertState
from app.domain.errors import InvalidEntityError


@dataclass(frozen=True, slots=True)
class Alert:
    scenario_id: str
    alert_type: str
    severity: AlertSeverity
    dedupe_key: str
    affected_objects: tuple[Mapping[str, object], ...] = ()
    evidence: tuple[Mapping[str, object], ...] = ()
    state: AlertState = AlertState.OPEN
    event_id: UUID | None = None
    decision_id: UUID | None = None
    acknowledged_by: str | None = None
    dismissed_by: str | None = None
    resolved_at: datetime | None = None
    alert_id: UUID = field(default_factory=uuid4)

    def __post_init__(self) -> None:
        if (
            not self.scenario_id.strip()
            or not self.alert_type.strip()
            or not self.dedupe_key.strip()
        ):
            raise InvalidEntityError("alert scenario, type, and dedupe_key are required")
