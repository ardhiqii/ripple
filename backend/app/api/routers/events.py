from uuid import UUID

from app.application.dependencies import (
    get_db_session,
    require_capability,
    scenario_id_from_request,
)
from app.application.event_service import EventService
from app.application.schemas import (
    CreateEventRequest,
    EventDetailResponse,
    EventListResponse,
    EventResponse,
    ExtractionCorrectionRequest,
    ExtractionStartResponse,
)
from app.domain.enums import EventNature, EventState
from app.domain.policy import OFFSHORE_PACK
from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/events", tags=["events"])


@router.post("", response_model=EventResponse, status_code=201)
async def create_event(
    payload: CreateEventRequest,
    request: Request,
    session: AsyncSession = Depends(get_db_session),  # noqa: B008
) -> EventResponse:
    require_capability(request, "planner.write")
    return await EventService(session, OFFSHORE_PACK).create(
        scenario_id_from_request(request), payload, actor=request.state.context.actor_id
    )


@router.get("", response_model=EventListResponse)
async def list_events(
    request: Request,
    session: AsyncSession = Depends(get_db_session),  # noqa: B008
    nature: EventNature | None = Query(default=None),  # noqa: B008
    state: EventState | None = Query(default=None),  # noqa: B008
    job_id: str | None = Query(default=None, max_length=128),  # noqa: B008
    q: str | None = Query(default=None, max_length=200),  # noqa: B008
    limit: int = Query(default=50, ge=1, le=100),  # noqa: B008
    after: str | None = Query(default=None, max_length=512),  # noqa: B008
) -> EventListResponse:
    return await EventService(session, OFFSHORE_PACK).list(
        scenario_id_from_request(request),
        nature=nature,
        state=state,
        job_id=job_id,
        search=q,
        limit=limit,
        after=after,
    )


@router.get("/{event_id}", response_model=EventDetailResponse)
async def get_event(
    event_id: UUID,
    request: Request,
    session: AsyncSession = Depends(get_db_session),  # noqa: B008
) -> EventDetailResponse:
    return await EventService(session, OFFSHORE_PACK).detail(
        scenario_id_from_request(request), event_id
    )


@router.patch("/{event_id}/extraction", response_model=EventDetailResponse)
async def correct_event_extraction(
    event_id: UUID,
    payload: ExtractionCorrectionRequest,
    request: Request,
    session: AsyncSession = Depends(get_db_session),  # noqa: B008
) -> EventDetailResponse:
    require_capability(request, "planner.write")
    return await EventService(session, OFFSHORE_PACK).correct_extraction(
        scenario_id_from_request(request),
        event_id,
        payload,
        actor=request.state.context.actor_id,
    )


@router.post("/{event_id}/extract", response_model=ExtractionStartResponse)
async def start_event_extraction(
    event_id: UUID,
    request: Request,
    session: AsyncSession = Depends(get_db_session),  # noqa: B008
) -> ExtractionStartResponse:
    require_capability(request, "planner.write")
    settings = getattr(request.app.state, "settings", None)
    environment = getattr(settings, "environment", "local")
    synthetic_preview_enabled = getattr(
        settings, "synthetic_preview_extraction_enabled", True
    )
    return await EventService(session, OFFSHORE_PACK).start_extraction(
        scenario_id_from_request(request),
        event_id,
        environment=environment,
        synthetic_preview_enabled=synthetic_preview_enabled,
        settings=settings,
    )


@router.delete("/{event_id}", status_code=204)
async def delete_event(
    event_id: UUID,
    request: Request,
    session: AsyncSession = Depends(get_db_session),  # noqa: B008
) -> Response:
    require_capability(request, "planner.write")
    await EventService(session, OFFSHORE_PACK).delete(scenario_id_from_request(request), event_id)
    return Response(status_code=204)
