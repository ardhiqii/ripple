"""Read-only, scenario-scoped Ask Ripple answers.

This adapter deliberately does not call the model gateway.  Ask is a bounded
read model for the preview: the question is untrusted display input, while
only validated canonical IDs are used to select persisted evidence.
"""

from datetime import UTC, datetime, timedelta
from typing import Literal
from uuid import UUID

from app.application.errors import ApplicationError
from app.domain.policy import DomainPack
from app.persistence.models import Event, Job, Plan, ReadinessItem, Resource, ScheduleState
from app.persistence.repositories import ScheduleRepository
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

Freshness = Literal["current", "stale", "unknown"]


class AskApiModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AskContext(AskApiModel):
    job_ids: tuple[str, ...] = Field(default_factory=tuple, max_length=50)
    resource_ids: tuple[str, ...] = Field(default_factory=tuple, max_length=50)
    readiness_item_ids: tuple[str, ...] = Field(default_factory=tuple, max_length=50)
    event_id: UUID | None = None
    plan_id: UUID | None = None
    schedule_version: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def validate_unique_ids(self) -> "AskContext":
        for name in ("job_ids", "resource_ids", "readiness_item_ids"):
            values = getattr(self, name)
            if len(set(values)) != len(values):
                raise ValueError(f"{name} must not contain duplicates")
        return self


class AskRequest(AskApiModel):
    question: str = Field(min_length=1, max_length=2000)
    context: AskContext | None = None

    @field_validator("question", mode="before")
    @classmethod
    def trim_question(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class AskEvidence(AskApiModel):
    entity_type: str
    entity_id: str
    label: str
    source_updated_at: datetime | None


class AskResponse(AskApiModel):
    scenario_id: str
    answer: str
    evidence: tuple[AskEvidence, ...]
    freshness: Freshness
    uncertainty: str | None
    schedule_version: int
    answered_at: datetime


class AskService:
    """Produce a factual answer without mutating operational data."""

    def __init__(self, session: AsyncSession, pack: DomainPack) -> None:
        self._session = session
        self._pack = pack

    async def answer(self, scenario_id: str, payload: AskRequest) -> AskResponse:
        try:
            return await self._answer(scenario_id, payload)
        except ApplicationError:
            raise
        except (SQLAlchemyError, OSError, TimeoutError) as exc:
            raise ApplicationError(
                503,
                "ask_unavailable",
                "The read-only Ask service is temporarily unavailable.",
                retryable=True,
            ) from exc

    async def _answer(self, scenario_id: str, payload: AskRequest) -> AskResponse:
        try:
            snapshot = await ScheduleRepository(self._session).load_snapshot(scenario_id)
        except LookupError as exc:
            raise ApplicationError(
                404,
                "unknown_scenario",
                "The requested scenario has no persisted data.",
                details={"scenario_id": scenario_id},
            ) from exc

        context = payload.context or AskContext()
        evidence: list[AskEvidence] = []
        await self._append_jobs(scenario_id, context.job_ids, evidence)
        await self._append_resources(scenario_id, context.resource_ids, evidence)
        await self._append_readiness(scenario_id, context.readiness_item_ids, evidence)
        if context.event_id is not None:
            await self._append_event(scenario_id, context.event_id, evidence)
        if context.plan_id is not None:
            await self._append_plan(scenario_id, context.plan_id, evidence)

        state = await self._session.scalar(
            select(ScheduleState).where(ScheduleState.scenario_id == scenario_id)
        )
        if state is None:
            raise ApplicationError(
                404,
                "unknown_scenario",
                "The requested scenario has no persisted schedule state.",
                details={"scenario_id": scenario_id},
            )
        if not evidence:
            evidence.append(
                AskEvidence(
                    entity_type="scenario",
                    entity_id=scenario_id,
                    label=f"Scenario {scenario_id} schedule",
                    source_updated_at=state.updated_at,
                )
            )
        if (
            context.schedule_version is not None
            and context.schedule_version != snapshot.schedule_version
        ):
            freshness: Freshness = "stale"
            uncertainty = (
                f"The supplied schedule version {context.schedule_version} is not current; "
                f"the server reports version {snapshot.schedule_version}."
            )
        else:
            freshness = _freshness(evidence, datetime.now(UTC), self._pack.stale_after_hours)
            uncertainty = _uncertainty(freshness)

        answer = _build_answer(
            scenario_id=scenario_id,
            question=payload.question,
            evidence=evidence,
            freshness=freshness,
            schedule_version=snapshot.schedule_version,
        )
        return AskResponse(
            scenario_id=scenario_id,
            answer=answer,
            evidence=tuple(evidence),
            freshness=freshness,
            uncertainty=uncertainty,
            schedule_version=snapshot.schedule_version,
            answered_at=datetime.now(UTC),
        )

    async def _append_jobs(
        self, scenario_id: str, ids: tuple[str, ...], evidence: list[AskEvidence]
    ) -> None:
        if not ids:
            return
        result = await self._session.execute(
            select(Job).where(Job.scenario_id == scenario_id, Job.id.in_(ids))
        )
        rows = {row.id: row for row in result.scalars().all()}
        for entity_id in ids:
            row = rows.get(entity_id)
            if row is None:
                raise _missing_entity("job", entity_id, scenario_id)
            evidence.append(
                AskEvidence(
                    entity_type="job",
                    entity_id=row.id,
                    label=f"Job {row.id}: {row.site} / {row.job_type}",
                    source_updated_at=None,
                )
            )

    async def _append_resources(
        self, scenario_id: str, ids: tuple[str, ...], evidence: list[AskEvidence]
    ) -> None:
        if not ids:
            return
        result = await self._session.execute(
            select(Resource).where(Resource.scenario_id == scenario_id, Resource.id.in_(ids))
        )
        rows = {row.id: row for row in result.scalars().all()}
        for entity_id in ids:
            row = rows.get(entity_id)
            if row is None:
                raise _missing_entity("resource", entity_id, scenario_id)
            evidence.append(
                AskEvidence(
                    entity_type="resource",
                    entity_id=row.id,
                    label=f"Resource {row.name} ({row.type})",
                    source_updated_at=None,
                )
            )

    async def _append_readiness(
        self, scenario_id: str, ids: tuple[str, ...], evidence: list[AskEvidence]
    ) -> None:
        if not ids:
            return
        result = await self._session.execute(
            select(ReadinessItem).where(
                ReadinessItem.scenario_id == scenario_id,
                ReadinessItem.id.in_(ids),
            )
        )
        rows = {row.id: row for row in result.scalars().all()}
        for entity_id in ids:
            row = rows.get(entity_id)
            if row is None:
                raise _missing_entity("readiness_item", entity_id, scenario_id)
            evidence.append(
                AskEvidence(
                    entity_type="readiness_item",
                    entity_id=row.id,
                    label=f"Readiness {row.id}: {row.stage}",
                    source_updated_at=_as_utc(row.last_updated_at),
                )
            )

    async def _append_event(
        self, scenario_id: str, entity_id: UUID, evidence: list[AskEvidence]
    ) -> None:
        row = await self._session.scalar(
            select(Event).where(Event.scenario_id == scenario_id, Event.id == entity_id)
        )
        if row is None:
            raise _missing_entity("event", str(entity_id), scenario_id)
        evidence.append(
            AskEvidence(
                entity_type="event",
                entity_id=str(row.id),
                label=f"Event {row.id}: {row.cause or row.state}",
                source_updated_at=_as_utc(row.updated_at),
            )
        )

    async def _append_plan(
        self, scenario_id: str, entity_id: UUID, evidence: list[AskEvidence]
    ) -> None:
        row = await self._session.scalar(
            select(Plan)
            .join(Event, Event.id == Plan.event_id)
            .where(Plan.id == entity_id, Event.scenario_id == scenario_id)
        )
        if row is None:
            raise _missing_entity("plan", str(entity_id), scenario_id)
        evidence.append(
            AskEvidence(
                entity_type="plan",
                entity_id=str(row.id),
                label=f"Plan {row.id}: {row.status}",
                source_updated_at=_as_utc(row.created_at),
            )
        )


def _missing_entity(entity_type: str, entity_id: str, scenario_id: str) -> ApplicationError:
    return ApplicationError(
        404,
        "unknown_entity",
        "The requested context entity is not available in the active scenario.",
        details={"entity_type": entity_type, "entity_id": entity_id, "scenario_id": scenario_id},
    )


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _freshness(
    evidence: list[AskEvidence], as_of: datetime, stale_after_hours: int
) -> Freshness:
    if any(
        item.source_updated_at is not None
        and as_of - item.source_updated_at > timedelta(hours=stale_after_hours)
        for item in evidence
    ):
        return "stale"
    if any(item.source_updated_at is None for item in evidence):
        return "unknown"
    return "current"


def _uncertainty(freshness: Freshness) -> str | None:
    if freshness == "stale":
        return "Some evidence is older than the configured freshness window."
    if freshness == "unknown":
        return "Some evidence has no source timestamp; freshness could not be established."
    return "The answer is limited to current persisted facts; no schedule change was computed."


def _build_answer(
    *,
    scenario_id: str,
    question: str,
    evidence: list[AskEvidence],
    freshness: Freshness,
    schedule_version: int,
) -> str:
    del question  # The question is intentionally never interpreted as an instruction.
    labels = "; ".join(item.label for item in evidence[:5])
    freshness_note = {
        "current": "Evidence is current within the configured freshness window.",
        "stale": "Some evidence is stale; treat this as a warning, not a write recommendation.",
        "unknown": "Some evidence freshness is unknown because its source has no timestamp.",
    }[freshness]
    return (
        f"Read-only answer for scenario {scenario_id}. Current facts: {labels}. "
        f"Schedule version: {schedule_version}. {freshness_note} "
        "Inference is limited to the supplied evidence; no event, run, readiness, "
        "decision, schedule, or outbox data was changed."
    )
