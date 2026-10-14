from uuid import UUID

from app.application.decision_service import (
    ApprovalResponse,
    ApprovePlanRequest,
    DecisionMutationResponse,
    DecisionService,
    RejectPlanRequest,
    ReplyPlanRequest,
)
from app.application.dependencies import (
    get_db_session,
    require_capability,
    scenario_id_from_request,
)
from app.application.plan_service import (
    DecisionDetailResponse,
    DecisionListResponse,
    PlanDetailResponse,
    PlanService,
)
from app.domain.enums import DecisionAction
from app.domain.policy import OFFSHORE_PACK
from fastapi import APIRouter, Depends, Header, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(tags=["plans"])


@router.get("/plans/{plan_id}", response_model=PlanDetailResponse)
async def get_plan(
    plan_id: UUID,
    request: Request,
    session: AsyncSession = Depends(get_db_session),  # noqa: B008
) -> PlanDetailResponse:
    return await PlanService(session).detail(scenario_id_from_request(request), plan_id)


@router.post("/plans/{plan_id}/approve", response_model=ApprovalResponse)
async def approve_plan(
    plan_id: UUID,
    payload: ApprovePlanRequest,
    request: Request,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),  # noqa: B008
    session: AsyncSession = Depends(get_db_session),  # noqa: B008
) -> JSONResponse:
    require_capability(request, "planner.approve")
    outcome = await DecisionService(session, OFFSHORE_PACK).approve(
        scenario_id_from_request(request),
        plan_id,
        payload,
        actor=request.state.context.actor_id,
        idempotency_key=idempotency_key,
    )
    return JSONResponse(
        status_code=200,
        content=outcome.response.model_dump(mode="json"),
    )


@router.post("/plans/{plan_id}/reject", response_model=DecisionMutationResponse)
async def reject_plan(
    plan_id: UUID,
    payload: RejectPlanRequest,
    request: Request,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),  # noqa: B008
    session: AsyncSession = Depends(get_db_session),  # noqa: B008
) -> JSONResponse:
    require_capability(request, "planner.approve")
    outcome = await DecisionService(session, OFFSHORE_PACK).reject(
        scenario_id_from_request(request),
        plan_id,
        payload,
        actor=request.state.context.actor_id,
        idempotency_key=idempotency_key,
    )
    return JSONResponse(
        status_code=200,
        content=outcome.response.model_dump(mode="json"),
    )


@router.post("/plans/{plan_id}/reply", response_model=DecisionMutationResponse)
async def reply_to_plan(
    plan_id: UUID,
    payload: ReplyPlanRequest,
    request: Request,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),  # noqa: B008
    session: AsyncSession = Depends(get_db_session),  # noqa: B008
) -> JSONResponse:
    require_capability(request, "planner.approve")
    outcome = await DecisionService(session, OFFSHORE_PACK).reply(
        scenario_id_from_request(request),
        plan_id,
        payload,
        actor=request.state.context.actor_id,
        idempotency_key=idempotency_key,
    )
    return JSONResponse(
        status_code=200,
        content=outcome.response.model_dump(mode="json"),
    )


@router.get("/decisions", response_model=DecisionListResponse)
async def list_decisions(
    request: Request,
    action: DecisionAction | None = Query(default=None),  # noqa: B008
    plan_id: UUID | None = Query(default=None),  # noqa: B008
    limit: int = Query(default=50, ge=1, le=100),  # noqa: B008
    after: str | None = Query(default=None, max_length=512),  # noqa: B008
    session: AsyncSession = Depends(get_db_session),  # noqa: B008
) -> DecisionListResponse:
    return await PlanService(session).list_decisions(
        scenario_id_from_request(request),
        action=action,
        plan_id=plan_id,
        limit=limit,
        after=after,
    )


@router.get("/decisions/{decision_id}", response_model=DecisionDetailResponse)
async def get_decision(
    decision_id: UUID,
    request: Request,
    session: AsyncSession = Depends(get_db_session),  # noqa: B008
) -> DecisionDetailResponse:
    return await PlanService(session).decision_detail(
        scenario_id_from_request(request), decision_id
    )
