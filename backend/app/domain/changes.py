from dataclasses import dataclass, field
from uuid import UUID, uuid4

from app.domain.enums import EventNature, EventOrigin, EventState, RiskTag
from app.domain.errors import InvalidEntityError


@dataclass(frozen=True, slots=True)
class RiskEvidence:
    tag: RiskTag
    source_sentence: str
    object_id: str | None = None

    def __post_init__(self) -> None:
        if not self.source_sentence.strip():
            raise InvalidEntityError("risk evidence requires a source sentence")


@dataclass(frozen=True, slots=True)
class ChangeEvent:
    scenario_id: str
    nature: EventNature
    raw_text: str
    cause: str | None = None
    origin: EventOrigin = EventOrigin.MANUAL
    state: EventState = EventState.RECEIVED
    event_id: UUID = field(default_factory=uuid4)
    parent_event_id: UUID | None = None
    parent_plan_id: UUID | None = None
    extraction_version: int = 0

    def __post_init__(self) -> None:
        if not self.scenario_id.strip() or not self.raw_text.strip():
            raise InvalidEntityError("change event requires scenario_id and raw_text")
        if self.extraction_version < 0:
            raise InvalidEntityError("extraction_version cannot be negative")
