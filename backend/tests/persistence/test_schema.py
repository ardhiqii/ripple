import asyncio
from pathlib import Path
from unittest.mock import AsyncMock, Mock

import pytest
from alembic import command
from alembic.config import Config
from app.persistence.database import normalize_database_url
from app.persistence.models import Base, ScheduleState
from app.persistence.uow import SqlAlchemyUnitOfWork
from sqlalchemy.ext.asyncio import AsyncSession

EXPECTED_TABLES = {
    "schedule_state",
    "jobs",
    "resources",
    "resource_unavailability",
    "bookings",
    "readiness_items",
    "cargo_items",
    "weather_forecast",
    "events",
    "event_extractions",
    "agent_runs",
    "agent_run_events",
    "tool_calls",
    "plans",
    "plan_options",
    "plan_evidence",
    "decisions",
    "decision_changes",
    "readiness_suggestions",
    "alerts",
    "notification_outbox",
    "idempotency_keys",
}


def test_initial_metadata_contains_the_full_persistence_baseline() -> None:
    assert set(Base.metadata.tables) == EXPECTED_TABLES


def test_required_unique_constraints_and_indexes_are_declared() -> None:
    resources = Base.metadata.tables["resources"]
    weather = Base.metadata.tables["weather_forecast"]
    idempotency = Base.metadata.tables["idempotency_keys"]
    plan_evidence = Base.metadata.tables["plan_evidence"]
    jobs = Base.metadata.tables["jobs"]

    assert {constraint.name for constraint in resources.constraints} >= {
        "uq_resources_scenario_name",
        "uq_resources_id_scenario",
    }
    assert [column.name for column in weather.primary_key.columns] == [
        "scenario_id",
        "location",
        "day",
    ]
    assert {constraint.name for constraint in idempotency.constraints} >= {
        "uq_idempotency_actor_route_key"
    }
    assert [column.name for column in plan_evidence.primary_key.columns] == [
        "plan_id",
        "claim_id",
    ]
    assert {index.name for index in jobs.indexes} >= {
        "ix_jobs_scenario_start_day",
        "ix_jobs_scenario_status",
        "ix_jobs_locked",
    }


def test_schedule_state_is_scenario_keyed_with_a_generated_surrogate_id() -> None:
    schedule_state = Base.metadata.tables["schedule_state"]
    bookings = Base.metadata.tables["bookings"]

    schedule_checks = {constraint.name for constraint in schedule_state.constraints}
    booking_checks = {constraint.name for constraint in bookings.constraints}

    assert "ck_schedule_state_singleton_id" not in schedule_checks
    assert [column.name for column in schedule_state.primary_key.columns] == ["id"]
    assert schedule_state.columns.scenario_id.unique is True
    assert schedule_state.columns.id.default is not None
    assert "schedule_state_id_seq" in str(schedule_state.columns.id.default)
    assert ScheduleState.__table__.columns.id.autoincrement is True
    assert "ck_bookings_day_range" in booking_checks
    assert "ck_bookings_one_owner" in booking_checks

    unavailability = Base.metadata.tables["resource_unavailability"]
    assert {constraint.name for constraint in unavailability.constraints} >= {
        "ck_resource_unavailability_day_range",
        "ck_resource_unavailability_kind",
        "fk_resource_unavailability_resource_scenario",
    }
    assert {index.name for index in unavailability.indexes} >= {
        "ix_resource_unavailability_scenario_range",
        "ix_resource_unavailability_resource_range",
    }


def test_database_url_normalization() -> None:
    assert normalize_database_url("postgresql://user:pass@localhost/db") == (
        "postgresql+asyncpg://user:pass@localhost/db"
    )
    assert normalize_database_url("postgres://user:pass@localhost/db") == (
        "postgresql+asyncpg://user:pass@localhost/db"
    )
    assert normalize_database_url("postgresql+asyncpg://user:pass@localhost/db") == (
        "postgresql+asyncpg://user:pass@localhost/db"
    )
    assert normalize_database_url(
        "postgresql://user:pass@pooler.supabase.com:5432/postgres?sslmode=require"
    ) == (
        "postgresql+asyncpg://user:pass@pooler.supabase.com:5432/postgres?ssl=require"
    )


def test_unit_of_work_commits_and_closes_on_success() -> None:
    async def scenario() -> None:
        session = AsyncMock(spec=AsyncSession)
        factory = Mock(return_value=session)

        async with SqlAlchemyUnitOfWork(factory) as unit_of_work:
            assert unit_of_work.session is session

        session.begin.assert_called_once()
        session.commit.assert_awaited_once()
        session.rollback.assert_not_awaited()
        session.close.assert_awaited_once()

    asyncio.run(scenario())


def test_unit_of_work_rolls_back_and_closes_on_error() -> None:
    async def scenario() -> None:
        session = AsyncMock(spec=AsyncSession)
        factory = Mock(return_value=session)

        with pytest.raises(RuntimeError, match="rollback me"):
            async with SqlAlchemyUnitOfWork(factory):
                raise RuntimeError("rollback me")

        session.begin.assert_called_once()
        session.commit.assert_not_awaited()
        session.rollback.assert_awaited_once()
        session.close.assert_awaited_once()

    asyncio.run(scenario())


def test_initial_migration_renders_all_tables_and_indexes(
    capsys: pytest.CaptureFixture[str],
) -> None:
    config = Config(str(Path(__file__).parents[2] / "alembic.ini"))

    command.upgrade(config, "head", sql=True)
    sql = capsys.readouterr().out

    assert "CREATE TABLE jobs" in sql
    assert "CREATE TABLE idempotency_keys" in sql
    assert "CREATE INDEX ix_jobs_scenario_start_day" in sql
    assert "CONSTRAINT uq_resources_scenario_name UNIQUE" in sql
    assert "CREATE TABLE resource_unavailability" in sql
    assert "CONSTRAINT fk_resource_unavailability_resource_scenario" in sql
    assert "INSERT INTO alembic_version" in sql


def test_scenario_state_migration_renders_safe_sequence_and_rollback_guard(
    capsys: pytest.CaptureFixture[str],
) -> None:
    config = Config(str(Path(__file__).parents[2] / "alembic.ini"))

    command.upgrade(config, "head", sql=True)
    sql = capsys.readouterr().out

    assert "CREATE SEQUENCE schedule_state_id_seq" in sql
    assert "DROP CONSTRAINT ck_schedule_state_singleton_id" in sql
    assert "OWNED BY schedule_state.id" in sql

    command.downgrade(
        config,
        "0002_scenario_schedule_state:0001_initial_schema",
        sql=True,
    )
    rollback_sql = capsys.readouterr().out
    assert "cannot downgrade schedule_state: multiple scenarios exist" in rollback_sql
    assert "cannot downgrade schedule_state: generated scenario row is not id=1" in rollback_sql
