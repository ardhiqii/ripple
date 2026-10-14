"""Scenario-scoped repository adapters.

Repositories own query shape and persistence-to-domain mapping. They do not
contain scheduling, readiness, or approval business rules; those remain in the
domain and engine layers.
"""

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

from app.domain.alerts import Alert as DomainAlert
from app.domain.changes import ChangeEvent
from app.domain.decisions import Decision as DomainDecision
from app.domain.decisions import DecisionChange as DomainDecisionChange
from app.domain.enums import (
    AlertSeverity,
    AlertState,
    BookingStatus,
    Confidence,
    DecisionAction,
    JobStatus,
    PlanStatus,
    PlanVerdict,
    ReadinessStatus,
    ResourceType,
    SolverStatus,
)
from app.domain.jobs import Job
from app.domain.plans import Plan as DomainPlan
from app.domain.plans import PlanEvidence as DomainPlanEvidence
from app.domain.plans import PlanOption as DomainPlanOption
from app.domain.readiness import ReadinessItem
from app.domain.resources import Booking, Resource
from app.engine.simulate import ScheduleSnapshot
from app.engine.weather import WeatherObservation
from app.persistence.models import (
    AgentRun,
    AgentRunEvent,
    Alert,
    Decision,
    DecisionChange,
    Event,
    EventExtraction,
    IdempotencyKey,
    NotificationOutbox,
    Plan,
    PlanEvidence,
    PlanOption,
    ReadinessSuggestion,
    ScheduleState,
    WeatherForecast,
)
from app.persistence.models import (
    Booking as BookingRow,
)
from app.persistence.models import (
    Job as JobRow,
)
from app.persistence.models import (
    ReadinessItem as ReadinessItemRow,
)
from app.persistence.models import (
    Resource as ResourceRow,
)
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession


def _decimal(value: Any) -> Decimal:
    return Decimal(str(value))


def _confidence(value: Any) -> Confidence:
    if value is None:
        return Confidence.MEDIUM
    if isinstance(value, Confidence):
        return value
    if isinstance(value, str):
        try:
            return Confidence(value)
        except ValueError:
            pass
    numeric = _decimal(value)
    if numeric >= Decimal("0.8"):
        return Confidence.HIGH
    if numeric >= Decimal("0.5"):
        return Confidence.MEDIUM
    return Confidence.LOW


def _json_mapping(value: Any) -> Mapping[str, object]:
    return value if isinstance(value, dict) else {}


def _json_mappings(value: Any) -> tuple[Mapping[str, object], ...]:
    if not isinstance(value, list):
        return ()
    return tuple(item for item in value if isinstance(item, dict))


def to_job(row: JobRow) -> Job:
    return Job(
        id=row.id,
        scenario_id=row.scenario_id,
        site=row.site,
        job_type=row.job_type,
        start_day=row.start_day,
        duration_days=row.duration_days,
        shortfall_bopd=_decimal(row.shortfall_bopd),
        locked=row.locked,
        lock_reason=row.lock_reason,
        status=JobStatus(row.status),
        row_version=row.row_version,
    )


def to_resource(row: ResourceRow) -> Resource:
    return Resource(
        id=row.id,
        scenario_id=row.scenario_id,
        type=ResourceType(row.type),
        name=row.name,
        capacity=_decimal(row.capacity),
        unit=row.unit,
        active=row.active,
        metadata=dict(row.metadata_json),
    )


def to_booking(row: BookingRow) -> Booking:
    return Booking(
        id=row.id,
        scenario_id=row.scenario_id,
        resource_id=row.resource_id,
        start_day=row.start_day,
        end_day=row.end_day,
        load=_decimal(row.load),
        status=BookingStatus(row.status),
        job_id=row.job_id,
        # The schema's activity_id is the storage-side owner for cargo
        # bookings; the engine's domain name for that owner is cargo_id.
        cargo_id=None if row.job_id is not None else row.activity_id,
        row_version=row.row_version,
    )


def to_readiness_item(row: ReadinessItemRow) -> ReadinessItem:
    return ReadinessItem(
        id=row.id,
        scenario_id=row.scenario_id,
        job_id=row.job_id,
        stage=row.stage,
        step_order=row.step_order,
        lead_time_days=row.lead_time_days,
        planned_day=row.planned_day,
        eta_earliest=row.eta_earliest_day,
        eta_latest=row.eta_latest_day,
        confidence=_confidence(row.confidence),
        status=ReadinessStatus(row.status),
        source_type=row.source_type,
        source_reference=row.source_reference,
        not_before_day=row.not_before_day,
        risk_buffer_days=row.risk_buffer_days,
        last_updated=row.last_updated_at,
        row_version=row.row_version,
    )


def to_weather_observation(row: WeatherForecast) -> WeatherObservation:
    return WeatherObservation(
        scenario_id=row.scenario_id,
        location=row.location,
        day=row.day,
        metric="wave_height_m",
        value=_decimal(row.wave_height),
        go=row.go_flag,
        source=row.source,
    )


class ScheduleRepository:
    """Load complete, scenario-scoped engine snapshots."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_schedule_version(self, scenario_id: str) -> int | None:
        result = await self._session.execute(
            select(ScheduleState.version).where(ScheduleState.scenario_id == scenario_id)
        )
        return result.scalar_one_or_none()

    async def lock_state_for_update(self, scenario_id: str) -> ScheduleState | None:
        result = await self._session.execute(
            select(ScheduleState).where(ScheduleState.scenario_id == scenario_id).with_for_update()
        )
        return result.scalar_one_or_none()

    async def load_snapshot(self, scenario_id: str) -> ScheduleSnapshot:
        state_result = await self._session.execute(
            select(ScheduleState).where(ScheduleState.scenario_id == scenario_id)
        )
        state = state_result.scalar_one_or_none()
        if state is None:
            raise LookupError(f"unknown scenario: {scenario_id}")

        jobs_result = await self._session.execute(
            select(JobRow)
            .where(JobRow.scenario_id == scenario_id)
            .order_by(JobRow.start_day, JobRow.id)
        )
        resources_result = await self._session.execute(
            select(ResourceRow)
            .where(ResourceRow.scenario_id == scenario_id)
            .order_by(ResourceRow.id)
        )
        bookings_result = await self._session.execute(
            select(BookingRow)
            .where(BookingRow.scenario_id == scenario_id)
            .order_by(BookingRow.start_day, BookingRow.id)
        )
        readiness_result = await self._session.execute(
            select(ReadinessItemRow)
            .where(ReadinessItemRow.scenario_id == scenario_id)
            .order_by(ReadinessItemRow.job_id, ReadinessItemRow.step_order, ReadinessItemRow.id)
        )
        forecast_result = await self._session.execute(
            select(WeatherForecast)
            .where(WeatherForecast.scenario_id == scenario_id)
            .order_by(WeatherForecast.location, WeatherForecast.day)
        )
        return ScheduleSnapshot(
            scenario_id=scenario_id,
            jobs=tuple(to_job(row) for row in jobs_result.scalars().all()),
            resources=tuple(to_resource(row) for row in resources_result.scalars().all()),
            bookings=tuple(to_booking(row) for row in bookings_result.scalars().all()),
            readiness_items=tuple(
                to_readiness_item(row) for row in readiness_result.scalars().all()
            ),
            forecast=tuple(to_weather_observation(row) for row in forecast_result.scalars().all()),
            schedule_version=state.version,
        )

    async def set_locked_version(
        self, state: ScheduleState, version: int, *, updated_at: datetime
    ) -> int:
        if version < state.version:
            raise ValueError("schedule version cannot move backwards")
        state.version = version
        state.updated_at = updated_at
        await self._session.flush()
        return int(state.version)

    async def apply_changes(
        self,
        scenario_id: str,
        changes: tuple[Mapping[str, object], ...],
        *,
        updated_at: datetime,
    ) -> None:
        """Apply only the change shapes verified by the deterministic engine."""

        for change in changes:
            kind = change.get("kind")
            target = change.get("target")
            value = change.get("value")
            if not isinstance(kind, str) or not isinstance(target, str) or not target.strip():
                raise ValueError("schedule change requires kind and target")

            if kind == "move_job":
                if not isinstance(value, int) or isinstance(value, bool):
                    raise ValueError("move_job requires an integer value")
                result = await self._session.execute(
                    select(JobRow)
                    .where(JobRow.id == target, JobRow.scenario_id == scenario_id)
                    .with_for_update()
                )
                job = result.scalar_one_or_none()
                if job is None:
                    raise LookupError(f"unknown job: {target}")
                delta = value - job.start_day
                if delta:
                    job.start_day = value
                    job.row_version += 1
                    bookings_result = await self._session.execute(
                        select(BookingRow)
                        .where(
                            BookingRow.job_id == target,
                            BookingRow.scenario_id == scenario_id,
                        )
                        .with_for_update()
                    )
                    for booking in bookings_result.scalars().all():
                        booking.start_day += delta
                        booking.end_day += delta
                        booking.row_version += 1
                continue

            if kind == "set_item_date":
                if not isinstance(value, int) or isinstance(value, bool):
                    raise ValueError("set_item_date requires an integer value")
                result = await self._session.execute(
                    select(ReadinessItemRow)
                    .where(
                        ReadinessItemRow.id == target,
                        ReadinessItemRow.scenario_id == scenario_id,
                    )
                    .with_for_update()
                )
                item = result.scalar_one_or_none()
                if item is None:
                    raise LookupError(f"unknown readiness item: {target}")
                if item.planned_day != value:
                    item.planned_day = value
                    item.row_version += 1
                    item.last_updated_at = updated_at
                continue

            if kind == "assign_cargo":
                if not isinstance(value, str) or not value.strip():
                    raise ValueError("assign_cargo requires a resource id")
                resource_result = await self._session.execute(
                    select(ResourceRow.id).where(
                        ResourceRow.id == value,
                        ResourceRow.scenario_id == scenario_id,
                    )
                )
                if resource_result.scalar_one_or_none() is None:
                    raise LookupError(f"unknown resource: {value}")
                result = await self._session.execute(
                    select(BookingRow)
                    .where(
                        BookingRow.id == target,
                        BookingRow.scenario_id == scenario_id,
                    )
                    .with_for_update()
                )
                booking = result.scalar_one_or_none()
                if booking is None:
                    result = await self._session.execute(
                        select(BookingRow)
                        .where(
                            BookingRow.activity_id == target,
                            BookingRow.scenario_id == scenario_id,
                        )
                        .with_for_update()
                    )
                    booking = result.scalar_one_or_none()
                if booking is None:
                    raise LookupError(f"unknown cargo booking: {target}")
                if booking.resource_id != value:
                    booking.resource_id = value
                    booking.row_version += 1
                continue

            if kind == "move_cargo":
                if not isinstance(value, int) or isinstance(value, bool):
                    raise ValueError("move_cargo requires an integer value")
                result = await self._session.execute(
                    select(BookingRow)
                    .where(
                        BookingRow.scenario_id == scenario_id,
                        (BookingRow.id == target) | (BookingRow.activity_id == target),
                    )
                    .with_for_update()
                )
                booking = result.scalar_one_or_none()
                if booking is None:
                    raise LookupError(f"unknown cargo booking: {target}")
                if booking.job_id is not None:
                    raise ValueError("move_cargo requires a cargo booking")
                if booking.start_day != value or booking.end_day != value:
                    booking.start_day = value
                    booking.end_day = value
                    booking.row_version += 1
                continue

            raise ValueError(f"unsupported schedule change kind: {kind}")

        await self._session.flush()


class ReadinessRepository:
    """Readiness item access constrained to one scenario boundary."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, item_id: str, scenario_id: str) -> ReadinessItem | None:
        result = await self._session.execute(
            select(ReadinessItemRow).where(
                ReadinessItemRow.id == item_id,
                ReadinessItemRow.scenario_id == scenario_id,
            )
        )
        row = result.scalar_one_or_none()
        return None if row is None else to_readiness_item(row)

    async def list_for_scenario(
        self, scenario_id: str, job_id: str | None = None
    ) -> tuple[ReadinessItem, ...]:
        statement = select(ReadinessItemRow).where(ReadinessItemRow.scenario_id == scenario_id)
        if job_id is not None:
            statement = statement.where(ReadinessItemRow.job_id == job_id)
        result = await self._session.execute(
            statement.order_by(ReadinessItemRow.job_id, ReadinessItemRow.step_order)
        )
        return tuple(to_readiness_item(row) for row in result.scalars().all())

    async def update_item(
        self,
        item_id: str,
        scenario_id: str,
        expected_row_version: int,
        values: Mapping[str, Any],
        *,
        updated_at: datetime,
    ) -> ReadinessItem | None:
        """Conditionally update one item and return the new domain value."""

        statement = (
            update(ReadinessItemRow)
            .where(
                ReadinessItemRow.id == item_id,
                ReadinessItemRow.scenario_id == scenario_id,
                ReadinessItemRow.row_version == expected_row_version,
            )
            .values(
                **dict(values),
                last_updated_at=updated_at,
                row_version=ReadinessItemRow.row_version + 1,
            )
        )
        result = await self._session.execute(statement)
        if getattr(result, "rowcount", 0) != 1:
            return None
        return await self.get(item_id, scenario_id)

    async def list_suggestions(
        self, item_id: str, scenario_id: str
    ) -> tuple[ReadinessSuggestion, ...]:
        result = await self._session.execute(
            select(ReadinessSuggestion)
            .join(Event, Event.id == ReadinessSuggestion.event_id)
            .where(
                ReadinessSuggestion.readiness_item_id == item_id,
                Event.scenario_id == scenario_id,
            )
            .order_by(ReadinessSuggestion.created_at, ReadinessSuggestion.id)
        )
        return tuple(result.scalars().all())

    async def get_suggestion(
        self, suggestion_id: UUID, scenario_id: str, *, for_update: bool = False
    ) -> ReadinessSuggestion | None:
        statement = (
            select(ReadinessSuggestion)
            .join(Event, Event.id == ReadinessSuggestion.event_id)
            .join(ReadinessItemRow, ReadinessItemRow.id == ReadinessSuggestion.readiness_item_id)
            .where(
                ReadinessSuggestion.id == suggestion_id,
                Event.scenario_id == scenario_id,
                ReadinessItemRow.scenario_id == scenario_id,
            )
        )
        if for_update:
            statement = statement.with_for_update()
        result = await self._session.execute(statement)
        return result.scalar_one_or_none()

    async def review_suggestion(
        self,
        suggestion_id: UUID,
        scenario_id: str,
        *,
        state: str,
        actor: str,
        note: str | None,
        reviewed_at: datetime,
    ) -> ReadinessSuggestion | None:
        row = await self.get_suggestion(suggestion_id, scenario_id, for_update=True)
        if row is None or row.state != "pending":
            return None
        row.state = state
        row.review_actor = actor
        row.review_note = note
        row.reviewed_at = reviewed_at
        row.updated_at = reviewed_at
        await self._session.flush()
        return row

    async def bump_schedule_version(self, scenario_id: str, *, updated_at: datetime) -> int:
        statement = (
            update(ScheduleState)
            .where(ScheduleState.scenario_id == scenario_id)
            .values(version=ScheduleState.version + 1, updated_at=updated_at)
            .returning(ScheduleState.version)
        )
        result = await self._session.execute(statement)
        version = result.scalar_one_or_none()
        if version is None:
            raise LookupError(f"unknown scenario: {scenario_id}")
        return int(version)

class EventRepository:
    """Persist and read event/extraction records within a scenario."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, event: ChangeEvent) -> UUID:
        row = Event(
            id=event.event_id,
            scenario_id=event.scenario_id,
            nature=event.nature.value,
            cause=event.cause,
            raw_text=event.raw_text,
            state=event.state.value,
            parent_event_id=event.parent_event_id,
            parent_plan_id=event.parent_plan_id,
            origin_type=event.origin.value,
            extraction_version=event.extraction_version,
            created_by="demo-planner",
        )
        self._session.add(row)
        await self._session.flush()
        return row.id

    async def create_event(
        self,
        *,
        event_id: UUID,
        scenario_id: str,
        raw_text: str,
        actor: str,
        nature: str | None,
        cause: str | None,
        parent_event_id: UUID | None,
        parent_plan_id: UUID | None,
        origin_type: str = "api",
    ) -> Event:
        row = Event(
            id=event_id,
            scenario_id=scenario_id,
            nature=nature,
            cause=cause,
            raw_text=raw_text,
            parent_event_id=parent_event_id,
            parent_plan_id=parent_plan_id,
            origin_type=origin_type,
            created_by=actor,
            state="received",
            extraction_version=0,
        )
        self._session.add(row)
        await self._session.flush()
        return row

    async def get(
        self, event_id: UUID, scenario_id: str, *, for_update: bool = False
    ) -> Event | None:
        statement = select(Event).where(Event.id == event_id, Event.scenario_id == scenario_id)
        if for_update:
            statement = statement.with_for_update()
        result = await self._session.execute(statement)
        return result.scalar_one_or_none()

    async def list_for_scenario(
        self,
        scenario_id: str,
        *,
        nature: str | None = None,
        state: str | None = None,
        search: str | None = None,
        after_created_at: datetime | None = None,
        after_id: UUID | None = None,
        limit: int = 101,
    ) -> tuple[Event, ...]:
        statement = select(Event).where(Event.scenario_id == scenario_id)
        if nature is not None:
            statement = statement.where(Event.nature == nature)
        if state is not None:
            statement = statement.where(Event.state == state)
        if search:
            statement = statement.where(Event.raw_text.ilike(f"%{search}%"))
        if after_created_at is not None and after_id is not None:
            statement = statement.where(
                (Event.created_at > after_created_at)
                | ((Event.created_at == after_created_at) & (Event.id > after_id))
            )
        result = await self._session.execute(
            statement.order_by(Event.created_at, Event.id).limit(limit)
        )
        return tuple(result.scalars().all())

    async def list_extractions(
        self, event_id: UUID, scenario_id: str
    ) -> tuple[EventExtraction, ...]:
        result = await self._session.execute(
            select(EventExtraction)
            .join(Event, Event.id == EventExtraction.event_id)
            .where(EventExtraction.event_id == event_id, Event.scenario_id == scenario_id)
            .order_by(EventExtraction.version)
        )
        return tuple(result.scalars().all())

    async def save_extraction(
        self,
        *,
        event_id: UUID,
        scenario_id: str,
        expected_version: int,
        extracted_json: Mapping[str, Any],
        model_name: str,
        prompt_version: str,
        confidence_summary: Mapping[str, Any],
        corrected: bool,
        correction_actor: str | None,
        state: str,
        nature: str | None,
        cause: str | None,
        now: datetime,
    ) -> EventExtraction | None:
        event = await self.get(event_id, scenario_id, for_update=True)
        if event is None or event.extraction_version != expected_version:
            return None
        version = expected_version + 1
        row = EventExtraction(
            event_id=event_id,
            version=version,
            extracted_json=dict(extracted_json),
            model_name=model_name,
            prompt_version=prompt_version,
            confidence_summary=dict(confidence_summary),
            corrected=corrected,
            correction_actor=correction_actor,
            corrected_at=now if corrected else None,
        )
        self._session.add(row)
        event.extraction_version = version
        event.state = state
        if nature is not None:
            event.nature = nature
        if cause is not None:
            event.cause = cause
        event.updated_at = now
        await self._session.flush()
        return row

    async def transition_state(
        self,
        event_id: UUID,
        scenario_id: str,
        *,
        expected_states: tuple[str, ...],
        state: str,
        now: datetime,
    ) -> Event | None:
        event = await self.get(event_id, scenario_id, for_update=True)
        if event is None or event.state not in expected_states:
            return None
        event.state = state
        event.updated_at = now
        await self._session.flush()
        return event

    async def mark_approved(self, event_id: UUID, scenario_id: str) -> Event | None:
        event = await self.get(event_id, scenario_id, for_update=True)
        if event is None:
            return None
        event.state = "closed"
        event.updated_at = datetime.now(UTC)
        await self._session.flush()
        return event

    async def delete_draft(self, event_id: UUID, scenario_id: str) -> bool | None:
        event = await self.get(event_id, scenario_id, for_update=True)
        if event is None:
            return None
        if event.state != "received" or event.extraction_version != 0:
            return False
        await self._session.delete(event)
        await self._session.flush()
        return True

    async def list_runs(self, event_id: UUID, scenario_id: str) -> tuple[AgentRun, ...]:
        result = await self._session.execute(
            select(AgentRun)
            .join(Event, Event.id == AgentRun.event_id)
            .where(AgentRun.event_id == event_id, Event.scenario_id == scenario_id)
            .order_by(AgentRun.started_at, AgentRun.id)
        )
        return tuple(result.scalars().all())

    async def list_plans(self, event_id: UUID, scenario_id: str) -> tuple[Plan, ...]:
        result = await self._session.execute(
            select(Plan)
            .join(Event, Event.id == Plan.event_id)
            .where(Plan.event_id == event_id, Event.scenario_id == scenario_id)
            .order_by(Plan.version, Plan.id)
        )
        return tuple(result.scalars().all())


class RunRepository:
    """Read agent runs and append replayable stream events with scenario scope."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(
        self, run_id: UUID, scenario_id: str, *, for_update: bool = False
    ) -> AgentRun | None:
        statement = (
            select(AgentRun)
            .join(Event, Event.id == AgentRun.event_id)
            .where(AgentRun.id == run_id, Event.scenario_id == scenario_id)
        )
        if for_update:
            statement = statement.with_for_update()
        result = await self._session.execute(statement)
        return result.scalar_one_or_none()

    async def get_idempotency_key(
        self,
        actor_id: str,
        route_scope: str,
        key: str,
        *,
        now: datetime,
        for_update: bool = False,
    ) -> IdempotencyKey | None:
        statement = select(IdempotencyKey).where(
            IdempotencyKey.actor_id == actor_id,
            IdempotencyKey.route_scope == route_scope,
            IdempotencyKey.key == key,
            IdempotencyKey.expires_at > now,
        )
        if for_update:
            statement = statement.with_for_update()
        result = await self._session.execute(statement)
        return result.scalar_one_or_none()

    async def save_idempotency_key(
        self,
        *,
        actor_id: str,
        route_scope: str,
        key: str,
        request_hash: str,
        response_status: int,
        response_body: Mapping[str, object],
        expires_at: datetime,
    ) -> IdempotencyKey:
        row = IdempotencyKey(
            id=uuid4(),
            actor_id=actor_id,
            route_scope=route_scope,
            key=key,
            request_hash=request_hash,
            response_status=response_status,
            response_body=dict(response_body),
            expires_at=expires_at,
        )
        self._session.add(row)
        await self._session.flush()
        return row

    async def create_run(
        self,
        *,
        run_id: UUID,
        event_id: UUID,
        extraction_version: int,
        model_config_snapshot: Mapping[str, object],
        tool_call_budget: int,
        timeout_at: datetime,
        idempotency_key: str,
        now: datetime,
    ) -> AgentRun:
        row = AgentRun(
            id=run_id,
            event_id=event_id,
            extraction_version=extraction_version,
            state="running",
            model_config_snapshot=dict(model_config_snapshot),
            tool_call_budget=tool_call_budget,
            idempotency_key=idempotency_key,
            started_at=now,
            timeout_at=timeout_at,
        )
        self._session.add(row)
        await self._session.flush()
        return row

    async def list_events(self, run_id: UUID, scenario_id: str) -> tuple[AgentRunEvent, ...]:
        result = await self._session.execute(
            select(AgentRunEvent)
            .join(AgentRun, AgentRun.id == AgentRunEvent.run_id)
            .join(Event, Event.id == AgentRun.event_id)
            .where(AgentRunEvent.run_id == run_id, Event.scenario_id == scenario_id)
            .order_by(AgentRunEvent.sequence)
        )
        return tuple(result.scalars().all())

    async def list_events_after(
        self, run_id: UUID, scenario_id: str, after_sequence: int
    ) -> tuple[AgentRunEvent, ...]:
        result = await self._session.execute(
            select(AgentRunEvent)
            .join(AgentRun, AgentRun.id == AgentRunEvent.run_id)
            .join(Event, Event.id == AgentRun.event_id)
            .where(
                AgentRunEvent.run_id == run_id,
                AgentRunEvent.sequence > after_sequence,
                Event.scenario_id == scenario_id,
            )
            .order_by(AgentRunEvent.sequence)
        )
        return tuple(result.scalars().all())

    async def append_event(
        self,
        run_id: UUID,
        scenario_id: str,
        sequence: int,
        event_type: str,
        public_payload: Mapping[str, object],
        internal_payload: Mapping[str, object] | None = None,
    ) -> AgentRunEvent:
        if await self.get(run_id, scenario_id) is None:
            raise LookupError(f"run {run_id} is outside scenario {scenario_id}")
        row = AgentRunEvent(
            run_id=run_id,
            sequence=sequence,
            event_type=event_type,
            public_payload=dict(public_payload),
            internal_payload=dict(internal_payload) if internal_payload is not None else None,
        )
        self._session.add(row)
        await self._session.flush()
        return row

    async def append_next_event(
        self,
        run_id: UUID,
        scenario_id: str,
        event_type: str,
        public_payload: Mapping[str, object],
        *,
        phase: str | None = None,
        internal_payload: Mapping[str, object] | None = None,
    ) -> AgentRunEvent:
        """Allocate the next sequence while holding the run row lock."""

        run = await self.get(run_id, scenario_id, for_update=True)
        if run is None:
            raise LookupError(f"run {run_id} is outside scenario {scenario_id}")
        latest = await self._session.execute(
            select(func.max(AgentRunEvent.sequence)).where(AgentRunEvent.run_id == run_id)
        )
        sequence = int(latest.scalar_one_or_none() or 0) + 1
        payload = dict(public_payload)
        if phase is not None:
            payload["phase"] = phase
        row = AgentRunEvent(
            run_id=run_id,
            sequence=sequence,
            event_type=event_type,
            public_payload=payload,
            internal_payload=dict(internal_payload) if internal_payload is not None else None,
        )
        self._session.add(row)
        await self._session.flush()
        return row

    async def update_state(
        self,
        run_id: UUID,
        scenario_id: str,
        *,
        state: str,
        completed_at: datetime | None = None,
        error_code: str | None = None,
        error_detail: str | None = None,
    ) -> AgentRun | None:
        run = await self.get(run_id, scenario_id, for_update=True)
        if run is None:
            return None
        run.state = state
        run.completed_at = completed_at
        run.error_code = error_code
        run.error_detail = error_detail
        await self._session.flush()
        return run

    async def latest_plan_id(self, run_id: UUID, scenario_id: str) -> UUID | None:
        result = await self._session.execute(
            select(Plan.id)
            .join(Event, Event.id == Plan.event_id)
            .where(Plan.run_id == run_id, Event.scenario_id == scenario_id)
            .order_by(Plan.version.desc(), Plan.id.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()


@dataclass(frozen=True, slots=True)
class PlanBundle:
    plan: DomainPlan
    options: tuple[DomainPlanOption, ...]
    evidence: tuple[DomainPlanEvidence, ...]


@dataclass(frozen=True, slots=True)
class PlanReadBundle:
    plan: Plan
    options: tuple[PlanOption, ...]
    evidence: tuple[PlanEvidence, ...]
    lineage: tuple[Plan, ...]


def to_plan_option(row: PlanOption) -> DomainPlanOption:
    conditions = row.conditions if isinstance(row.conditions, list) else []
    kpi = {
        str(key): _decimal(value)
        for key, value in _json_mapping(row.kpi).items()
        if isinstance(key, str)
    }
    return DomainPlanOption(
        plan_id=row.plan_id,
        label=row.label,
        solver_status=SolverStatus(row.solver_status),
        changes=_json_mappings(row.changes),
        conditions=tuple(str(value) for value in conditions),
        kpi=kpi,
        violations=_json_mappings(row.violations),
        rank=row.rank,
        recommended=row.is_recommended,
        option_id=row.id,
    )


def to_plan(row: Plan) -> DomainPlan:
    return DomainPlan(
        event_id=row.event_id,
        run_id=row.run_id,
        version=row.version,
        verdict=PlanVerdict(row.verdict),
        base_schedule_version=row.base_schedule_version,
        status=PlanStatus(row.status),
        recommended_option_id=row.recommended_option_id,
        explanation=_json_mapping(row.explanation),
        counterfactual=_json_mapping(row.counterfactual),
        supersedes_plan_id=row.supersedes_plan_id,
        plan_id=row.id,
    )


def to_plan_evidence(row: PlanEvidence) -> DomainPlanEvidence:
    return DomainPlanEvidence(
        plan_id=row.plan_id,
        claim_id=row.claim_id,
        claim_text=row.claim_text,
        evidence_type=row.evidence_type,
        tool_call_id=row.tool_call_id,
    )


class PlanRepository:
    """Load immutable plan lineage, options, and evidence for one scenario."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def next_version(self, event_id: UUID, scenario_id: str) -> int:
        result = await self._session.execute(
            select(func.max(Plan.version))
            .join(Event, Event.id == Plan.event_id)
            .where(Plan.event_id == event_id, Event.scenario_id == scenario_id)
        )
        return int(result.scalar_one_or_none() or 0) + 1

    async def get_full(
        self, plan_id: UUID, scenario_id: str, *, for_update: bool = False
    ) -> "PlanReadBundle | None":
        statement = select(Plan).join(Event, Event.id == Plan.event_id).where(
            Plan.id == plan_id, Event.scenario_id == scenario_id
        )
        if for_update:
            statement = statement.with_for_update()
        result = await self._session.execute(
            statement
        )
        plan_row = result.scalar_one_or_none()
        if plan_row is None:
            return None
        options_result = await self._session.execute(
            select(PlanOption)
            .where(PlanOption.plan_id == plan_id)
            .order_by(PlanOption.rank, PlanOption.id)
        )
        evidence_result = await self._session.execute(
            select(PlanEvidence)
            .where(PlanEvidence.plan_id == plan_id)
            .order_by(PlanEvidence.claim_id)
        )
        lineage_result = await self._session.execute(
            select(Plan)
            .where(Plan.event_id == plan_row.event_id)
            .order_by(Plan.version, Plan.id)
        )
        return PlanReadBundle(
            plan=plan_row,
            options=tuple(options_result.scalars().all()),
            evidence=tuple(evidence_result.scalars().all()),
            lineage=tuple(lineage_result.scalars().all()),
        )

    async def create_plan(
        self,
        *,
        plan_values: Mapping[str, object],
        option_values: tuple[Mapping[str, object], ...],
        evidence_values: tuple[Mapping[str, object], ...],
    ) -> Plan:
        plan = Plan(**dict(plan_values))
        self._session.add(plan)
        await self._session.flush()
        for values in option_values:
            self._session.add(PlanOption(plan_id=plan.id, **dict(values)))
        for values in evidence_values:
            self._session.add(PlanEvidence(plan_id=plan.id, **dict(values)))
        await self._session.flush()
        return plan

    async def mark_superseded(self, plan_id: UUID, scenario_id: str) -> Plan | None:
        result = await self._session.execute(
            select(Plan)
            .join(Event, Event.id == Plan.event_id)
            .where(Plan.id == plan_id, Event.scenario_id == scenario_id)
            .with_for_update()
        )
        plan = result.scalar_one_or_none()
        if plan is None:
            return None
        plan.status = PlanStatus.SUPERSEDED.value
        await self._session.flush()
        return plan

    async def mark_status(
        self, plan_id: UUID, scenario_id: str, status: PlanStatus
    ) -> Plan | None:
        result = await self._session.execute(
            select(Plan)
            .join(Event, Event.id == Plan.event_id)
            .where(Plan.id == plan_id, Event.scenario_id == scenario_id)
            .with_for_update()
        )
        plan = result.scalar_one_or_none()
        if plan is None:
            return None
        plan.status = status.value
        await self._session.flush()
        return plan

    async def get(self, plan_id: UUID, scenario_id: str) -> PlanBundle | None:
        result = await self._session.execute(
            select(Plan)
            .join(Event, Event.id == Plan.event_id)
            .where(Plan.id == plan_id, Event.scenario_id == scenario_id)
        )
        plan_row = result.scalar_one_or_none()
        if plan_row is None:
            return None
        options_result = await self._session.execute(
            select(PlanOption)
            .where(PlanOption.plan_id == plan_id)
            .order_by(PlanOption.rank, PlanOption.id)
        )
        evidence_result = await self._session.execute(
            select(PlanEvidence)
            .where(PlanEvidence.plan_id == plan_id)
            .order_by(PlanEvidence.claim_id)
        )
        return PlanBundle(
            plan=to_plan(plan_row),
            options=tuple(to_plan_option(row) for row in options_result.scalars().all()),
            evidence=tuple(to_plan_evidence(row) for row in evidence_result.scalars().all()),
        )


@dataclass(frozen=True, slots=True)
class DecisionRecord:
    decision: DomainDecision
    changes: tuple[DomainDecisionChange, ...]


@dataclass(frozen=True, slots=True)
class DecisionReadBundle:
    decision: Decision
    changes: tuple[DecisionChange, ...]


def to_decision(row: Decision) -> DomainDecision:
    if row.schedule_version_before is None:
        raise ValueError(f"decision {row.id} has no schedule_version_before")
    condition_ids = row.acknowledged_condition_ids
    if not isinstance(condition_ids, list):
        condition_ids = []
    return DomainDecision(
        plan_id=row.plan_id,
        action=DecisionAction(row.action),
        actor=row.actor,
        schedule_version_before=row.schedule_version_before,
        acknowledged_condition_ids=tuple(str(value) for value in condition_ids),
        reason=row.reason,
        reason_category=row.category,
        schedule_version_after=row.schedule_version_after,
        created_at=row.created_at,
        decision_id=row.id,
    )


def to_decision_change(row: DecisionChange) -> DomainDecisionChange:
    return DomainDecisionChange(
        decision_id=row.decision_id,
        entity_type=row.entity_type,
        entity_id=row.entity_id,
        change_kind=row.change_kind,
        before=_json_mapping(row.before_value),
        after=_json_mapping(row.after_value),
    )


class DecisionRepository:
    """Load decisions and their precise audit changes within a scenario."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_for_scenario(
        self,
        scenario_id: str,
        *,
        action: str | None = None,
        plan_id: UUID | None = None,
        after_created_at: datetime | None = None,
        after_id: UUID | None = None,
        limit: int = 101,
    ) -> tuple[Decision, ...]:
        statement = (
            select(Decision)
            .join(Plan, Plan.id == Decision.plan_id)
            .join(Event, Event.id == Plan.event_id)
            .where(Event.scenario_id == scenario_id)
        )
        if action is not None:
            statement = statement.where(Decision.action == action)
        if plan_id is not None:
            statement = statement.where(Decision.plan_id == plan_id)
        if after_created_at is not None and after_id is not None:
            statement = statement.where(
                (Decision.created_at > after_created_at)
                | ((Decision.created_at == after_created_at) & (Decision.id > after_id))
            )
        result = await self._session.execute(
            statement.order_by(Decision.created_at, Decision.id).limit(limit)
        )
        return tuple(result.scalars().all())

    async def get(self, decision_id: UUID, scenario_id: str) -> DecisionRecord | None:
        result = await self._session.execute(
            select(Decision)
            .join(Plan, Plan.id == Decision.plan_id)
            .join(Event, Event.id == Plan.event_id)
            .where(Decision.id == decision_id, Event.scenario_id == scenario_id)
        )
        decision_row = result.scalar_one_or_none()
        if decision_row is None:
            return None
        changes_result = await self._session.execute(
            select(DecisionChange)
            .where(DecisionChange.decision_id == decision_id)
            .order_by(
                DecisionChange.entity_type,
                DecisionChange.entity_id,
                DecisionChange.field,
            )
        )
        return DecisionRecord(
            decision=to_decision(decision_row),
            changes=tuple(to_decision_change(row) for row in changes_result.scalars().all()),
        )

    async def get_read(self, decision_id: UUID, scenario_id: str) -> DecisionReadBundle | None:
        result = await self._session.execute(
            select(Decision)
            .join(Plan, Plan.id == Decision.plan_id)
            .join(Event, Event.id == Plan.event_id)
            .where(Decision.id == decision_id, Event.scenario_id == scenario_id)
        )
        decision_row = result.scalar_one_or_none()
        if decision_row is None:
            return None
        changes_result = await self._session.execute(
            select(DecisionChange)
            .where(DecisionChange.decision_id == decision_id)
            .order_by(
                DecisionChange.entity_type,
                DecisionChange.entity_id,
                DecisionChange.field,
            )
        )
        return DecisionReadBundle(
            decision=decision_row,
            changes=tuple(changes_result.scalars().all()),
        )

    async def create(
        self,
        *,
        decision_id: UUID,
        plan_id: UUID,
        selected_option_id: UUID | None,
        action: str,
        actor: str,
        reason: str | None,
        category: str | None,
        acknowledged_condition_ids: tuple[str, ...],
        schedule_version_before: int,
        schedule_version_after: int | None,
        created_at: datetime,
    ) -> Decision:
        row = Decision(
            id=decision_id,
            plan_id=plan_id,
            selected_option_id=selected_option_id,
            action=action,
            actor=actor,
            reason=reason,
            category=category,
            acknowledged_condition_ids=list(acknowledged_condition_ids),
            schedule_version_before=schedule_version_before,
            schedule_version_after=schedule_version_after,
            created_at=created_at,
        )
        self._session.add(row)
        await self._session.flush()
        return row

    async def add_changes(
        self,
        decision_id: UUID,
        changes: tuple[Mapping[str, object], ...],
    ) -> tuple[DecisionChange, ...]:
        rows = tuple(
            DecisionChange(
                decision_id=decision_id,
                entity_type=str(change["entity_type"]),
                entity_id=str(change["entity_id"]),
                field=str(change["field"]),
                change_kind=str(change["change_kind"]),
                before_value=change.get("before"),
                after_value=change.get("after"),
            )
            for change in changes
        )
        self._session.add_all(rows)
        await self._session.flush()
        return rows

    async def create_notification_draft(
        self,
        *,
        decision_id: UUID,
        payload: Mapping[str, object],
        audience: str = "operations",
    ) -> NotificationOutbox:
        row = NotificationOutbox(
            id=uuid4(),
            decision_id=decision_id,
            audience=audience,
            payload=dict(payload),
            state="draft",
        )
        self._session.add(row)
        await self._session.flush()
        return row


def to_alert(row: Alert) -> DomainAlert:
    affected = _json_mappings(row.affected_objects)
    evidence = _json_mappings(row.evidence)
    return DomainAlert(
        scenario_id=row.scenario_id,
        alert_type=row.type,
        severity=AlertSeverity(row.severity),
        dedupe_key=row.dedupe_key,
        affected_objects=affected,
        evidence=evidence,
        state=AlertState(row.state),
        event_id=row.linked_event_id,
        decision_id=row.linked_decision_id,
        acknowledged_by=row.acknowledged_by,
        dismissed_by=row.dismissed_by,
        resolved_at=row.resolved_at,
        alert_id=row.id,
    )


class AlertRepository:
    """Read scenario-scoped operational alerts."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, alert_id: UUID, scenario_id: str) -> DomainAlert | None:
        result = await self._session.execute(
            select(Alert).where(Alert.id == alert_id, Alert.scenario_id == scenario_id)
        )
        row = result.scalar_one_or_none()
        return None if row is None else to_alert(row)

    async def list_for_scenario(self, scenario_id: str) -> tuple[DomainAlert, ...]:
        result = await self._session.execute(
            select(Alert)
            .where(Alert.scenario_id == scenario_id)
            .order_by(Alert.created_at, Alert.id)
        )
        return tuple(to_alert(row) for row in result.scalars().all())


@dataclass(frozen=True, slots=True)
class CachedResponse:
    key_id: UUID
    status: int | None
    body: Mapping[str, object] | None
    expires_at: datetime


class IdempotencyRepository:
    """Store and retrieve replayable route responses."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(
        self,
        actor_id: str,
        route_scope: str,
        key: str,
    ) -> CachedResponse | None:
        result = await self._session.execute(
            select(IdempotencyKey).where(
                IdempotencyKey.actor_id == actor_id,
                IdempotencyKey.route_scope == route_scope,
                IdempotencyKey.key == key,
                IdempotencyKey.expires_at > datetime.now(UTC),
            )
        )
        row = result.scalar_one_or_none()
        if row is None:
            return None
        body = row.response_body if isinstance(row.response_body, dict) else None
        return CachedResponse(row.id, row.response_status, body, row.expires_at)

    async def put(
        self,
        actor_id: str,
        route_scope: str,
        key: str,
        request_hash: str,
        response_status: int,
        response_body: Mapping[str, object],
        expires_at: datetime,
        key_id: UUID | None = None,
    ) -> UUID:
        row = IdempotencyKey(
            id=key_id or uuid4(),
            actor_id=actor_id,
            route_scope=route_scope,
            key=key,
            request_hash=request_hash,
            response_status=response_status,
            response_body=dict(response_body),
            expires_at=expires_at,
        )
        self._session.add(row)
        await self._session.flush()
        return row.id


__all__ = [
    "AlertRepository",
    "CachedResponse",
    "DecisionRecord",
    "DecisionReadBundle",
    "DecisionRepository",
    "EventRepository",
    "IdempotencyRepository",
    "PlanBundle",
    "PlanReadBundle",
    "PlanRepository",
    "ReadinessRepository",
    "RunRepository",
    "ScheduleRepository",
    "to_alert",
    "to_booking",
    "to_job",
    "to_readiness_item",
    "to_resource",
    "to_weather_observation",
]
