from uuid import UUID

from app.application.dependencies import (
    get_db_session,
    require_capability,
    scenario_id_from_request,
)
from app.application.readiness_service import ReadinessService
from app.application.schemas import (
    ReadinessDetailResponse,
    ReadinessListResponse,
    ReadinessPatchRequest,
    ReadinessWriteResponse,
    SuggestionReviewRequest,
    SuggestionReviewResponse,
)
from app.domain.enums import Confidence, ReadinessStatus
from app.domain.policy import OFFSHORE_PACK
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/readiness", tags=["readiness"])


@router.get("", response_model=ReadinessListResponse)
async def list_readiness(
    request: Request,
    session: AsyncSession = Depends(get_db_session),  # noqa: B008
    job_id: str | None = None,
    status: ReadinessStatus | None = None,
    confidence: Confidence | None = None,
    risk: str | None = None,
    item: str | None = None,
) -> ReadinessListResponse:
    return await ReadinessService(session, OFFSHORE_PACK).list(
        scenario_id_from_request(request),
        job_id=job_id,
        status=status,
        confidence=confidence,
        risk=risk,
        item_id=item,
    )


@router.get("/{item_id}", response_model=ReadinessDetailResponse)
async def get_readiness_detail(
    item_id: str,
    request: Request,
    session: AsyncSession = Depends(get_db_session),  # noqa: B008
) -> ReadinessDetailResponse:
    return await ReadinessService(session, OFFSHORE_PACK).detail(
        scenario_id_from_request(request), item_id
    )


@router.patch("/{item_id}", response_model=ReadinessWriteResponse)
async def update_readiness(
    item_id: str,
    patch: ReadinessPatchRequest,
    request: Request,
    session: AsyncSession = Depends(get_db_session),  # noqa: B008
) -> ReadinessWriteResponse:
    require_capability(request, "planner.write")
    return await ReadinessService(session, OFFSHORE_PACK).update_manual(
        scenario_id_from_request(request),
        item_id,
        patch,
        actor=request.state.context.actor_id,
    )


@router.post(
    "/suggestions/{suggestion_id}/accept", response_model=ReadinessWriteResponse
)
async def accept_readiness_suggestion(
    suggestion_id: UUID,
    request: Request,
    session: AsyncSession = Depends(get_db_session),  # noqa: B008
) -> ReadinessWriteResponse:
    require_capability(request, "planner.write")
    return await ReadinessService(session, OFFSHORE_PACK).accept_suggestion(
        scenario_id_from_request(request),
        suggestion_id,
        actor=request.state.context.actor_id,
    )


@router.post(
    "/suggestions/{suggestion_id}/reject", response_model=SuggestionReviewResponse
)
async def reject_readiness_suggestion(
    suggestion_id: UUID,
    review: SuggestionReviewRequest,
    request: Request,
    session: AsyncSession = Depends(get_db_session),  # noqa: B008
) -> SuggestionReviewResponse:
    require_capability(request, "planner.write")
    return await ReadinessService(session, OFFSHORE_PACK).reject_suggestion(
        scenario_id_from_request(request),
        suggestion_id,
        review,
        actor=request.state.context.actor_id,
    )
