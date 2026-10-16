import hashlib
import json
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

from app.agent.workflow import WorkflowLimits
from app.application.errors import ApplicationError
from app.application.schemas import ApiModel
from app.persistence.models import AgentRun, AgentRunEvent
from app.persistence.repositories import EventRepository, RunRepository
from sqlalchemy.ext.asyncio import AsyncSession

_TERMINAL_STATES = {"completed", "failed", "timed_out"}
_PUBLIC_EVENT_TYPES = {
    "run_started",
    "step",
    "tool_call",
    "tool_result",
    "extraction",
    "plan",
    "warning",
    "error",
    "done",
}
_SENSITIVE_PUBLIC_KEYS = frozenset(
    {
        "chain_of_thought",
        "cot",
        "credential",
        "credentials",
        "internal",
        "password",
        "prompt",
        "raw_model_payload",
        "secret",
        "stack_trace",
        "system_prompt",
        "thought",
        "token",
    }
)


class RunCreateResponse(ApiModel):
    run_id: UUID
    event_id: UUID
    extraction_version: int
    state: str
    attempt: int
    stream_url: str


class PublicRunEventResponse(ApiModel):
    run_id: UUID
    seq: int
    type: str
    timestamp: datetime
    phase: str | None
    public: dict[str, Any]


class RunDetailResponse(ApiModel):
    run_id: UUID
    event_id: UUID
    extraction_version: int
    state: str
    attempt: int
    tool_call_budget: int
    tool_call_usage: int
    started_at: datetime
    completed_at: datetime | None
    timeout_at: datetime | None
    error_code: str | None
    plan_id: UUID | None
    events: tuple[PublicRunEventResponse, ...]


@dataclass(frozen=True, slots=True)
class RunCreateOutcome:
    response: RunCreateResponse
    replayed: bool


class RunService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(
        self,
        scenario_id: str,
        event_id: UUID,
        *,
        actor: str,
        idempotency_key: str | None,
    ) -> RunCreateOutcome:
        async with self._session.begin():
            event_repository = EventRepository(self._session)
            event = await event_repository.get(event_id, scenario_id, for_update=True)
            if event is None:
                raise self._not_found(event_id)
            if event.extraction_version == 0:
                raise ApplicationError(
                    409,
                    "extraction_required",
                    "An event must have a validated extraction before a run can start.",
                    details={"event_id": str(event_id)},
                )
            if event.state == "clarification_needed":
                raise ApplicationError(
                    422,
                    "missing_information",
                    "The event requires planner clarification before a run can start.",
                    details={"event_id": str(event_id)},
                )
            if event.state not in {"extracted", "planning"}:
                raise ApplicationError(
                    409,
                    "invalid_state_transition",
                    "The event cannot start an agent run from its current state.",
                    details={"state": event.state},
                )

            repository = RunRepository(self._session)
            key = (idempotency_key or f"auto:{event_id}:{event.extraction_version}").strip()
            if not key:
                raise ApplicationError(422, "validation_error", "Idempotency-Key cannot be empty.")
            request_hash = _request_hash(event_id, event.extraction_version)
            route_scope = f"events/{event_id}/runs"
            now = datetime.now(UTC)
            existing = await repository.get_idempotency_key(
                actor,
                route_scope,
                key,
                now=now,
                for_update=True,
            )
            if existing is not None:
                if existing.request_hash != request_hash:
                    raise ApplicationError(
                        409,
                        "idempotency_key_reused",
                        "The idempotency key was already used with a different request.",
                    )
                if not isinstance(existing.response_body, dict):
                    raise ApplicationError(
                        409,
                        "run_creation_in_progress",
                        "The original run creation has not produced a response yet.",
                        retryable=True,
                    )
                return RunCreateOutcome(
                    response=RunCreateResponse.model_validate(existing.response_body),
                    replayed=True,
                )

            timeout_at = now + timedelta(seconds=60)
            run = await repository.create_run(
                run_id=uuid4(),
                event_id=event_id,
                extraction_version=event.extraction_version,
                model_config_snapshot={
                    "workflow": "single-agent",
                    "trace": "public-sanitized",
                },
                tool_call_budget=WorkflowLimits().max_tool_calls,
                timeout_at=timeout_at,
                idempotency_key=key,
                now=now,
            )
            await repository.append_next_event(
                run.id,
                scenario_id,
                "run_started",
                {"summary": "Agent run started."},
                phase="intake",
                internal_payload={"request_hash": request_hash},
            )
            event.state = "planning"
            event.updated_at = now
            await self._session.flush()
            response = RunCreateResponse(
                run_id=run.id,
                event_id=event_id,
                extraction_version=run.extraction_version,
                state=run.state,
                attempt=run.attempt,
                stream_url=f"/api/v1/runs/{run.id}/stream",
            )
            await repository.save_idempotency_key(
                actor_id=actor,
                route_scope=route_scope,
                key=key,
                request_hash=request_hash,
                response_status=201,
                response_body=response.model_dump(mode="json"),
                expires_at=now + timedelta(hours=24),
            )
            return RunCreateOutcome(response=response, replayed=False)

    async def detail(self, scenario_id: str, run_id: UUID) -> RunDetailResponse:
        repository = RunRepository(self._session)
        run = await repository.get(run_id, scenario_id)
        if run is None:
            raise self._run_not_found(run_id)
        return self._detail_response(
            run,
            await repository.list_events(run_id, scenario_id),
            await repository.latest_plan_id(run_id, scenario_id),
        )

    async def ensure_stream(self, scenario_id: str, run_id: UUID, after: int) -> None:
        if after < 0:
            raise ApplicationError(422, "validation_error", "Stream sequence cannot be negative.")
        if await RunRepository(self._session).get(run_id, scenario_id) is None:
            raise self._run_not_found(run_id)

    async def publish_event(
        self,
        scenario_id: str,
        run_id: UUID,
        event_type: str,
        public_payload: Mapping[str, object],
        *,
        phase: str | None = None,
        internal_payload: Mapping[str, object] | None = None,
    ) -> PublicRunEventResponse:
        if event_type not in _PUBLIC_EVENT_TYPES:
            raise ApplicationError(
                422,
                "validation_error",
                "Unsupported public run event type.",
                details={"type": event_type},
            )
        safe_payload = _sanitize_public_payload(public_payload)
        async with self._session.begin():
            row = await RunRepository(self._session).append_next_event(
                run_id,
                scenario_id,
                event_type,
                safe_payload,
                phase=phase,
                internal_payload=internal_payload,
            )
        return self._public_event_response(row)

    async def finish(
        self,
        scenario_id: str,
        run_id: UUID,
        *,
        state: str,
        error_code: str | None = None,
        summary: str | None = None,
    ) -> PublicRunEventResponse | None:
        if state not in _TERMINAL_STATES:
            raise ApplicationError(422, "validation_error", "Invalid terminal run state.")
        async with self._session.begin():
            repository = RunRepository(self._session)
            run = await repository.get(run_id, scenario_id, for_update=True)
            if run is None:
                raise self._run_not_found(run_id)
            if run.state in _TERMINAL_STATES:
                return None
            if error_code is not None:
                await repository.append_next_event(
                    run_id,
                    scenario_id,
                    "error",
                    {"code": error_code, "summary": summary or "Agent run failed."},
                    phase="complete",
                )
            done = await repository.append_next_event(
                run_id,
                scenario_id,
                "done",
                {
                    "status": state,
                    "summary": summary or "Agent run completed.",
                },
                phase="complete",
            )
            await repository.update_state(
                run_id,
                scenario_id,
                state=state,
                completed_at=datetime.now(UTC),
                error_code=error_code,
                error_detail=summary,
            )
            return self._public_event_response(done)

    @staticmethod
    def _detail_response(
        run: AgentRun,
        events: tuple[AgentRunEvent, ...],
        plan_id: UUID | None,
    ) -> RunDetailResponse:
        now = datetime.now(UTC)
        return RunDetailResponse(
            run_id=run.id,
            event_id=run.event_id,
            extraction_version=run.extraction_version,
            state=run.state,
            attempt=run.attempt,
            tool_call_budget=run.tool_call_budget,
            tool_call_usage=run.tool_call_usage,
            started_at=run.started_at or now,
            completed_at=run.completed_at,
            timeout_at=run.timeout_at,
            error_code=run.error_code,
            plan_id=plan_id,
            events=tuple(RunService._public_event_response(row) for row in events),
        )

    @staticmethod
    def _public_event_response(row: AgentRunEvent) -> PublicRunEventResponse:
        payload = dict(row.public_payload)
        phase = payload.pop("phase", None)
        return PublicRunEventResponse(
            run_id=row.run_id,
            seq=row.sequence,
            type=row.event_type,
            timestamp=row.created_at or datetime.now(UTC),
            phase=phase if isinstance(phase, str) else None,
            public=payload,
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
    def _run_not_found(run_id: UUID) -> ApplicationError:
        return ApplicationError(
            404,
            "unknown_entity",
            "The requested run does not exist in this scenario.",
            details={"run_id": str(run_id)},
        )


def parse_stream_sequence(value: str | None) -> int:
    if value is None or not value.strip():
        return 0
    try:
        sequence = int(value)
    except ValueError as exc:
        raise ApplicationError(
            422, "validation_error", "Stream sequence must be an integer."
        ) from exc
    if sequence < 0:
        raise ApplicationError(422, "validation_error", "Stream sequence cannot be negative.")
    return sequence


def resolve_stream_sequence(last_event_id: str | None, after: str | None) -> int:
    values = [parse_stream_sequence(value) for value in (last_event_id, after) if value is not None]
    return max(values, default=0)


def _request_hash(event_id: UUID, extraction_version: int) -> str:
    payload = json.dumps(
        {"event_id": str(event_id), "extraction_version": extraction_version},
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode()).hexdigest()


def _sanitize_public_payload(value: Mapping[str, object]) -> dict[str, object]:
    def sanitize(item: object) -> object:
        if isinstance(item, Mapping):
            return {
                str(key): sanitize(nested)
                for key, nested in item.items()
                if str(key).lower() not in _SENSITIVE_PUBLIC_KEYS
            }
        if isinstance(item, list):
            return [sanitize(nested) for nested in item]
        if isinstance(item, tuple):
            return [sanitize(nested) for nested in item]
        return item

    result = sanitize(value)
    return result if isinstance(result, dict) else {}
