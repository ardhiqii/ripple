from app.application.dependencies import get_db_session, scenario_id_from_request
from app.application.policy_service import PolicyService
from app.application.schemas import (
    PolicyDataHealthResponse,
    PolicyLeversResponse,
    PolicyProfilesResponse,
)
from app.domain.policy import OFFSHORE_PACK
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/policy", tags=["policy"])


@router.get("/levers", response_model=PolicyLeversResponse)
async def get_levers() -> PolicyLeversResponse:
    return PolicyService(None, OFFSHORE_PACK).levers()  # type: ignore[arg-type]


@router.get("/profiles", response_model=PolicyProfilesResponse)
async def get_profiles() -> PolicyProfilesResponse:
    return PolicyService(None, OFFSHORE_PACK).profiles()  # type: ignore[arg-type]


@router.get("/data-health", response_model=PolicyDataHealthResponse)
async def get_data_health(
    request: Request,
    session: AsyncSession = Depends(get_db_session),  # noqa: B008
) -> PolicyDataHealthResponse:
    return await PolicyService(session, OFFSHORE_PACK).data_health(
        scenario_id_from_request(request)
    )
