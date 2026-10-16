import asyncio
import hashlib
import os
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace
from typing import cast

import pytest
from app.domain.policy import OFFSHORE_PACK
from app.engine.readiness import earliest_feasible_start
from app.engine.simulate import simulate
from app.persistence.database import create_async_engine, create_session_factory
from app.persistence.models import Booking as BookingRow
from app.persistence.models import ReadinessItem as ReadinessItemRow
from app.persistence.repositories import (
    DecisionRepository,
    ReadinessRepository,
    ScheduleRepository,
    to_booking,
    to_readiness_item,
)
from app.security.input_boundary import decode_cursor, encode_cursor

SEED_PATH = Path(__file__).parents[2] / "seed" / "offshore_a12.sql"
EXPECTED_SEED_SHA256 = "ad6cfef833c4291eea135ad92786c34b6e6ca1d5bfefda45150506f04b58687b"


def test_offshore_seed_checksum_is_stable() -> None:
    digest = hashlib.sha256(SEED_PATH.read_bytes()).hexdigest()
    assert digest == EXPECTED_SEED_SHA256


def test_repository_mapping_reconstructs_engine_owner_and_confidence() -> None:
    booking = to_booking(
        cast(
            BookingRow,
            SimpleNamespace(
                id="cargo-D-07-drums",
                scenario_id="A-12-base",
                resource_id="SB-1",
                start_day=5,
                end_day=5,
                load="15",
                status="planned",
                job_id=None,
                activity_id="D-07-drums",
                row_version=1,
            ),
        )
    )
    readiness = to_readiness_item(
        cast(
            ReadinessItemRow,
            SimpleNamespace(
                id="A-12-function-test",
                scenario_id="A-12-base",
                job_id="A-12",
                stage="function_test",
                step_order=1,
                lead_time_days=1,
                planned_day=4,
                eta_earliest_day=4,
                eta_latest_day=4,
                confidence="0.90",
                status="pending",
                source_type="vendor_email",
                source_reference="vendor email 9 Oct",
                not_before_day=None,
                risk_buffer_days=0,
                last_updated_at=None,
                row_version=1,
            ),
        )
    )

    assert booking.cargo_id == "D-07-drums"
    assert booking.job_id is None
    assert readiness.confidence.value == "high"


def test_real_postgres_repository_snapshot_preserves_scenario_boundary() -> None:
    database_url = os.getenv("RIPPLE_DATABASE_URL")
    if not database_url:
        pytest.skip("set RIPPLE_DATABASE_URL after applying migration and seed")

    async def scenario() -> None:
        engine = create_async_engine(database_url)
        factory = create_session_factory(engine)
        async with factory() as session:
            repository = ScheduleRepository(session)
            snapshot = await repository.load_snapshot("A-12-base")
            assert snapshot.schedule_version == 1
            assert {job.id for job in snapshot.jobs} == {"A-12", "B-05", "C-03", "D-07", "E-02"}
            assert len(snapshot.resources) == 2
            assert len(snapshot.bookings) == 8
            assert len(snapshot.readiness_items) == 12
            assert len(snapshot.forecast) == 15
            readiness_repository = ReadinessRepository(session)
            assert len(await readiness_repository.list_for_scenario("A-12-base", "A-12")) == 4
            assert (
                await readiness_repository.get("A-12-function-test", "not-a-seeded-scenario")
                is None
            )
            a12 = next(job for job in snapshot.jobs if job.id == "A-12")
            a12_items = tuple(item for item in snapshot.readiness_items if item.job_id == "A-12")
            assert (
                earliest_feasible_start(
                    a12,
                    a12_items,
                    OFFSHORE_PACK,
                    as_of=datetime(2026, 10, 13, 12, tzinfo=UTC),
                )
                == 7
            )
            simulation = simulate(snapshot, [], OFFSHORE_PACK)
            assert simulation.feasible
            assert simulation.violations == ()
            assert await repository.get_schedule_version("not-a-seeded-scenario") is None
            with pytest.raises(LookupError, match="unknown scenario"):
                await repository.load_snapshot("not-a-seeded-scenario")
        await engine.dispose()

    asyncio.run(scenario())


@pytest.mark.skipif(
    not os.getenv("RIPPLE_DATABASE_URL"),
    reason="set RIPPLE_DATABASE_URL after applying migration and seed",
)
def test_decision_repository_cursor_is_descending_and_scenario_scoped() -> None:
    database_url = os.environ["RIPPLE_DATABASE_URL"]

    async def scenario() -> None:
        engine = create_async_engine(database_url)
        factory = create_session_factory(engine)
        async with factory() as session:
            repository = DecisionRepository(session)
            first_page = await repository.list_for_scenario("fleet-scale", limit=2)
            assert len(first_page) == 2
            assert list(first_page) == sorted(
                first_page,
                key=lambda row: (row.created_at, row.id),
                reverse=True,
            )

            cursor = encode_cursor(first_page[-1].created_at, first_page[-1].id)
            after_created_at, after_id = decode_cursor(cursor)
            second_page = await repository.list_for_scenario(
                "fleet-scale",
                after_created_at=after_created_at,
                after_id=after_id,
                limit=2,
            )
            repeated_second_page = await repository.list_for_scenario(
                "fleet-scale",
                after_created_at=after_created_at,
                after_id=after_id,
                limit=2,
            )

            assert cursor
            assert {row.id for row in first_page}.isdisjoint(row.id for row in second_page)
            assert [row.id for row in second_page] == [
                row.id for row in repeated_second_page
            ]
            assert all(
                (row.created_at, row.id)
                < (first_page[-1].created_at, first_page[-1].id)
                for row in second_page
            )
            assert await repository.list_for_scenario("not-a-seeded-scenario", limit=2) == ()
        await engine.dispose()

    asyncio.run(scenario())
