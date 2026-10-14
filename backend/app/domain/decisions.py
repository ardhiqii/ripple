from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import datetime
from uuid import UUID, uuid4

from app.domain.enums import DecisionAction
from app.domain.errors import InvalidEntityError


@dataclass(frozen=True, slots=True)
class Decision:
    plan_id: UUID
    action: DecisionAction
    actor: str
    schedule_version_before: int
    acknowledged_condition_ids: tuple[str, ...] = ()
    reason: str | None = None
    reason_category: str | None = None
    schedule_version_after: int | None = None
    created_at: datetime | None = None
    decision_id: UUID = field(default_factory=uuid4)

    def __post_init__(self) -> None:
        if not self.actor.strip() or self.schedule_version_before < 0:
            raise InvalidEntityError(
                "decision actor and non-negative schedule version are required"
            )
        if self.action is DecisionAction.REJECT and not self.reason:
            raise InvalidEntityError("rejected decisions require a reason")


@dataclass(frozen=True, slots=True)
class DecisionChange:
    decision_id: UUID
    entity_type: str
    entity_id: str
    change_kind: str
    before: Mapping[str, object]
    after: Mapping[str, object]

    def __post_init__(self) -> None:
        if not self.entity_type.strip() or not self.entity_id.strip():
            raise InvalidEntityError("decision change requires an entity type and id")
