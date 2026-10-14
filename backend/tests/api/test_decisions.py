import asyncio
import os
from uuid import UUID, uuid4

import pytest
from app.application.decision_service import (
    ApprovePlanRequest,
    DecisionService,
    RejectPlanRequest,
    ReplyPlanRequest,
)
from app.application.errors import ApplicationError
from app.application.plan_service import PlanDraft, PlanOptionDraft, PlanService
from app.config import Settings
from app.domain.policy import OFFSHORE_PACK
from app.persistence.database import create_async_engine, create_session_factory
from app.persistence.models import (
    AgentRun,
    Decision,
    DecisionChange,
    Event,
    IdempotencyKey,
    NotificationOutbox,
    Plan,
    PlanOption,
    ScheduleState,
)
from app.persistence.models import Booking as BookingRow
from app.persistence.models import Job as JobRow
from app.persistence.repositories import ScheduleRepository
from sqlalchemy import delete, select


def _settings() -> Settings:
    database_url = os.getenv("RIPPLE_DATABASE_URL")
    if not database_url:
        pytest.skip("set RIPPLE_DATABASE_URL for PostgreSQL API integration fixtures")
    return Settings(environment="test", database_url=database_url)


@pytest.mark.skipif(
    not os.getenv("RIPPLE_DATABASE_URL"),
    reason="set RIPPLE_DATABASE_URL for PostgreSQL API integration fixtures",
)
def test_approval_is_atomic_idempotent_and_revalidates() -> None:
    _settings()

    async def exercise() -> None:
        engine = create_async_engine(os.environ["RIPPLE_DATABASE_URL"])
        factory = create_session_factory(engine)
        scenario_id = "A-12-base"
        actor = "be13-test"
        event_ids: list[UUID] = []
        run_ids: list[UUID] = []
        plan_ids: list[UUID] = []
        decision_ids: list[UUID] = []
        original_version = 0
        original_job = (0, 0)
        original_booking = (0, 0, 0)
        try:
            async with factory() as session:
                state = await session.scalar(
                    select(ScheduleState).where(ScheduleState.scenario_id == scenario_id)
                )
                job = await session.get(JobRow, "C-03")
                booking = await session.get(BookingRow, "booking-C-03")
                assert state is not None and job is not None and booking is not None
                original_version = int(state.version)
                original_job = (job.start_day, job.row_version)
                original_booking = (booking.start_day, booking.end_day, booking.row_version)
                await session.rollback()

                async def create_plan(
                    *,
                    changes: tuple[dict[str, object], ...],
                    label: str,
                ) -> UUID:
                    event_id = uuid4()
                    run_id = uuid4()
                    event_ids.append(event_id)
                    run_ids.append(run_id)
                    async with session.begin():
                        session.add(
                            Event(
                                id=event_id,
                                scenario_id=scenario_id,
                                nature="disruption",
                                raw_text=f"{label} event",
                                state="planning",
                                origin_type="api",
                                extraction_version=1,
                                created_by=actor,
                            )
                        )
                        await session.flush()
                        session.add(
                            AgentRun(
                                id=run_id,
                                event_id=event_id,
                                extraction_version=1,
                                state="completed",
                                model_config_snapshot={"test": True},
                                tool_call_budget=15,
                            )
                        )
                    created = await PlanService(session).create(
                        scenario_id,
                        PlanDraft(
                            event_id=event_id,
                            run_id=run_id,
                            verdict="feasible",
                            base_schedule_version=original_version,
                            explanation={"summary": label},
                            options=(
                                PlanOptionDraft(
                                    label=label,
                                    weight_profile="balanced",
                                    solver_status="optimal",
                                    changes=changes,
                                    recommended=True,
                                ),
                            ),
                        ),
                    )
                    await session.rollback()
                    plan_ids.append(created.id)
                    return created.id

                duplicate_plan_id = await create_plan(changes=(), label="idempotent approval")
                request = ApprovePlanRequest(
                    option_id=(await _recommended_option(session, duplicate_plan_id)),
                    expected_schedule_version=original_version,
                )
                await session.rollback()
                first = await DecisionService(session, OFFSHORE_PACK).approve(
                    scenario_id,
                    duplicate_plan_id,
                    request,
                    actor=actor,
                    idempotency_key="approve-duplicate",
                )
                decision_ids.append(first.response.decision_id)
                repeated = await DecisionService(session, OFFSHORE_PACK).approve(
                    scenario_id,
                    duplicate_plan_id,
                    request,
                    actor=actor,
                    idempotency_key="approve-duplicate",
                )
                assert repeated.replayed
                assert repeated.response == first.response
                await session.rollback()

                await _set_version(factory, scenario_id, original_version)
                conflict_plan_id = await create_plan(changes=(), label="version conflict")
                conflict_option_id = await _recommended_option(session, conflict_plan_id)
                await session.rollback()
                await _set_version(factory, scenario_id, original_version + 1)
                with pytest.raises(ApplicationError, match="schedule changed"):
                    await DecisionService(session, OFFSHORE_PACK).approve(
                        scenario_id,
                        conflict_plan_id,
                        ApprovePlanRequest(
                            option_id=conflict_option_id,
                            expected_schedule_version=original_version,
                        ),
                        actor=actor,
                        idempotency_key="approve-conflict",
                    )
                await session.rollback()
                await _set_version(factory, scenario_id, original_version)

                infeasible_plan_id = await create_plan(
                    changes=({"kind": "move_job", "target": "C-03", "value": 7},),
                    label="newly infeasible option",
                )
                infeasible_option_id = await _recommended_option(session, infeasible_plan_id)
                await session.rollback()
                with pytest.raises(ApplicationError, match="no longer feasible"):
                    await DecisionService(session, OFFSHORE_PACK).approve(
                        scenario_id,
                        infeasible_plan_id,
                        ApprovePlanRequest(
                            option_id=infeasible_option_id,
                            expected_schedule_version=original_version,
                        ),
                        actor=actor,
                        idempotency_key="approve-infeasible",
                    )
                await session.rollback()

                rollback_plan_id = await create_plan(
                    changes=({"kind": "move_job", "target": "C-03", "value": 4},),
                    label="rollback approval",
                )
                rollback_option_id = await _recommended_option(session, rollback_plan_id)
                await session.rollback()
                original_apply = ScheduleRepository.apply_changes

                async def fail_after_apply(*args: object, **kwargs: object) -> None:
                    await original_apply(*args, **kwargs)  # type: ignore[arg-type]
                    raise RuntimeError("forced apply failure")

                monkeypatch = pytest.MonkeyPatch()
                monkeypatch.setattr(ScheduleRepository, "apply_changes", fail_after_apply)
                try:
                    with pytest.raises(RuntimeError, match="forced apply failure"):
                        await DecisionService(session, OFFSHORE_PACK).approve(
                            scenario_id,
                            rollback_plan_id,
                            ApprovePlanRequest(
                                option_id=rollback_option_id,
                                expected_schedule_version=original_version,
                            ),
                            actor=actor,
                            idempotency_key="approve-rollback",
                        )
                finally:
                    monkeypatch.undo()
                await session.rollback()
                restored_job = await session.get(JobRow, "C-03")
                restored_booking = await session.get(BookingRow, "booking-C-03")
                restored_state = await session.scalar(
                    select(ScheduleState).where(ScheduleState.scenario_id == scenario_id)
                )
                assert restored_job is not None and restored_booking is not None
                assert restored_state is not None
                assert (restored_job.start_day, restored_job.row_version) == original_job
                assert (
                    restored_booking.start_day,
                    restored_booking.end_day,
                    restored_booking.row_version,
                ) == original_booking
                assert restored_state.version == original_version
        finally:
            async with factory() as session:
                async with session.begin():
                    if decision_ids:
                        await session.execute(
                            delete(DecisionChange).where(
                                DecisionChange.decision_id.in_(decision_ids)
                            )
                        )
                        await session.execute(
                            delete(NotificationOutbox).where(
                                NotificationOutbox.decision_id.in_(decision_ids)
                            )
                        )
                        await session.execute(delete(Decision).where(Decision.id.in_(decision_ids)))
                    await session.execute(
                        delete(IdempotencyKey).where(IdempotencyKey.actor_id == actor)
                    )
                    if plan_ids:
                        await session.execute(
                            delete(PlanOption).where(PlanOption.plan_id.in_(plan_ids))
                        )
                        await session.execute(delete(Plan).where(Plan.id.in_(plan_ids)))
                    if run_ids:
                        await session.execute(delete(AgentRun).where(AgentRun.id.in_(run_ids)))
                    if event_ids:
                        await session.execute(delete(Event).where(Event.id.in_(event_ids)))
                    state = await session.scalar(
                        select(ScheduleState).where(ScheduleState.scenario_id == scenario_id)
                    )
                    job = await session.get(JobRow, "C-03")
                    booking = await session.get(BookingRow, "booking-C-03")
                    if state is not None:
                        state.version = original_version
                    if job is not None:
                        job.start_day, job.row_version = original_job
                    if booking is not None:
                        booking.start_day = original_booking[0]
                        booking.end_day = original_booking[1]
                        booking.row_version = original_booking[2]
            await engine.dispose()

    async def _recommended_option(session, plan_id: UUID) -> UUID:
        option = await session.scalar(
            select(PlanOption.id).where(
                PlanOption.plan_id == plan_id,
                PlanOption.is_recommended.is_(True),
            )
        )
        assert option is not None
        return option

    async def _set_version(factory, scenario_id: str, version: int) -> None:
        async with factory() as session:
            async with session.begin():
                state = await session.scalar(
                    select(ScheduleState).where(ScheduleState.scenario_id == scenario_id)
                )
                assert state is not None
                state.version = version

    asyncio.run(exercise())


@pytest.mark.skipif(
    not os.getenv("RIPPLE_DATABASE_URL"),
    reason="set RIPPLE_DATABASE_URL for PostgreSQL API integration fixtures",
)
def test_reject_replan_and_reply_create_linked_events() -> None:
    _settings()

    async def exercise() -> None:
        engine = create_async_engine(os.environ["RIPPLE_DATABASE_URL"])
        factory = create_session_factory(engine)
        scenario_id = "A-12-base"
        actor = "be13-link-test"
        event_ids: list[UUID] = []
        run_ids: list[UUID] = []
        plan_ids: list[UUID] = []
        decision_ids: list[UUID] = []
        try:
            async with factory() as session:
                async def create_plan(label: str) -> UUID:
                    event_id = uuid4()
                    run_id = uuid4()
                    event_ids.append(event_id)
                    run_ids.append(run_id)
                    async with session.begin():
                        session.add(
                            Event(
                                id=event_id,
                                scenario_id=scenario_id,
                                nature="disruption",
                                raw_text=f"{label} source",
                                state="planning",
                                origin_type="api",
                                extraction_version=1,
                                created_by=actor,
                            )
                        )
                        await session.flush()
                        session.add(
                            AgentRun(
                                id=run_id,
                                event_id=event_id,
                                extraction_version=1,
                                state="completed",
                                model_config_snapshot={"test": True},
                                tool_call_budget=15,
                            )
                        )
                    created = await PlanService(session).create(
                        scenario_id,
                        PlanDraft(
                            event_id=event_id,
                            run_id=run_id,
                            verdict="feasible",
                            base_schedule_version=1,
                            explanation={"summary": label},
                            options=(
                                PlanOptionDraft(
                                    label=label,
                                    weight_profile="balanced",
                                    solver_status="optimal",
                                    recommended=True,
                                ),
                            ),
                        ),
                    )
                    await session.rollback()
                    plan_ids.append(created.id)
                    return created.id

                rejected_plan_id = await create_plan("reject and replan")
                rejected = await DecisionService(session, OFFSHORE_PACK).reject(
                    scenario_id,
                    rejected_plan_id,
                    RejectPlanRequest(
                        reason="The selected vessel is not available.",
                        category="logistics",
                        replan=True,
                    ),
                    actor=actor,
                    idempotency_key="reject-link",
                )
                decision_ids.append(rejected.response.decision_id)
                assert rejected.response.event_id is not None
                linked_rejection = await session.get(Event, rejected.response.event_id)
                rejected_row = await session.get(Plan, rejected_plan_id)
                assert linked_rejection is not None and rejected_row is not None
                assert linked_rejection.parent_plan_id == rejected_plan_id
                assert linked_rejection.raw_text.startswith("The selected vessel")
                assert rejected_row.status == "rejected"
                await session.rollback()

                rejected_replay = await DecisionService(session, OFFSHORE_PACK).reject(
                    scenario_id,
                    rejected_plan_id,
                    RejectPlanRequest(
                        reason="The selected vessel is not available.",
                        category="logistics",
                        replan=True,
                    ),
                    actor=actor,
                    idempotency_key="reject-link",
                )
                assert rejected_replay.replayed
                await session.rollback()

                reply_plan_id = await create_plan("reply context")
                reply = await DecisionService(session, OFFSHORE_PACK).reply(
                    scenario_id,
                    reply_plan_id,
                    ReplyPlanRequest(context="Do not move the drums; use the dedicated boat."),
                    actor=actor,
                    idempotency_key="reply-link",
                )
                decision_ids.append(reply.response.decision_id)
                assert reply.response.event_id is not None
                linked_reply = await session.get(Event, reply.response.event_id)
                reply_row = await session.get(Plan, reply_plan_id)
                assert linked_reply is not None and reply_row is not None
                assert linked_reply.parent_plan_id == reply_plan_id
                assert linked_reply.raw_text == "Do not move the drums; use the dedicated boat."
                assert reply_row.status == "proposed"
                await session.rollback()

                reply_replay = await DecisionService(session, OFFSHORE_PACK).reply(
                    scenario_id,
                    reply_plan_id,
                    ReplyPlanRequest(context="Do not move the drums; use the dedicated boat."),
                    actor=actor,
                    idempotency_key="reply-link",
                )
                assert reply_replay.replayed
        finally:
            async with factory() as session:
                async with session.begin():
                    linked_events = await session.scalars(
                        select(Event.id).where(Event.parent_plan_id.in_(plan_ids))
                    )
                    linked_event_ids = tuple(linked_events)
                    if decision_ids:
                        await session.execute(
                            delete(DecisionChange).where(
                                DecisionChange.decision_id.in_(decision_ids)
                            )
                        )
                        await session.execute(delete(Decision).where(Decision.id.in_(decision_ids)))
                    await session.execute(
                        delete(IdempotencyKey).where(IdempotencyKey.actor_id == actor)
                    )
                    if linked_event_ids:
                        await session.execute(
                            delete(Event).where(Event.id.in_(linked_event_ids))
                        )
                    if plan_ids:
                        await session.execute(
                            delete(PlanOption).where(PlanOption.plan_id.in_(plan_ids))
                        )
                        await session.execute(delete(Plan).where(Plan.id.in_(plan_ids)))
                    if run_ids:
                        await session.execute(delete(AgentRun).where(AgentRun.id.in_(run_ids)))
                    if event_ids:
                        await session.execute(delete(Event).where(Event.id.in_(event_ids)))
            await engine.dispose()

    asyncio.run(exercise())
