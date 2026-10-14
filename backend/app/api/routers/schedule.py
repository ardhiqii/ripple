from uuid import UUID

from app.application.dependencies import get_db_session, scenario_id_from_request
from app.application.schedule_service import ScheduleService
from app.application.schemas import ScheduleChangesResponse, ScheduleResponse
from app.domain.policy import OFFSHORE_PACK
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/schedule", tags=["schedule"])


@router.get("", response_model=ScheduleResponse)
async def get_schedule(
    request: Request,
    session: AsyncSession = Depends(get_db_session),  # noqa: B008
    from_day: int | None = Query(default=None, alias="from"),  # noqa: B008
    to_day: int | None = Query(default=None, alias="to"),  # noqa: B008
    groups: list[str] | None = Query(default=None),  # noqa: B008
) -> ScheduleResponse:
    return await ScheduleService(session, OFFSHORE_PACK).get_schedule(
        scenario_id_from_request(request),
        from_day=from_day,
        to_day=to_day,
        groups=groups,
    )


@router.get("/changes", response_model=ScheduleChangesResponse)
async def get_schedule_changes(
    decision_id: UUID,
    request: Request,
    session: AsyncSession = Depends(get_db_session),  # noqa: B008
) -> ScheduleChangesResponse:
    return await ScheduleService(session, OFFSHORE_PACK).get_changes(
        scenario_id_from_request(request), decision_id
    )
