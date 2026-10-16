import asyncio
import os

import pytest
from app.persistence.database import create_async_engine, create_session_factory
from app.persistence.models import ResourceUnavailability
from app.persistence.repositories import ScheduleRepository
from sqlalchemy.exc import IntegrityError

pytestmark = pytest.mark.skipif(
    not os.getenv("RIPPLE_DATABASE_URL"),
    reason="set RIPPLE_DATABASE_URL for PostgreSQL resource interval tests",
)


def test_resource_unavailability_rejects_invalid_and_cross_scenario_references() -> None:
    database_url = os.environ["RIPPLE_DATABASE_URL"]

    async def scenario() -> None:
        engine = create_async_engine(database_url)
        factory = create_session_factory(engine)
        try:
            async with factory() as session:
                repository = ScheduleRepository(session)
                with pytest.raises(ValueError, match="on or after"):
                    await repository.create_unavailability(
                        id="be22-invalid-range",
                        scenario_id="fleet-scale",
                        resource_id="FS-RES-02",
                        start_day=9,
                        end_day=8,
                        kind="maintenance",
                        reason="invalid test row",
                    )
                with pytest.raises(LookupError, match="unknown resource"):
                    await repository.create_unavailability(
                        id="be22-unknown-resource",
                        scenario_id="fleet-scale",
                        resource_id="does-not-exist",
                        start_day=1,
                        end_day=1,
                        kind="unavailable",
                        reason="invalid test row",
                    )
                with pytest.raises(ValueError, match="another scenario"):
                    await repository.create_unavailability(
                        id="be22-cross-scenario",
                        scenario_id="A-12-base",
                        resource_id="FS-RES-02",
                        start_day=1,
                        end_day=1,
                        kind="maintenance",
                        reason="invalid test row",
                    )
                intervals = await repository.list_unavailability(
                    "fleet-scale",
                    resource_ids={"FS-RES-02"},
                    from_day=4,
                    to_day=4,
                )
                assert [interval.id for interval in intervals] == ["FS-UNAV-001"]
        finally:
            await engine.dispose()

    asyncio.run(scenario())


def test_database_constraints_reject_invalid_interval_rows() -> None:
    database_url = os.environ["RIPPLE_DATABASE_URL"]

    async def scenario() -> None:
        engine = create_async_engine(database_url)
        factory = create_session_factory(engine)

        async def assert_rejected(row: ResourceUnavailability) -> None:
            async with factory() as session:
                session.add(row)
                try:
                    await session.flush()
                except IntegrityError:
                    await session.rollback()
                else:
                    await session.rollback()
                    pytest.fail("invalid resource interval was accepted by PostgreSQL")

        try:
            await assert_rejected(
                ResourceUnavailability(
                    id="be22-db-invalid-range",
                    scenario_id="fleet-scale",
                    resource_id="FS-RES-02",
                    start_day=9,
                    end_day=8,
                    kind="maintenance",
                    reason="invalid test row",
                )
            )
            await assert_rejected(
                ResourceUnavailability(
                    id="be22-db-unknown-resource",
                    scenario_id="fleet-scale",
                    resource_id="does-not-exist",
                    start_day=1,
                    end_day=1,
                    kind="unavailable",
                    reason="invalid test row",
                )
            )
            await assert_rejected(
                ResourceUnavailability(
                    id="be22-db-cross-scenario",
                    scenario_id="A-12-base",
                    resource_id="FS-RES-02",
                    start_day=1,
                    end_day=1,
                    kind="maintenance",
                    reason="invalid test row",
                )
            )
        finally:
            await engine.dispose()

    asyncio.run(scenario())
