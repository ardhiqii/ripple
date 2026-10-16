import asyncio
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from app.agent.model_gateway import build_configured_gateway
from app.agent.model_gateway_types import (
    IntakeRequest,
    IntakeResult,
    ModelGatewayConfigurationError,
    ModelGatewayError,
)
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
from app.application.synthetic_event_extractor import extract_synthetic_event
from app.config import Settings
from app.domain.enums import EventNature, EventState
from app.domain.errors import ForbiddenActionError, UnknownActionError
from app.domain.policy import DomainPack
from app.engine.simulate import ScheduleSnapshot
from app.persistence.models import AgentRun, Event, EventExtraction, Plan
from app.persistence.repositories import EventRepository, ScheduleRepository
from app.security.input_boundary import (
    InputBoundaryError,
    decode_cursor,
    encode_cursor,
    normalize_source_text,
    require_source_excerpt,
)
from app.security.redaction import source_fingerprint
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

_CORRECTABLE_STATES = {
    EventState.RECEIVED.value,
    EventState.EXTRACTED.value,
    EventState.CLARIFICATION_NEEDED.value,
}
_LIFECYCLE_KEYS = (
    "draft",
    "reading_input",
    "needs_clarification",
    "ready_to_investigate",
    "investigating",
    "options_ready",
    "stale",
    "approved",
    "rejected",
    "superseded",
    "failed",
    "integrity_error",
)
_KNOWN_RUN_STATES = {"queued", "running", "completed", "failed", "timed_out"}
_KNOWN_PLAN_STATUSES = {"proposed", "approved", "rejected", "superseded", "stale"}
_KNOWN_EVENT_STATES = {
    "received",
    "extracted",
    "clarification_needed",
    "planning",
    "closed",
}
_EXTRACTION_TIMEOUT_SECONDS = 10.0
_SYNTHETIC_ENVIRONMENTS = frozenset({"local", "preview"})
_SYNTHETIC_MODEL_NAME = "synthetic-preview-deterministic"
_SYNTHETIC_PROMPT_VERSION = "synthetic-preview-v1"


@dataclass(frozen=True)
class _EventReadContext:
    job_ids: tuple[str, ...]
    latest_run: AgentRun | None
    latest_plan: Plan | None


@dataclass(frozen=True)
class _ExtractionAttempt:
    extraction: ChangeEventExtraction
    model_name: str
    prompt_version: str
    confidence_summary: Mapping[str, Any]
    provider: str


def event_lifecycle(
    event_state: str,
    latest_run_state: str | None,
    latest_plan_status: str | None,
) -> str:
    """Map persisted event/run/plan state to one auditable UI lifecycle label."""

    if event_state not in _KNOWN_EVENT_STATES:
        return "integrity_error"
    if latest_run_state is not None and latest_run_state not in _KNOWN_RUN_STATES:
        return "integrity_error"
    if latest_plan_status is not None and latest_plan_status not in _KNOWN_PLAN_STATUSES:
        return "integrity_error"

    if latest_plan_status in {"approved", "rejected", "superseded", "stale"}:
        return latest_plan_status
    if latest_plan_status == "proposed":
        return "options_ready"
    if latest_run_state in {"failed", "timed_out"}:
        return "failed"
    if latest_run_state in {"queued", "running", "completed"}:
        return "investigating"
    if event_state == "planning":
        return "reading_input"
    if event_state == "clarification_needed":
        return "needs_clarification"
    if event_state == "extracted":
        return "ready_to_investigate"
    if event_state == "received":
        return "draft"
    return "integrity_error"


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
        job_id: str | None,
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
            limit=None,
        )
        contexts = await self._read_contexts(rows)
        lifecycle_counts = {key: 0 for key in _LIFECYCLE_KEYS}
        for row in rows:
            context = contexts[row.id]
            lifecycle_counts[
                event_lifecycle(
                    row.state,
                    context.latest_run.state if context.latest_run is not None else None,
                    context.latest_plan.status if context.latest_plan is not None else None,
                )
            ] += 1

        normalized_search = search.strip().lower() if search and search.strip() else None
        filtered = [
            row
            for row in rows
            if (nature is None or row.nature == nature.value)
            and (state is None or row.state == state.value)
            and self._matches_event_filter(
                row,
                contexts[row.id],
                normalized_search,
                job_id.strip() if job_id and job_id.strip() else None,
            )
        ]
        total_count = len(filtered)
        if after_created_at is not None and after_id is not None:
            filtered = [
                row
                for row in filtered
                if row.created_at < after_created_at
                or (row.created_at == after_created_at and row.id < after_id)
            ]
        visible = filtered[:limit]
        has_next = len(filtered) > limit
        next_cursor = None
        if has_next and visible:
            last = visible[-1]
            next_cursor = encode_cursor(last.created_at, last.id)
        return EventListResponse(
            events=tuple(self._event_summary(row, contexts[row.id]) for row in visible),
            next_cursor=next_cursor,
            total_count=total_count,
            scenario_lifecycle_counts=lifecycle_counts,
        )

    async def _read_contexts(self, rows: tuple[Event, ...]) -> dict[UUID, _EventReadContext]:
        event_ids = tuple(row.id for row in rows)
        contexts = {
            event_id: _EventReadContext(job_ids=(), latest_run=None, latest_plan=None)
            for event_id in event_ids
        }
        if not event_ids:
            return contexts
        extractions = (
            await self._session.execute(
                select(EventExtraction)
                .where(EventExtraction.event_id.in_(event_ids))
                .order_by(EventExtraction.event_id, EventExtraction.version.desc())
            )
        ).scalars()
        jobs_by_event: dict[UUID, tuple[str, ...]] = {}
        for extraction in extractions:
            if extraction.event_id in jobs_by_event:
                continue
            payload = extraction.extracted_json
            raw_job_ids = payload.get("job_ids", []) if isinstance(payload, dict) else []
            jobs_by_event[extraction.event_id] = tuple(
                value for value in raw_job_ids if isinstance(value, str)
            )

        runs = (
            await self._session.execute(
                select(AgentRun)
                .where(AgentRun.event_id.in_(event_ids))
                .order_by(AgentRun.event_id, AgentRun.started_at.desc(), AgentRun.id.desc())
            )
        ).scalars()
        latest_runs: dict[UUID, AgentRun] = {}
        for run in runs:
            latest_runs.setdefault(run.event_id, run)

        plans = (
            await self._session.execute(
                select(Plan)
                .where(Plan.event_id.in_(event_ids))
                .order_by(Plan.event_id, Plan.created_at.desc(), Plan.id.desc())
            )
        ).scalars()
        latest_plans: dict[UUID, Plan] = {}
        for plan in plans:
            latest_plans.setdefault(plan.event_id, plan)

        return {
            event_id: _EventReadContext(
                job_ids=jobs_by_event.get(event_id, ()),
                latest_run=latest_runs.get(event_id),
                latest_plan=latest_plans.get(event_id),
            )
            for event_id in event_ids
        }

    @staticmethod
    def _matches_event_filter(
        row: Event,
        context: _EventReadContext,
        search: str | None,
        job_id: str | None,
    ) -> bool:
        if job_id is not None and job_id not in context.job_ids:
            return False
        if search is None:
            return True
        searchable = (str(row.id), row.cause or "", row.raw_text)
        return any(search in value.lower() for value in searchable)

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

    async def start_extraction(
        self,
        scenario_id: str,
        event_id: UUID,
        *,
        environment: str = "local",
        synthetic_preview_enabled: bool = True,
        settings: Settings | None = None,
    ) -> ExtractionStartResponse:
        """Run one bounded extraction attempt while serializing the event row.

        The event remains in its pre-attempt state until the validated extraction
        is committed. This removes the old queued state and makes a concurrent
        retry observe the terminal result after the first request commits.
        """

        response: ExtractionStartResponse | None = None
        failure: ApplicationError | None = None
        async with self._session.begin():
            repository = EventRepository(self._session)
            event = await repository.get(event_id, scenario_id, for_update=True)
            if event is None:
                raise self._not_found(event_id)
            if event.state == EventState.CLOSED.value:
                raise ApplicationError(
                    409,
                    "invalid_state_transition",
                    "A closed event cannot be extracted again.",
                    details={"state": event.state},
                )
            if event.state == EventState.PLANNING.value and event.extraction_version > 0:
                raise ApplicationError(
                    409,
                    "extraction_in_progress",
                    "The event already has an extraction and is being investigated.",
                    retryable=True,
                    details={"event_id": str(event_id)},
                )
            if event.state in {
                EventState.EXTRACTED.value,
                EventState.CLARIFICATION_NEEDED.value,
            } and event.extraction_version > 0:
                response = ExtractionStartResponse(
                    event_id=event_id,
                    state=EventState(event.state),
                    extraction_version=event.extraction_version,
                    status="already_completed",
                )
            elif event.state not in _CORRECTABLE_STATES and not (
                event.state == EventState.PLANNING.value and event.extraction_version == 0
            ):
                raise ApplicationError(
                    409,
                    "invalid_state_transition",
                    "The event cannot start extraction from its current state.",
                    details={"state": event.state},
                )
            else:
                attempt: _ExtractionAttempt | None = None
                try:
                    snapshot = await self._load_scenario_snapshot(scenario_id)
                    intake_request = self._intake_request(
                        scenario_id,
                        event_id,
                        event.raw_text,
                        snapshot,
                        environment,
                    )
                    attempt = await self._run_extraction_attempt(
                        intake_request,
                        environment=environment,
                        synthetic_preview_enabled=synthetic_preview_enabled,
                        settings=settings,
                    )
                    extraction = self._ensure_requested_start(attempt.extraction)
                    confidence_summary = dict(attempt.confidence_summary)
                    if extraction.missing_info or not extraction.job_ids:
                        confidence_summary["overall"] = "low"
                    state = (
                        EventState.CLARIFICATION_NEEDED.value
                        if extraction.missing_info or not extraction.job_ids
                        else EventState.EXTRACTED.value
                    )
                    saved = await self._persist_model_extraction_locked(
                        scenario_id,
                        event_id,
                        extraction,
                        model_name=attempt.model_name,
                        prompt_version=attempt.prompt_version,
                        confidence_summary=confidence_summary,
                        expected_version=event.extraction_version,
                    )
                    response = ExtractionStartResponse(
                        event_id=event_id,
                        state=EventState(state),
                        extraction_version=saved.version,
                        status=(
                            "clarification_needed"
                            if state == EventState.CLARIFICATION_NEEDED.value
                            else "completed"
                        ),
                    )
                except ApplicationError as exc:
                    # Planning/version-zero rows are leftovers from the old
                    # queued endpoint. A failed retry must not preserve that
                    # dead-end marker.
                    if (
                        event.state == EventState.PLANNING.value
                        and event.extraction_version == 0
                    ):
                        event.state = EventState.RECEIVED.value
                        event.updated_at = datetime.now(UTC)
                        await self._session.flush()
                    failure = exc
                    if attempt is not None and exc.status_code == 422:
                        failure = ApplicationError(
                            503,
                            "extraction_validation_failed",
                            "The extraction result failed server validation and can be retried.",
                            retryable=True,
                            details={"model": attempt.model_name},
                        )
        if failure is not None:
            raise failure
        if response is None:
            raise ApplicationError(
                500,
                "extraction_incomplete",
                "The extraction attempt did not produce a response.",
                retryable=True,
            )
        return response

    async def _load_scenario_snapshot(self, scenario_id: str) -> ScheduleSnapshot:
        try:
            return await ScheduleRepository(self._session).load_snapshot(scenario_id)
        except LookupError as exc:
            raise self._scenario_not_found(scenario_id) from exc

    @staticmethod
    def _intake_request(
        scenario_id: str,
        event_id: UUID,
        source_text: str,
        snapshot: ScheduleSnapshot,
        environment: str,
    ) -> IntakeRequest:
        stages_by_job: dict[str, list[str]] = {}
        for item in snapshot.readiness_items:
            stages_by_job.setdefault(item.job_id, []).append(item.stage)
        return IntakeRequest(
            source_text=source_text,
            known_job_ids=tuple(job.id for job in snapshot.jobs),
            known_stages_by_job={
                job_id: tuple(dict.fromkeys(stages))
                for job_id, stages in stages_by_job.items()
            },
            source_metadata={
                "scenario_id": scenario_id,
                "event_id": str(event_id),
                "environment": environment,
            },
        )

    async def _run_extraction_attempt(
        self,
        request: IntakeRequest,
        *,
        environment: str,
        synthetic_preview_enabled: bool,
        settings: Settings | None,
    ) -> _ExtractionAttempt:
        provider = settings.model_provider if settings is not None else "synthetic"
        if provider == "synthetic":
            return self._synthetic_or_unavailable(
                request,
                environment=environment,
                synthetic_preview_enabled=synthetic_preview_enabled,
            )
        if settings is None:
            raise ApplicationError(
                503,
                "provider_unavailable",
                "A configured model provider is required for live extraction.",
                retryable=False,
                details={"provider": provider, "environment": environment},
            )
        allowed_environments = (
            _SYNTHETIC_ENVIRONMENTS
            if provider == "gemini_developer"
            else frozenset({"staging", "production"})
        )
        if environment not in allowed_environments:
            raise ApplicationError(
                503,
                "provider_unavailable",
                "The selected model provider is not enabled for this environment.",
                retryable=False,
                details={"provider": provider, "environment": environment},
            )
        timeout_seconds = settings.model_timeout_seconds
        try:
            gateway = build_configured_gateway(settings)
        except ModelGatewayConfigurationError as exc:
            raise ApplicationError(
                503,
                "provider_unavailable",
                str(exc),
                retryable=False,
                details={"provider": provider, "environment": environment},
            ) from exc
        except ModelGatewayError as exc:
            raise ApplicationError(
                503,
                exc.code,
                str(exc),
                retryable=exc.retryable,
                details={"provider": provider, "environment": environment},
            ) from exc
        except Exception as exc:
            raise ApplicationError(
                503,
                "provider_error",
                "The configured model provider could not be initialized.",
                retryable=True,
                details={"provider": provider, "environment": environment},
            ) from exc

        try:
            result: IntakeResult = await asyncio.wait_for(
                gateway.extract_change(request),
                timeout=timeout_seconds,
            )
        except ModelGatewayConfigurationError:
            raise ApplicationError(
                503,
                "provider_unavailable",
                "The selected model provider is not configured for extraction.",
                retryable=False,
                details={"provider": provider, "environment": environment},
            ) from None
        except TimeoutError as exc:
            raise ApplicationError(
                503,
                "provider_timeout",
                "The configured model provider timed out during extraction.",
                retryable=True,
                details={
                    "provider": _provenance_provider(provider),
                    "timeout_seconds": timeout_seconds,
                },
            ) from exc
        except ModelGatewayError as exc:
            raise ApplicationError(
                503,
                exc.code,
                str(exc),
                retryable=exc.retryable or exc.code == "extraction_rejected",
                details={"provider": _provenance_provider(provider)},
            ) from exc
        except Exception as exc:
            raise ApplicationError(
                503,
                "provider_error",
                "The configured model provider could not complete extraction.",
                retryable=True,
                details={
                    "provider": _provenance_provider(provider),
                    "error_type": type(exc).__name__,
                },
            ) from exc

        source_sha256 = result.source_sha256 or source_fingerprint(request.source_text)
        return _ExtractionAttempt(
            extraction=result.extraction,
            model_name=result.model_name,
            prompt_version=result.prompt_version,
            confidence_summary=self._confidence_summary(
                result.extraction,
                source_sha256=source_sha256,
                source_length=len(request.source_text),
                model_name=result.model_name,
                prompt_version=result.prompt_version,
                provider=_provenance_provider(provider),
                environment=environment,
                repair_attempts=result.repair_attempts,
            ),
            provider=_provenance_provider(provider),
        )

    @staticmethod
    def _synthetic_or_unavailable(
        request: IntakeRequest,
        *,
        environment: str,
        synthetic_preview_enabled: bool,
    ) -> _ExtractionAttempt:
        if environment not in _SYNTHETIC_ENVIRONMENTS or not synthetic_preview_enabled:
            raise ApplicationError(
                503,
                "provider_unavailable",
                "Synthetic extraction is available only in local or preview environments.",
                retryable=True,
                details={"provider": "synthetic", "environment": environment},
            )

        extraction = extract_synthetic_event(request.source_text, request.known_job_ids)
        return _ExtractionAttempt(
            extraction=extraction,
            model_name=_SYNTHETIC_MODEL_NAME,
            prompt_version=_SYNTHETIC_PROMPT_VERSION,
            confidence_summary=EventService._confidence_summary(
                extraction,
                source_sha256=source_fingerprint(request.source_text),
                source_length=len(request.source_text),
                model_name=_SYNTHETIC_MODEL_NAME,
                prompt_version=_SYNTHETIC_PROMPT_VERSION,
                provider="synthetic",
                environment=environment,
                repair_attempts=0,
            ),
            provider="synthetic",
        )

    @staticmethod
    def _confidence_summary(
        extraction: ChangeEventExtraction,
        *,
        source_sha256: str,
        source_length: int,
        model_name: str,
        prompt_version: str,
        provider: str,
        environment: str,
        repair_attempts: int,
    ) -> dict[str, Any]:
        return {
            "overall": "low" if extraction.missing_info or not extraction.job_ids else "medium",
            "provenance": {
                "source": "event.raw_text",
                "source_sha256": source_sha256,
                "source_length": source_length,
                "provider": provider,
                "model_name": model_name,
                "prompt_version": prompt_version,
                "environment": environment,
                "repair_attempts": repair_attempts,
            },
        }

    @staticmethod
    def _ensure_requested_start(extraction: ChangeEventExtraction) -> ChangeEventExtraction:
        if extraction.requested_start is not None or "requested_start" in extraction.missing_info:
            return extraction
        return extraction.model_copy(
            update={
                "missing_info": (*extraction.missing_info, "requested_start"),
            }
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
            return await self._persist_model_extraction_locked(
                scenario_id,
                event_id,
                extraction,
                model_name=model_name,
                prompt_version=prompt_version,
                confidence_summary=confidence_summary,
            )

    async def _persist_model_extraction_locked(
        self,
        scenario_id: str,
        event_id: UUID,
        extraction: ChangeEventExtraction,
        *,
        model_name: str,
        prompt_version: str,
        confidence_summary: Mapping[str, Any],
        expected_version: int | None = None,
    ) -> EventExtraction:
        repository = EventRepository(self._session)
        event = await repository.get(event_id, scenario_id, for_update=True)
        if event is None:
            raise self._not_found(event_id)
        if expected_version is not None and event.extraction_version != expected_version:
            raise self._version_conflict(expected_version, event.extraction_version)
        await self._validate_extraction(scenario_id, event.raw_text, extraction)
        state = (
            EventState.CLARIFICATION_NEEDED.value
            if (
                extraction.missing_info
                or not extraction.job_ids
            )
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
            raise self._scenario_not_found(scenario_id) from exc

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
    def _event_summary(cls, row: Event, context: _EventReadContext) -> EventSummaryResponse:
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
            job_ids=context.job_ids,
            latest_run_id=context.latest_run.id if context.latest_run is not None else None,
            latest_run_state=context.latest_run.state if context.latest_run is not None else None,
            latest_plan_id=context.latest_plan.id if context.latest_plan is not None else None,
            latest_plan_status=(
                context.latest_plan.status if context.latest_plan is not None else None
            ),
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
    def _scenario_not_found(scenario_id: str) -> ApplicationError:
        return ApplicationError(
            404,
            "unknown_entity",
            "The requested scenario does not exist.",
            details={"scenario_id": scenario_id},
        )

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


def _provenance_provider(provider: str) -> str:
    return "vertex_gemini" if provider == "vertex" else provider
