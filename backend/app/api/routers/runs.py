from uuid import UUID

from app.application.agent_run_executor import AgentRunExecutor
from app.application.dependencies import (
    get_db_session,
    get_session_factory,
    require_capability,
    scenario_id_from_request,
)
from app.application.run_service import (
    RunCreateResponse,
    RunDetailResponse,
    RunService,
    resolve_stream_sequence,
)
from app.domain.policy import OFFSHORE_PACK
from app.observability.metrics import MetricsRegistry, default_metrics, instrument_stream
from app.streaming.run_stream import stream_run as stream_run_content
from fastapi import APIRouter, Depends, Header, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.background import BackgroundTask

router = APIRouter(tags=["runs"])


@router.post(
    "/events/{event_id}/runs",
    response_model=RunCreateResponse,
    status_code=201,
)
async def create_run(
    event_id: UUID,
    request: Request,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),  # noqa: B008
    session: AsyncSession = Depends(get_db_session),  # noqa: B008
) -> JSONResponse:
    require_capability(request, "planner.write")
    scenario_id = scenario_id_from_request(request)
    outcome = await RunService(session).create(
        scenario_id,
        event_id,
        actor=request.state.context.actor_id,
        idempotency_key=idempotency_key,
    )
    background = None
    if not outcome.replayed:
        executor = AgentRunExecutor(get_session_factory(request), OFFSHORE_PACK)
        background = BackgroundTask(executor.execute, scenario_id, outcome.response.run_id)
    return JSONResponse(
        status_code=200 if outcome.replayed else 201,
        content=outcome.response.model_dump(mode="json"),
        background=background,
    )


@router.get("/runs/{run_id}", response_model=RunDetailResponse)
async def get_run(
    run_id: UUID,
    request: Request,
    session: AsyncSession = Depends(get_db_session),  # noqa: B008
) -> RunDetailResponse:
    return await RunService(session).detail(scenario_id_from_request(request), run_id)


@router.get("/runs/{run_id}/stream")
async def stream_run(
    run_id: UUID,
    request: Request,
    after: str | None = Query(default=None),  # noqa: B008
    last_event_id: str | None = Header(default=None, alias="Last-Event-ID"),  # noqa: B008
    session: AsyncSession = Depends(get_db_session),  # noqa: B008
) -> StreamingResponse:
    scenario_id = scenario_id_from_request(request)
    sequence = resolve_stream_sequence(last_event_id, after)
    await RunService(session).ensure_stream(scenario_id, run_id, sequence)
    factory = get_session_factory(request)
    metrics = getattr(request.app.state, "metrics", default_metrics())
    if not isinstance(metrics, MetricsRegistry):
        metrics = default_metrics()
    stream = instrument_stream(
        stream_run_content(factory, scenario_id, run_id, after_sequence=sequence),
        registry=metrics,
        span_name="agent.run.stream",
        labels={"scenario_id": scenario_id},
    )
    return StreamingResponse(
        stream,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
