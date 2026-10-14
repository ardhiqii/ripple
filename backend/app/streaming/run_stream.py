import asyncio
import time
from collections.abc import AsyncIterator, Callable
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from app.application.run_service import RunService
from app.persistence.repositories import RunRepository
from app.streaming.sse import format_sse
from sqlalchemy.ext.asyncio import AsyncSession

POLL_INTERVAL_SECONDS = 0.25
HEARTBEAT_INTERVAL_SECONDS = 12.0
SOFT_TIMEOUT_SECONDS = 45


async def stream_run(
    session_factory: Callable[[], AsyncSession],
    scenario_id: str,
    run_id: UUID,
    *,
    after_sequence: int,
) -> AsyncIterator[str]:
    last_sequence = after_sequence
    last_heartbeat = time.monotonic()
    while True:
        await _enforce_deadline(session_factory, scenario_id, run_id)
        async with session_factory() as session:
            repository = RunRepository(session)
            run = await repository.get(run_id, scenario_id)
            if run is None:
                return
            rows = await repository.list_events_after(run_id, scenario_id, last_sequence)
            terminal = run.state in {"completed", "failed", "timed_out"}

        for row in rows:
            last_sequence = row.sequence
            payload = dict(row.public_payload)
            phase = payload.pop("phase", None)
            yield format_sse(
                run_id=run_id,
                sequence=row.sequence,
                event_type=row.event_type,
                timestamp=row.created_at,
                phase=phase if isinstance(phase, str) else None,
                public=payload,
            )
            if row.event_type == "done":
                return

        if terminal:
            return
        now = time.monotonic()
        if now - last_heartbeat >= HEARTBEAT_INTERVAL_SECONDS:
            yield format_sse(
                run_id=run_id,
                sequence=None,
                event_type="heartbeat",
                timestamp=datetime.now(UTC),
                phase=None,
                public={"summary": "stream heartbeat"},
            )
            last_heartbeat = now
        await asyncio.sleep(POLL_INTERVAL_SECONDS)


async def _enforce_deadline(
    session_factory: Callable[[], AsyncSession], scenario_id: str, run_id: UUID
) -> None:
    warning_needed = False
    timed_out = False
    async with session_factory() as session:
        repository = RunRepository(session)
        run = await repository.get(run_id, scenario_id)
        if run is None or run.state in {"completed", "failed", "timed_out"}:
            return
        now = datetime.now(UTC)
        started_at = _aware(run.started_at)
        timeout_at = _aware(run.timeout_at) if run.timeout_at is not None else None
        events = await repository.list_events(run_id, scenario_id)
        warning_needed = (
            now >= started_at + timedelta(seconds=SOFT_TIMEOUT_SECONDS)
            and not any(
                row.event_type == "warning"
                and isinstance(row.public_payload, dict)
                and row.public_payload.get("code") == "agent_soft_timeout"
                for row in events
            )
        )
        timed_out = timeout_at is not None and now >= timeout_at
        await session.rollback()

    if timed_out:
        async with session_factory() as session:
            await RunService(session).finish(
                scenario_id,
                run_id,
                state="timed_out",
                error_code="agent_timeout",
                summary="Agent run exceeded the hard timeout.",
            )
    elif warning_needed:
        async with session_factory() as session:
            await RunService(session).publish_event(
                scenario_id,
                run_id,
                "warning",
                {
                    "code": "agent_soft_timeout",
                    "summary": "Agent run is approaching its hard timeout.",
                },
                phase="runtime",
            )


def _aware(value: Any) -> datetime:
    if not isinstance(value, datetime):
        return datetime.now(UTC)
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value
