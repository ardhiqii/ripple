from collections.abc import Sequence
from decimal import Decimal
from typing import Any, Literal, cast
from uuid import UUID

from app.application.errors import ApplicationError
from app.application.schemas import (
    BookingResponse,
    CapacityPointResponse,
    CapacityResponse,
    ChangedObjectResponse,
    JobResponse,
    ResourceResponse,
    ScheduleChangesResponse,
    ScheduleResponse,
    UnavailabilityResponse,
    WeatherResponse,
)
from app.domain.policy import DomainPack
from app.engine.capacity import calculate_all_capacity
from app.persistence.repositories import DecisionRepository, ScheduleRepository
from sqlalchemy.ext.asyncio import AsyncSession


def _resource_location(resource: Any) -> str:
    configured = resource.metadata.get("location")
    return configured if isinstance(configured, str) and configured else resource.name


class ScheduleService:
    def __init__(self, session: AsyncSession, pack: DomainPack) -> None:
        self._session = session
        self._pack = pack

    async def get_schedule(
        self,
        scenario_id: str,
        *,
        from_day: int | None,
        to_day: int | None,
        groups: Sequence[str] | None,
    ) -> ScheduleResponse:
        if from_day is not None and to_day is not None and from_day > to_day:
            raise ApplicationError(
                422,
                "validation_error",
                "The schedule range start must be on or before its end.",
                details={"from": from_day, "to": to_day},
            )
        schedule_repository = ScheduleRepository(self._session)
        try:
            snapshot = await schedule_repository.load_snapshot(scenario_id)
        except LookupError as exc:
            raise ApplicationError(
                404,
                "unknown_entity",
                "The requested scenario does not exist.",
                details={"scenario_id": scenario_id},
            ) from exc
        group_values = {value.strip().lower() for value in (groups or ()) if value.strip()}
        resources = tuple(
            resource
            for resource in snapshot.resources
            if not group_values
            or resource.type.value.lower() in group_values
            or resource.unit.lower() in group_values
        )
        resource_ids = {resource.id for resource in resources}
        unavailability = await schedule_repository.list_unavailability(
            scenario_id,
            resource_ids=resource_ids,
            from_day=from_day,
            to_day=to_day,
        )

        def in_range(start: int, end: int) -> bool:
            return (from_day is None or end >= from_day) and (
                to_day is None or start <= to_day
            )

        bookings = tuple(
            booking
            for booking in snapshot.bookings
            if booking.resource_id in resource_ids and in_range(booking.start_day, booking.end_day)
        )
        jobs = tuple(
            job
            for job in snapshot.jobs
            if in_range(job.start_day, job.start_day + job.duration_days - 1)
            and (
                not group_values
                or any(
                    booking.job_id == job.id and booking.resource_id in resource_ids
                    for booking in snapshot.bookings
                )
            )
        )
        locations = {_resource_location(resource) for resource in resources}
        weather = tuple(
            observation
            for observation in snapshot.forecast
            if observation.location in locations and in_range(observation.day, observation.day)
        )
        reports = calculate_all_capacity(
            resources,
            snapshot.bookings,
            snapshot.unavailability,
            from_day=from_day,
            to_day=to_day,
        )

        return ScheduleResponse(
            scenario_id=snapshot.scenario_id,
            from_day=from_day,
            to_day=to_day,
            version=snapshot.schedule_version,
            jobs=tuple(
                JobResponse(
                    id=job.id,
                    site=job.site,
                    job_type=job.job_type,
                    start_day=job.start_day,
                    duration_days=job.duration_days,
                    shortfall_bopd=job.shortfall_bopd,
                    locked=job.locked,
                    lock_reason=job.lock_reason,
                    status=job.status,
                    row_version=job.row_version,
                )
                for job in jobs
            ),
            resources=tuple(
                ResourceResponse(
                    id=resource.id,
                    type=resource.type,
                    name=resource.name,
                    capacity=resource.capacity,
                    unit=resource.unit,
                    active=resource.active,
                    metadata=dict(resource.metadata),
                )
                for resource in resources
            ),
            bookings=tuple(
                BookingResponse(
                    id=booking.id,
                    resource_id=booking.resource_id,
                    start_day=booking.start_day,
                    end_day=booking.end_day,
                    load=booking.load,
                    status=booking.status,
                    job_id=booking.job_id,
                    cargo_id=booking.cargo_id,
                    row_version=booking.row_version,
                )
                for booking in bookings
            ),
            unavailability=tuple(
                UnavailabilityResponse(
                    id=interval.id,
                    resource_id=interval.resource_id,
                    start_day=(
                        max(interval.start_day, from_day)
                        if from_day is not None
                        else interval.start_day
                    ),
                    end_day=(
                        min(interval.end_day, to_day)
                        if to_day is not None
                        else interval.end_day
                    ),
                    kind=cast(Literal["maintenance", "unavailable"], interval.kind),
                    reason=interval.reason,
                )
                for interval in unavailability
            ),
            weather=tuple(
                WeatherResponse(
                    location=observation.location,
                    day=observation.day,
                    metric=observation.metric,
                    value=observation.value,
                    go=observation.go,
                    source=observation.source,
                )
                for observation in weather
            ),
            capacity=tuple(self._capacity_response(report, from_day, to_day) for report in reports),
        )

    @staticmethod
    def _capacity_response(
        report: Any, from_day: int | None, to_day: int | None
    ) -> CapacityResponse:
        points = tuple(
            point
            for point in report.points
            if (from_day is None or point.day >= from_day)
            and (to_day is None or point.day <= to_day)
        )
        return CapacityResponse(
            resource_id=report.resource_id,
            unit=report.unit,
            feasible=all(point.overflow <= 0 for point in points),
            max_overflow=max((point.overflow for point in points), default=Decimal("0")),
            points=tuple(
                CapacityPointResponse(
                    resource_id=point.resource_id,
                    day=point.day,
                    used=point.used,
                    capacity=point.capacity,
                    overflow=point.overflow,
                    utilization_percent=point.utilization_percent,
                    booking_ids=point.booking_ids,
                )
                for point in points
            ),
        )

    async def get_changes(
        self, scenario_id: str, decision_id: UUID
    ) -> ScheduleChangesResponse:
        record = await DecisionRepository(self._session).get(decision_id, scenario_id)
        if record is None:
            raise ApplicationError(
                404,
                "unknown_entity",
                "The requested decision does not exist in this scenario.",
                details={"decision_id": str(decision_id)},
            )
        decision = record.decision
        return ScheduleChangesResponse(
            decision_id=decision_id,
            schedule_version_before=decision.schedule_version_before,
            schedule_version_after=decision.schedule_version_after,
            changes=tuple(
                ChangedObjectResponse(
                    entity_type=change.entity_type,
                    entity_id=change.entity_id,
                    change_kind=change.change_kind,
                    before=dict(change.before),
                    after=dict(change.after),
                )
                for change in record.changes
            ),
        )
