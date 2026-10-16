from __future__ import annotations

import hashlib
import json
import os
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import UUID

from app.application.errors import ApplicationError
from app.application.schemas import ApiModel
from app.persistence.models import (
    AgentRun,
    AgentRunEvent,
    Alert,
    Booking,
    CargoItem,
    Decision,
    DecisionChange,
    Event,
    EventExtraction,
    IdempotencyKey,
    Job,
    NotificationOutbox,
    Plan,
    PlanEvidence,
    PlanOption,
    ReadinessItem,
    ReadinessSuggestion,
    Resource,
    ScheduleState,
    ToolCall,
    WeatherForecast,
)
from app.streaming.sse import format_sse
from pydantic import Field, field_validator
from scripts.seed_preview import install_fleet_scale, reset_fleet_scale
from seed.fleet_scale import SCENARIO_ID as FLEET_SCENARIO_ID
from seed.fleet_scale import SEED_VERSION as FLEET_SEED_VERSION
from seed.fleet_scale import manifest as fleet_manifest
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

DEMO_SCENARIO_ID = "A-12-base"
SEED_VERSION = "offshore-a12-v1"
SEED_SCHEDULE_VERSION = 1
_SUPPORTED_MODES = frozenset({"live", "recorded", "full"})
_FIXTURE_FILES = {DEMO_SCENARIO_ID: "a12_base.json"}


def _source_only_seed_value(value: str) -> str:
    """Keep source-manifest values distinct from unknown installed state."""

    return f"source:{value};installed:unknown"


class DemoResetRequest(ApiModel):
    scenario_id: str = Field(default=DEMO_SCENARIO_ID, min_length=1, max_length=128)

    @field_validator("scenario_id")
    @classmethod
    def normalize_scenario_id(cls, value: str) -> str:
        return value.strip()


class DemoResetResponse(ApiModel):
    scenario_id: str
    seed_version: str
    seed_checksum: str
    schedule_version: int
    reset_at: datetime


class DemoScenarioResponse(ApiModel):
    scenario_id: str
    name: str
    description: str
    seed_version: str
    seed_checksum: str
    available: bool
    mode: str
    scenario_start_date: str
    reset_allowed: bool


class DemoScenariosResponse(ApiModel):
    scenarios: tuple[DemoScenarioResponse, ...]
    mode: str


class RecordedToolCall(ApiModel):
    tool: str
    summary: str


class RecordedEvent(ApiModel):
    seq: int = Field(ge=1)
    type: str
    timestamp: datetime
    phase: str | None
    public: dict[str, Any]


class RecordedFixture(ApiModel):
    schema_version: str
    prompt_version: str
    model_family: str
    scenario_id: str
    seed_version: str
    model_output: dict[str, Any]
    tool_calls: tuple[RecordedToolCall, ...]
    events: tuple[RecordedEvent, ...]


class DemoService:
    """Scenario-scoped demo reset and deterministic recorded artifacts."""

    def __init__(self, session: AsyncSession | None = None) -> None:
        self._session = session
        self._seed_path = Path(__file__).parents[2] / "seed" / "offshore_a12.sql"

    def mode(self, *, environment: str = "local") -> str:
        configured = os.getenv("MOCK_MODEL_MODE", "live").strip().lower() or "live"
        if configured not in _SUPPORTED_MODES:
            raise ApplicationError(
                500,
                "invalid_mock_model_mode",
                "MOCK_MODEL_MODE must be live, recorded, or full.",
            )
        if environment == "production" and configured != "live":
            raise ApplicationError(
                403,
                "demo_mode_disabled",
                "Recorded demo modes are disabled in production.",
            )
        return configured

    def scenarios(self, *, environment: str, demo_scenario_id: str) -> DemoScenariosResponse:
        mode = self.mode(environment=environment)
        scenario = DemoScenarioResponse(
            scenario_id=demo_scenario_id,
            name="A-12 base disruption",
            description="Synthetic offshore vendor-delay scenario for the demo.",
            seed_version=SEED_VERSION,
            seed_checksum=self.seed_checksum(),
            available=demo_scenario_id == DEMO_SCENARIO_ID,
            mode=mode,
            scenario_start_date="2026-10-13",
            reset_allowed=environment != "production",
        )
        scenarios = [scenario]
        if environment in {"local", "preview"}:
            fleet = fleet_manifest()
            scenarios.append(
                DemoScenarioResponse(
                    scenario_id=FLEET_SCENARIO_ID,
                    name="Fleet-scale synthetic source baseline",
                    description=(
                        "Source manifest for the deterministic multi-resource planning "
                        "scenario. This catalog does not assert that an installed database "
                        "matches the source version; use explicit verify or reset to compare "
                        "or restore the named scenario."
                    ),
                    seed_version=_source_only_seed_value(FLEET_SEED_VERSION),
                    seed_checksum=_source_only_seed_value(fleet["checksum"]),
                    available=True,
                    mode=mode,
                    scenario_start_date=fleet["scenario_start_date"],
                    reset_allowed=True,
                )
            )
        return DemoScenariosResponse(scenarios=tuple(scenarios), mode=mode)

    async def reset(
        self,
        scenario_id: str,
        *,
        environment: str,
        demo_scenario_id: str,
        request_scenario_id: str | None = None,
    ) -> DemoResetResponse:
        self.mode(environment=environment)
        if request_scenario_id is not None and request_scenario_id != scenario_id:
            raise ApplicationError(
                400,
                "scenario_context_mismatch",
                "The reset body scenario must match the active scenario context.",
                details={
                    "body_scenario_id": scenario_id,
                    "context_scenario_id": request_scenario_id,
                },
            )
        self._require_demo_scenario(scenario_id, demo_scenario_id, environment)
        if environment == "production":
            raise ApplicationError(
                403,
                "demo_reset_disabled",
                "Demo reset is disabled in production.",
            )
        if self._session is None:
            raise ApplicationError(
                503,
                "database_unavailable",
                "Database access is not configured for this API process.",
                retryable=True,
            )

        if scenario_id == FLEET_SCENARIO_ID:
            async with self._session.begin():
                connection = await self._session.connection()
                await reset_fleet_scale(connection)
                await install_fleet_scale(connection)
                state = await self._session.scalar(
                    select(ScheduleState).where(ScheduleState.scenario_id == scenario_id)
                )
                if state is None:
                    raise ApplicationError(
                        404,
                        "unknown_entity",
                        "The fleet-scale scenario seed could not be restored.",
                        details={"scenario_id": scenario_id},
                    )
                state.version = 1
                state.updated_at = datetime.now(UTC)
                await self._session.flush()
            fleet = fleet_manifest()
            return DemoResetResponse(
                scenario_id=scenario_id,
                seed_version=FLEET_SEED_VERSION,
                seed_checksum=fleet["checksum"],
                schedule_version=1,
                reset_at=datetime.now(UTC),
            )

        async with self._session.begin():
            await self._delete_scenario_graph(scenario_id)
            await self._restore_seed()
            state = await self._session.scalar(
                select(ScheduleState).where(ScheduleState.scenario_id == scenario_id)
            )
            if state is None:
                raise ApplicationError(
                    404,
                    "unknown_entity",
                    "The demo scenario seed could not be restored.",
                    details={"scenario_id": scenario_id},
                )
            state.version = SEED_SCHEDULE_VERSION
            state.updated_at = datetime.now(UTC)
            await self._session.flush()
        return DemoResetResponse(
            scenario_id=scenario_id,
            seed_version=SEED_VERSION,
            seed_checksum=self.seed_checksum(),
            schedule_version=SEED_SCHEDULE_VERSION,
            reset_at=datetime.now(UTC),
        )

    def seed_checksum(self) -> str:
        try:
            return hashlib.sha256(self._seed_path.read_bytes()).hexdigest()
        except OSError as exc:
            raise ApplicationError(
                500,
                "seed_unavailable",
                "The versioned demo seed is not available.",
            ) from exc

    def recorded_fixture(self, scenario_id: str) -> RecordedFixture:
        filename = _FIXTURE_FILES.get(scenario_id)
        if filename is None:
            raise ApplicationError(
                404,
                "unknown_entity",
                "The requested recorded scenario does not exist.",
                details={"scenario_id": scenario_id},
            )
        fixture_path = Path(__file__).parents[1] / "demo" / "recorded_runs" / filename
        try:
            raw = json.loads(fixture_path.read_text(encoding="utf-8"))
            return RecordedFixture.model_validate(raw)
        except (OSError, json.JSONDecodeError, ValueError) as exc:
            raise ApplicationError(
                500,
                "recorded_fixture_invalid",
                "The recorded demo fixture is invalid.",
                details={"scenario_id": scenario_id},
            ) from exc

    async def stream_fixture(
        self, scenario_id: str, run_id: UUID, *, environment: str
    ) -> AsyncIterator[str]:
        if self.mode(environment=environment) != "full":
            raise ApplicationError(
                409,
                "full_fixture_mode_required",
                "Full SSE fixture streaming requires MOCK_MODEL_MODE=full.",
            )
        fixture = self.recorded_fixture(scenario_id)
        for event in fixture.events:
            yield format_sse(
                run_id=run_id,
                sequence=event.seq,
                event_type=event.type,
                timestamp=event.timestamp,
                phase=event.phase,
                public=event.public,
            )

    async def _delete_scenario_graph(self, scenario_id: str) -> None:
        assert self._session is not None
        event_ids = tuple(
            await self._session.scalars(select(Event.id).where(Event.scenario_id == scenario_id))
        )
        plan_ids = tuple(
            await self._session.scalars(
                select(Plan.id).where(Plan.event_id.in_(event_ids))
            )
        )
        run_ids = tuple(
            await self._session.scalars(
                select(AgentRun.id).where(AgentRun.event_id.in_(event_ids))
            )
        )
        decision_ids = tuple(
            await self._session.scalars(
                select(Decision.id).where(Decision.plan_id.in_(plan_ids))
            )
        )
        route_scopes = [f"events/{event_id}/runs" for event_id in event_ids]
        for plan_id in plan_ids:
            route_scopes.extend(
                f"plans/{plan_id}/{action}" for action in ("approve", "reject", "reply")
            )
        if route_scopes:
            await self._session.execute(
                delete(IdempotencyKey).where(IdempotencyKey.route_scope.in_(route_scopes))
            )

        await self._session.execute(delete(Alert).where(Alert.scenario_id == scenario_id))
        if decision_ids:
            await self._session.execute(
                delete(NotificationOutbox).where(
                    NotificationOutbox.decision_id.in_(decision_ids)
                )
            )
            await self._session.execute(
                delete(DecisionChange).where(DecisionChange.decision_id.in_(decision_ids))
            )
        if plan_ids:
            await self._session.execute(
                delete(PlanEvidence).where(PlanEvidence.plan_id.in_(plan_ids))
            )
            await self._session.execute(
                delete(PlanOption).where(PlanOption.plan_id.in_(plan_ids))
            )
        if run_ids:
            await self._session.execute(delete(ToolCall).where(ToolCall.run_id.in_(run_ids)))
            await self._session.execute(
                delete(AgentRunEvent).where(AgentRunEvent.run_id.in_(run_ids))
            )
        if decision_ids:
            await self._session.execute(delete(Decision).where(Decision.id.in_(decision_ids)))
        if plan_ids:
            await self._session.execute(delete(Plan).where(Plan.id.in_(plan_ids)))
        if event_ids:
            await self._session.execute(
                delete(EventExtraction).where(EventExtraction.event_id.in_(event_ids))
            )
            await self._session.execute(
                delete(ReadinessSuggestion).where(ReadinessSuggestion.event_id.in_(event_ids))
            )
        if run_ids:
            await self._session.execute(delete(AgentRun).where(AgentRun.id.in_(run_ids)))
        if event_ids:
            await self._session.execute(delete(Event).where(Event.id.in_(event_ids)))

        await self._session.execute(delete(CargoItem).where(CargoItem.scenario_id == scenario_id))
        await self._session.execute(delete(Booking).where(Booking.scenario_id == scenario_id))
        await self._session.execute(
            delete(ReadinessItem).where(ReadinessItem.scenario_id == scenario_id)
        )
        await self._session.execute(delete(Job).where(Job.scenario_id == scenario_id))
        await self._session.execute(delete(Resource).where(Resource.scenario_id == scenario_id))
        await self._session.execute(
            delete(WeatherForecast).where(WeatherForecast.scenario_id == scenario_id)
        )

    async def _restore_seed(self) -> None:
        assert self._session is not None
        try:
            source = self._seed_path.read_text(encoding="utf-8")
        except OSError as exc:
            raise ApplicationError(
                500,
                "seed_unavailable",
                "The versioned demo seed is not available.",
            ) from exc
        lines = [
            line
            for line in source.splitlines()
            if not line.strip().startswith("--")
            and line.strip().upper() not in {"BEGIN;", "COMMIT;"}
        ]
        for statement in "\n".join(lines).split(";"):
            sql = statement.strip()
            if sql:
                await self._session.execute(text(sql))

    @staticmethod
    def _require_demo_scenario(
        scenario_id: str,
        demo_scenario_id: str,
        environment: str,
    ) -> None:
        if scenario_id == FLEET_SCENARIO_ID and environment in {"local", "preview"}:
            return
        if scenario_id != demo_scenario_id or scenario_id != DEMO_SCENARIO_ID:
            raise ApplicationError(
                403,
                "demo_scenario_required",
                "Reset is limited to the configured demo scenario.",
                details={"scenario_id": scenario_id},
            )


__all__ = [
    "DEMO_SCENARIO_ID",
    "DemoResetRequest",
    "DemoResetResponse",
    "DemoScenarioResponse",
    "DemoScenariosResponse",
    "DemoService",
    "RecordedEvent",
    "RecordedFixture",
]
