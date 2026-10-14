from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from app.application.errors import ApplicationError
from app.application.schemas import (
    ChangeEventExtraction,
    CreateEventRequest,
    EventDetailResponse,
    EventListResponse,
    EventResponse,
    EventSummaryResponse,
    ExtractionCorrectionRequest,
    ExtractionStartResponse,
    ExtractionVersionResponse,
    LinkedPlanResponse,
    LinkedRunResponse,
)
from app.domain.enums import EventNature, EventState
from app.domain.errors import ForbiddenActionError, UnknownActionError
from app.domain.policy import DomainPack
from app.persistence.models import AgentRun, Event, EventExtraction, Plan
from app.persistence.repositories import EventRepository, ScheduleRepository
from app.security.input_boundary import (
    InputBoundaryError,
    decode_cursor,
    encode_cursor,
    normalize_source_text,
    require_source_excerpt,
)
from sqlalchemy.ext.asyncio import AsyncSession

_CORRECTABLE_STATES = {
    EventState.RECEIVED.value,
    EventState.EXTRACTED.value,
    EventState.CLARIFICATION_NEEDED.value,
}


class EventService:
    """Scenario-scoped event intake and extraction-version orchestration."""

    def __init__(self, session: AsyncSession, pack: DomainPack) -> None:
        self._session = session
        self._pack = pack

    async def create(
        self, scenario_id: str, request: CreateEventRequest, *, actor: str
    ) -> EventResponse:
        try:
            raw_text = normalize_source_text(request.raw_text)
        except InputBoundaryError as exc:
            raise self._validation_error(str(exc)) from exc

        async with self._session.begin():
            await self._require_scenario(scenario_id)
            repository = EventRepository(self._session)
            if request.parent_event_id is not None:
                parent = await repository.get(request.parent_event_id, scenario_id)
                if parent is None:
                    raise ApplicationError(
                        404,
                        "unknown_entity",
                        "The parent event does not exist in this scenario.",
                        details={"parent_event_id": str(request.parent_event_id)},
                    )
            row = await repository.create_event(
                event_id=uuid4(),
                scenario_id=scenario_id,
                raw_text=raw_text,
                actor=actor,
                nature=request.nature.value if request.nature is not None else None,
                cause=request.cause,
                parent_event_id=request.parent_event_id,
                parent_plan_id=request.parent_plan_id,
            )
        return self._event_response(row)

    async def list(
        self,
        scenario_id: str,
        *,
        nature: EventNature | None,
        state: EventState | None,
        search: str | None,
        limit: int,
        after: str | None,
    ) -> EventListResponse:
        after_created_at: datetime | None = None
        after_id: UUID | None = None
        if after is not None:
            try:
                after_created_at, after_id = decode_cursor(after)
            except InputBoundaryError as exc:
                raise self._validation_error(str(exc)) from exc

        rows = await EventRepository(self._session).list_for_scenario(
            scenario_id,
            nature=nature.value if nature is not None else None,
            state=state.value if state is not None else None,
            search=search.strip() if search and search.strip() else None,
            after_created_at=after_created_at,
            after_id=after_id,
            limit=limit + 1,
        )
        has_next = len(rows) > limit
        visible = rows[:limit]
        next_cursor = None
        if has_next and visible:
            last = visible[-1]
            next_cursor = encode_cursor(last.created_at, last.id)
        return EventListResponse(
            events=tuple(self._event_summary(row) for row in visible),
            next_cursor=next_cursor,
        )

    async def detail(self, scenario_id: str, event_id: UUID) -> EventDetailResponse:
        repository = EventRepository(self._session)
        event = await repository.get(event_id, scenario_id)
        if event is None:
            raise self._not_found(event_id)
        return EventDetailResponse(
            event=self._event_response(event),
            extractions=tuple(
                self._extraction_response(row)
                for row in await repository.list_extractions(event_id, scenario_id)
            ),
            runs=tuple(
                self._run_response(row) for row in await repository.list_runs(event_id, scenario_id)
            ),
            plans=tuple(
                self._plan_response(row)
                for row in await repository.list_plans(event_id, scenario_id)
            ),
        )

    async def correct_extraction(
        self,
        scenario_id: str,
        event_id: UUID,
        request: ExtractionCorrectionRequest,
        *,
        actor: str,
    ) -> EventDetailResponse:
        async with self._session.begin():
            repository = EventRepository(self._session)
            event = await repository.get(event_id, scenario_id, for_update=True)
            if event is None:
                raise self._not_found(event_id)
            if event.state not in _CORRECTABLE_STATES:
                raise ApplicationError(
                    409,
                    "invalid_state_transition",
                    "Extraction can only be corrected before planning or closure.",
                    details={"state": event.state},
                )
            if event.extraction_version != request.expected_extraction_version:
                raise self._version_conflict(
                    request.expected_extraction_version, event.extraction_version
                )

            await self._validate_extraction(scenario_id, event.raw_text, request.extraction)
            state = (
                EventState.CLARIFICATION_NEEDED.value
                if request.extraction.missing_info or not request.extraction.job_ids
                else EventState.EXTRACTED.value
            )
            saved = await repository.save_extraction(
                event_id=event_id,
                scenario_id=scenario_id,
                expected_version=request.expected_extraction_version,
                extracted_json=request.extraction.model_dump(mode="json"),
                model_name="planner-correction",
                prompt_version="manual-v1",
                confidence_summary={"source": "planner"},
                corrected=True,
                correction_actor=actor,
                state=state,
                nature=(
                    request.extraction.nature.value
                    if request.extraction.nature is not None
                    else None
                ),
                cause=request.extraction.cause,
                now=datetime.now(UTC),
            )
            if saved is None:
                current = await repository.get(event_id, scenario_id)
                raise self._version_conflict(
                    request.expected_extraction_version,
                    current.extraction_version if current is not None else None,
                )
        return await self.detail(scenario_id, event_id)

    async def start_extraction(self, scenario_id: str, event_id: UUID) -> ExtractionStartResponse:
        async with self._session.begin():
            repository = EventRepository(self._session)
            event = await repository.get(event_id, scenario_id, for_update=True)
            if event is None:
                raise self._not_found(event_id)
            if event.state == EventState.PLANNING.value:
                raise ApplicationError(
                    409,
                    "extraction_in_progress",
                    "Extraction is already in progress for this event.",
                    retryable=True,
                    details={"event_id": str(event_id)},
                )
            if event.state == EventState.CLOSED.value:
                raise ApplicationError(
                    409,
                    "invalid_state_transition",
                    "A closed event cannot be extracted again.",
                    details={"state": event.state},
                )
            transitioned = await repository.transition_state(
                event_id,
                scenario_id,
                expected_states=tuple(_CORRECTABLE_STATES),
                state=EventState.PLANNING.value,
                now=datetime.now(UTC),
            )
            if transitioned is None:
                raise ApplicationError(
                    409,
                    "invalid_state_transition",
                    "The event cannot start extraction from its current state.",
                    details={"state": event.state},
                )
            return ExtractionStartResponse(
                event_id=event_id,
                state=EventState.PLANNING,
                extraction_version=transitioned.extraction_version,
                status="queued",
            )

    async def delete(self, scenario_id: str, event_id: UUID) -> None:
        async with self._session.begin():
            deleted = await EventRepository(self._session).delete_draft(event_id, scenario_id)
            if deleted is None:
                raise self._not_found(event_id)
            if not deleted:
                raise ApplicationError(
                    409,
                    "event_not_draft",
                    "Only received events without an extraction can be deleted.",
                )

    async def persist_model_extraction(
        self,
        scenario_id: str,
        event_id: UUID,
        extraction: ChangeEventExtraction,
        *,
        model_name: str,
        prompt_version: str,
        confidence_summary: Mapping[str, Any],
    ) -> EventExtraction:
        """Persist a validated model result for the later agent-run task."""

        async with self._session.begin():
            repository = EventRepository(self._session)
            event = await repository.get(event_id, scenario_id, for_update=True)
            if event is None:
                raise self._not_found(event_id)
            await self._validate_extraction(scenario_id, event.raw_text, extraction)
            state = (
                EventState.CLARIFICATION_NEEDED.value
                if extraction.missing_info or not extraction.job_ids
                else EventState.EXTRACTED.value
            )
            saved = await repository.save_extraction(
                event_id=event_id,
                scenario_id=scenario_id,
                expected_version=event.extraction_version,
                extracted_json=extraction.model_dump(mode="json"),
                model_name=model_name,
                prompt_version=prompt_version,
                confidence_summary=confidence_summary,
                corrected=False,
                correction_actor=None,
                state=state,
                nature=extraction.nature.value if extraction.nature is not None else None,
                cause=extraction.cause,
                now=datetime.now(UTC),
            )
            if saved is None:
                raise ApplicationError(409, "version_conflict", "Extraction version changed.")
            return saved

    async def _require_scenario(self, scenario_id: str) -> None:
        try:
            await ScheduleRepository(self._session).load_snapshot(scenario_id)
        except LookupError as exc:
            raise ApplicationError(
                404,
                "unknown_entity",
                "The requested scenario does not exist.",
                details={"scenario_id": scenario_id},
            ) from exc

    async def _validate_extraction(
        self, scenario_id: str, raw_text: str, extraction: ChangeEventExtraction
    ) -> None:
        try:
            require_source_excerpt(extraction.source_excerpt, raw_text)
            for item in extraction.hard_constraints:
                require_source_excerpt(item.source_excerpt, raw_text)
            for item in extraction.eta_updates:
                require_source_excerpt(item.source_excerpt, raw_text)
            for item in extraction.risk_tags:
                require_source_excerpt(item.source_excerpt, raw_text)
            for item in extraction.levers_ruled_out:
                require_source_excerpt(item.source_excerpt, raw_text)
        except InputBoundaryError as exc:
            raise self._validation_error(str(exc)) from exc

        try:
            snapshot = await ScheduleRepository(self._session).load_snapshot(scenario_id)
        except LookupError as exc:
            raise ApplicationError(
                404,
                "unknown_entity",
                "The requested scenario does not exist.",
                details={"scenario_id": scenario_id},
            ) from exc
        known_jobs = {job.id for job in snapshot.jobs}
        referenced_jobs = set(extraction.job_ids) | {item.job_id for item in extraction.eta_updates}
        unknown_jobs = sorted(referenced_jobs - known_jobs)
        if unknown_jobs:
            raise ApplicationError(
                422,
                "validation_error",
                "Extraction references an unknown job.",
                details={"unknown_job_ids": unknown_jobs},
            )
        for item in extraction.levers_ruled_out:
            try:
                self._pack.action_registry.get(item.lever)
            except UnknownActionError as exc:
                raise ApplicationError(
                    422,
                    "policy_violation",
                    "Extraction references an unknown action lever.",
                    details={"lever": item.lever},
                ) from exc
            try:
                self._pack.action_registry.require_allowed(item.lever)
            except ForbiddenActionError as exc:
                raise ApplicationError(
                    422,
                    "policy_violation",
                    "Extraction references a forbidden action lever.",
                    details={"lever": item.lever},
                ) from exc

    @staticmethod
    def _event_response(row: Event) -> EventResponse:
        now = datetime.now(UTC)
        return EventResponse(
            id=row.id,
            scenario_id=row.scenario_id,
            nature=EventNature(row.nature) if row.nature is not None else None,
            cause=row.cause,
            raw_text=row.raw_text,
            state=EventState(row.state),
            origin_type=row.origin_type,
            extraction_version=row.extraction_version,
            created_by=row.created_by,
            created_at=row.created_at or now,
            updated_at=row.updated_at or now,
        )

    @classmethod
    def _event_summary(cls, row: Event) -> EventSummaryResponse:
        response = cls._event_response(row)
        preview = " ".join(row.raw_text.split())[:240]
        return EventSummaryResponse(
            id=response.id,
            nature=response.nature,
            cause=response.cause,
            state=response.state,
            extraction_version=response.extraction_version,
            raw_text_preview=preview,
            created_at=response.created_at,
            updated_at=response.updated_at,
        )

    @staticmethod
    def _extraction_response(row: EventExtraction) -> ExtractionVersionResponse:
        now = datetime.now(UTC)
        return ExtractionVersionResponse(
            event_id=row.event_id,
            version=row.version,
            extracted_json=dict(row.extracted_json),
            model_name=row.model_name,
            prompt_version=row.prompt_version,
            confidence_summary=dict(row.confidence_summary),
            corrected=row.corrected,
            correction_actor=row.correction_actor,
            corrected_at=row.corrected_at,
            created_at=row.created_at or now,
        )

    @staticmethod
    def _run_response(row: AgentRun) -> LinkedRunResponse:
        return LinkedRunResponse(
            id=row.id,
            state=row.state,
            attempt=row.attempt,
            extraction_version=row.extraction_version,
            started_at=row.started_at,
            completed_at=row.completed_at,
        )

    @staticmethod
    def _plan_response(row: Plan) -> LinkedPlanResponse:
        return LinkedPlanResponse(
            id=row.id,
            version=row.version,
            verdict=row.verdict,
            status=row.status,
            base_schedule_version=row.base_schedule_version,
            created_at=row.created_at,
        )

    @staticmethod
    def _not_found(event_id: UUID) -> ApplicationError:
        return ApplicationError(
            404,
            "unknown_entity",
            "The requested event does not exist in this scenario.",
            details={"event_id": str(event_id)},
        )

    @staticmethod
    def _validation_error(message: str) -> ApplicationError:
        return ApplicationError(422, "validation_error", message)

    @staticmethod
    def _version_conflict(expected: int, current: int | None) -> ApplicationError:
        return ApplicationError(
            409,
            "version_conflict",
            "The extraction version is stale.",
            details={
                "expected_extraction_version": expected,
                "current_extraction_version": current,
            },
        )
