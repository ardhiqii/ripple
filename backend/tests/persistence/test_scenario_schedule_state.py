import asyncio
import os
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from app.persistence.database import create_async_engine, create_session_factory
from app.persistence.models import ScheduleState
from app.persistence.repositories import ScheduleRepository
from sqlalchemy import select

pytestmark = pytest.mark.skipif(
    not os.getenv("RIPPLE_DATABASE_URL"),
    reason="set RIPPLE_DATABASE_URL for PostgreSQL migration/concurrency tests",
)


def test_scenarios_keep_independent_versions_and_row_locks() -> None:
    database_url = os.environ["RIPPLE_DATABASE_URL"]
    scenario_a = f"be16-test-a-{uuid4()}"
    scenario_b = f"be16-test-b-{uuid4()}"

    async def scenario() -> None:
        engine = create_async_engine(database_url)
        factory = create_session_factory(engine)
        created_a12 = False

        try:
            async with factory() as session:
                async with session.begin():
                    a12 = await session.get(ScheduleState, 1)
                    if a12 is None:
                        a12 = ScheduleState(id=1, scenario_id="A-12-base", version=1)
                        session.add(a12)
                        created_a12 = True
                    else:
                        assert a12.scenario_id == "A-12-base"

                    state_a = ScheduleState(scenario_id=scenario_a, version=4)
                    state_b = ScheduleState(scenario_id=scenario_b, version=9)
                    session.add_all((state_a, state_b))
                    await session.flush()

                    assert state_a.id not in {1, state_b.id}
                    assert state_b.id not in {1, state_a.id}

                    repository = ScheduleRepository(session)
                    now = datetime.now(UTC)
                    await repository.set_locked_version(state_a, 5, updated_at=now)
                    await repository.set_locked_version(state_b, 10, updated_at=now)

            async with factory() as session:
                assert await ScheduleRepository(session).get_schedule_version(scenario_a) == 5
                assert await ScheduleRepository(session).get_schedule_version(scenario_b) == 10

            first_session = factory()
            await first_session.begin()
            try:
                first_state = await ScheduleRepository(first_session).lock_state_for_update(
                    scenario_a
                )
                assert first_state is not None

                acquired = asyncio.Event()

                async def lock_other_scenario() -> None:
                    async with factory() as second_session:
                        async with second_session.begin():
                            other_state = await ScheduleRepository(
                                second_session
                            ).lock_state_for_update(scenario_b)
                            assert other_state is not None
                            acquired.set()

                task = asyncio.create_task(lock_other_scenario())
                await asyncio.wait_for(acquired.wait(), timeout=1)
                await asyncio.wait_for(task, timeout=1)
            finally:
                await first_session.rollback()
                await first_session.close()
        finally:
            async with factory() as session:
                async with session.begin():
                    for scenario_id in (scenario_a, scenario_b):
                        row = await session.scalar(
                            select(ScheduleState).where(ScheduleState.scenario_id == scenario_id)
                        )
                        if row is not None:
                            await session.delete(row)
                    if created_a12:
                        row = await session.get(ScheduleState, 1)
                        if row is not None:
                            await session.delete(row)
            await engine.dispose()

    asyncio.run(scenario())
