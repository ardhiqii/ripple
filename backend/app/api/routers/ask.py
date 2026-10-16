from app.application.ask_service import AskRequest, AskResponse, AskService
from app.application.dependencies import get_db_session, scenario_id_from_request
from app.application.schemas import ErrorEnvelope
from app.domain.policy import OFFSHORE_PACK
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/ask", tags=["ask"])


@router.post(
    "",
    response_model=AskResponse,
    responses={
        404: {"model": ErrorEnvelope, "description": "Scenario or context entity not found."},
        503: {"model": ErrorEnvelope, "description": "Read-only Ask data source is unavailable."},
    },
)
async def ask_ripple(
    payload: AskRequest,
    request: Request,
    session: AsyncSession = Depends(get_db_session),  # noqa: B008
) -> AskResponse:
    return await AskService(session, OFFSHORE_PACK).answer(
        scenario_id_from_request(request), payload
    )
