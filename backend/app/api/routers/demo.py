from uuid import UUID

from app.application.demo_service import (
    DemoResetRequest,
    DemoResetResponse,
    DemoScenariosResponse,
    DemoService,
)
from app.application.dependencies import get_db_session
from app.observability.metrics import MetricsRegistry, default_metrics, instrument_stream
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/demo", tags=["demo"])


def _settings_context(request: Request) -> tuple[str, str]:
    settings = getattr(request.app.state, "settings", None)
    return (
        getattr(settings, "environment", "local"),
        getattr(settings, "demo_scenario_id", "A-12-base"),
    )


@router.get("/scenarios", response_model=DemoScenariosResponse)
async def list_demo_scenarios(request: Request) -> DemoScenariosResponse:
    environment, demo_scenario_id = _settings_context(request)
    return DemoService().scenarios(
        environment=environment,
        demo_scenario_id=demo_scenario_id,
    )


@router.post("/reset", response_model=DemoResetResponse)
async def reset_demo(
    payload: DemoResetRequest,
    request: Request,
    session: AsyncSession = Depends(get_db_session),  # noqa: B008
) -> DemoResetResponse:
    environment, demo_scenario_id = _settings_context(request)
    return await DemoService(session).reset(
        payload.scenario_id,
        environment=environment,
        demo_scenario_id=demo_scenario_id,
    )


@router.get("/scenarios/{scenario_id}/runs/{run_id}/stream")
async def stream_recorded_demo(
    scenario_id: str,
    run_id: UUID,
    request: Request,
) -> StreamingResponse:
    environment, _ = _settings_context(request)
    service = DemoService()
    service.mode(environment=environment)
    service.recorded_fixture(scenario_id)
    metrics = getattr(request.app.state, "metrics", default_metrics())
    if not isinstance(metrics, MetricsRegistry):
        metrics = default_metrics()
    stream = instrument_stream(
        service.stream_fixture(scenario_id, run_id, environment=environment),
        registry=metrics,
        span_name="demo.recorded_stream",
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
