from collections import defaultdict
from datetime import UTC, datetime, timedelta

from app.application.errors import ApplicationError
from app.application.schemas import (
    LeverResponse,
    PolicyDataHealthResponse,
    PolicyLeversResponse,
    PolicyProfilesResponse,
    SourceHealthResponse,
    WeightProfileResponse,
)
from app.domain.policy import DomainPack
from app.persistence.repositories import ReadinessRepository, ScheduleRepository
from sqlalchemy.ext.asyncio import AsyncSession


class PolicyService:
    def __init__(self, session: AsyncSession | None, pack: DomainPack) -> None:
        self._session = session
        self._pack = pack

    def levers(self) -> PolicyLeversResponse:
        return PolicyLeversResponse(
            levers=tuple(
                LeverResponse(
                    name=lever.name,
                    allowed=lever.allowed,
                    approval=lever.approval.value if lever.approval else None,
                    cost_weight=lever.cost_weight,
                )
                for lever in sorted(
                    self._pack.action_registry.levers.values(), key=lambda x: x.name
                )
            )
        )

    def profiles(self) -> PolicyProfilesResponse:
        return PolicyProfilesResponse(
            default_profile=self._pack.default_weight_profile,
            profiles=tuple(
                WeightProfileResponse(
                    name=profile.name,
                    delay_weight=profile.delay_weight,
                    lever_cost_weight=profile.lever_cost_weight,
                    movement_weight=profile.movement_weight,
                    risk_weight=profile.risk_weight,
                )
                for profile in sorted(self._pack.weight_profiles.values(), key=lambda x: x.name)
            ),
        )

    async def data_health(self, scenario_id: str) -> PolicyDataHealthResponse:
        as_of = datetime.now(UTC)
        if self._session is None:
            raise RuntimeError("data health requires a database session")
        if await ScheduleRepository(self._session).get_schedule_version(scenario_id) is None:
            raise ApplicationError(
                404,
                "unknown_entity",
                "The requested scenario does not exist.",
                details={"scenario_id": scenario_id},
            )
        items = await ReadinessRepository(self._session).list_for_scenario(scenario_id)
        by_source: dict[str, list] = defaultdict(list)
        for item in items:
            by_source[item.source_type].append(item)
        sources: list[SourceHealthResponse] = []
        for source_type, source_items in sorted(by_source.items()):
            timestamps = [item.last_updated for item in source_items if item.last_updated]
            latest = max(timestamps) if timestamps else None
            stale_count = sum(
                1
                for item in source_items
                if item.last_updated is None
                or as_of - item.last_updated.astimezone(UTC)
                > timedelta(hours=self._pack.stale_after_hours)
            )
            status = "unknown" if latest is None else "stale" if stale_count else "fresh"
            sources.append(
                SourceHealthResponse(
                    source_type=source_type,
                    item_count=len(source_items),
                    latest_updated_at=latest,
                    stale_count=stale_count,
                    status=status,
                )
            )
        return PolicyDataHealthResponse(
            as_of=as_of,
            stale_after_hours=self._pack.stale_after_hours,
            sources=tuple(sources),
        )
