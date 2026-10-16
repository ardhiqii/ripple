from collections import defaultdict
from collections.abc import Mapping
from dataclasses import dataclass, replace
from decimal import Decimal
from enum import StrEnum

from app.domain.jobs import Job
from app.domain.policy import DomainPack
from app.domain.readiness import ReadinessItem
from app.domain.resources import Booking, Resource, ResourceUnavailability
from app.engine.capacity import CapacityReport, calculate_all_capacity
from app.engine.weather import WeatherObservation, WeatherStatus, check_booking_weather


class ChangeKind(StrEnum):
    MOVE_JOB = "move_job"
    SET_ITEM_DATE = "set_item_date"
    ASSIGN_CARGO = "assign_cargo"
    MOVE_CARGO = "move_cargo"


@dataclass(frozen=True, slots=True)
class Change:
    kind: ChangeKind
    target: str
    value: int | str


@dataclass(frozen=True, slots=True)
class ScheduleSnapshot:
    scenario_id: str
    jobs: tuple[Job, ...]
    resources: tuple[Resource, ...]
    bookings: tuple[Booking, ...]
    readiness_items: tuple[ReadinessItem, ...] = ()
    forecast: tuple[WeatherObservation, ...] = ()
    schedule_version: int = 0
    unavailability: tuple[ResourceUnavailability, ...] = ()


class ViolationKind(StrEnum):
    UNKNOWN_TARGET = "unknown_target"
    INVALID_CHANGE = "invalid_change"
    LOCKED_JOB_MOVE = "locked_job_move"
    RESOURCE_OVERLAP = "resource_overlap"
    RESOURCE_UNAVAILABLE = "resource_unavailable"
    CAPACITY_OVERFLOW = "capacity_overflow"
    WEATHER_NO_GO = "weather_no_go"
    MISSING_WEATHER = "missing_weather"


@dataclass(frozen=True, slots=True)
class SimulationViolation:
    kind: ViolationKind
    object_id: str
    day: int | None
    evidence: str
    hard: bool = True


@dataclass(frozen=True, slots=True)
class ChangedObject:
    entity_type: str
    entity_id: str
    before: Mapping[str, object]
    after: Mapping[str, object]


@dataclass(frozen=True, slots=True)
class KpiDelta:
    jobs_moved: int
    total_delay_days: int
    shortfall_bopd_days: Decimal
    max_capacity_overflow: Decimal


@dataclass(frozen=True, slots=True)
class SimulationResult:
    snapshot: ScheduleSnapshot
    violations: tuple[SimulationViolation, ...]
    changed_objects: tuple[ChangedObject, ...]
    kpi_delta: KpiDelta
    feasible: bool
    conditional: bool


def _as_day(value: int | str) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    try:
        return int(value)
    except ValueError:
        return None


def _apply_changes(
    snapshot: ScheduleSnapshot,
    changes: tuple[Change, ...],
) -> tuple[ScheduleSnapshot, list[SimulationViolation]]:
    jobs = list(snapshot.jobs)
    bookings = list(snapshot.bookings)
    readiness_items = list(snapshot.readiness_items)
    violations: list[SimulationViolation] = []

    for change in changes:
        if change.kind is ChangeKind.MOVE_JOB:
            new_start = _as_day(change.value)
            job_index = next(
                (index for index, job in enumerate(jobs) if job.id == change.target),
                None,
            )
            if new_start is None or job_index is None:
                violations.append(
                    SimulationViolation(
                        (
                            ViolationKind.INVALID_CHANGE
                            if new_start is None
                            else ViolationKind.UNKNOWN_TARGET
                        ),
                        change.target,
                        None,
                        "move_job requires an integer start day and an existing job",
                    )
                )
                continue
            job = jobs[job_index]
            delta = new_start - job.start_day
            jobs[job_index] = replace(job, start_day=new_start)
            if job.locked and delta != 0:
                violations.append(
                    SimulationViolation(
                        ViolationKind.LOCKED_JOB_MOVE,
                        job.id,
                        new_start,
                        job.lock_reason or "locked job cannot move",
                    )
                )
            if delta:
                for index, booking in enumerate(bookings):
                    if booking.job_id == job.id:
                        bookings[index] = replace(
                            booking,
                            start_day=booking.start_day + delta,
                            end_day=booking.end_day + delta,
                        )
        elif change.kind is ChangeKind.SET_ITEM_DATE:
            new_day = _as_day(change.value)
            item_index = next(
                (index for index, item in enumerate(readiness_items) if item.id == change.target),
                None,
            )
            if new_day is None or item_index is None:
                violations.append(
                    SimulationViolation(
                        (
                            ViolationKind.INVALID_CHANGE
                            if new_day is None
                            else ViolationKind.UNKNOWN_TARGET
                        ),
                        change.target,
                        None,
                        "set_item_date requires an integer day and an existing readiness item",
                    )
                )
                continue
            readiness_items[item_index] = replace(readiness_items[item_index], planned_day=new_day)
        elif change.kind is ChangeKind.ASSIGN_CARGO:
            if not isinstance(change.value, str) or not change.value.strip():
                violations.append(
                    SimulationViolation(
                        ViolationKind.INVALID_CHANGE,
                        change.target,
                        None,
                        "assign_cargo requires a resource id",
                    )
                )
                continue
            booking_index = next(
                (
                    index
                    for index, booking in enumerate(bookings)
                    if booking.id == change.target or booking.cargo_id == change.target
                ),
                None,
            )
            resource_exists = any(resource.id == change.value for resource in snapshot.resources)
            if booking_index is None or not resource_exists:
                violations.append(
                    SimulationViolation(
                        ViolationKind.UNKNOWN_TARGET,
                        change.target,
                        None,
                        "assign_cargo requires an existing cargo booking and resource",
                    )
                )
                continue
            bookings[booking_index] = replace(bookings[booking_index], resource_id=change.value)
        elif change.kind is ChangeKind.MOVE_CARGO:
            new_day = _as_day(change.value)
            booking_index = next(
                (
                    index
                    for index, booking in enumerate(bookings)
                    if booking.cargo_id == change.target or booking.id == change.target
                ),
                None,
            )
            if new_day is None:
                violations.append(
                    SimulationViolation(
                        ViolationKind.INVALID_CHANGE,
                        change.target,
                        None,
                        "move_cargo requires an integer day and an existing cargo booking",
                    )
                )
                continue
            if booking_index is None:
                violations.append(
                    SimulationViolation(
                        ViolationKind.UNKNOWN_TARGET,
                        change.target,
                        None,
                        "move_cargo requires an integer day and an existing cargo booking",
                    )
                )
                continue
            booking = bookings[booking_index]
            if booking.cargo_id is None:
                violations.append(
                    SimulationViolation(
                        ViolationKind.UNKNOWN_TARGET,
                        change.target,
                        None,
                        "move_cargo requires an integer day and an existing cargo booking",
                    )
                )
                continue
            bookings[booking_index] = replace(booking, start_day=new_day, end_day=new_day)

    return (
        ScheduleSnapshot(
            scenario_id=snapshot.scenario_id,
            jobs=tuple(jobs),
            resources=snapshot.resources,
            bookings=tuple(bookings),
            readiness_items=tuple(readiness_items),
            forecast=snapshot.forecast,
            schedule_version=snapshot.schedule_version,
            unavailability=snapshot.unavailability,
        ),
        violations,
    )


def _job_map(snapshot: ScheduleSnapshot) -> dict[str, Job]:
    return {job.id: job for job in snapshot.jobs}


def _resource_map(snapshot: ScheduleSnapshot) -> dict[str, Resource]:
    return {resource.id: resource for resource in snapshot.resources}


def _group_unavailability(
    intervals: tuple[ResourceUnavailability, ...],
) -> dict[str, list[ResourceUnavailability]]:
    grouped: dict[str, list[ResourceUnavailability]] = defaultdict(list)
    for interval in intervals:
        grouped[interval.resource_id].append(interval)
    return grouped


def _changed_objects(
    before: ScheduleSnapshot,
    after: ScheduleSnapshot,
) -> tuple[ChangedObject, ...]:
    changed: list[ChangedObject] = []
    before_jobs = _job_map(before)
    after_jobs = _job_map(after)
    for job_id in sorted(set(before_jobs) | set(after_jobs)):
        old = before_jobs.get(job_id)
        new = after_jobs.get(job_id)
        if old != new:
            changed.append(
                ChangedObject(
                    "job",
                    job_id,
                    {"start_day": old.start_day if old else None},
                    {"start_day": new.start_day if new else None},
                )
            )
    before_bookings = {booking.id: booking for booking in before.bookings}
    after_bookings = {booking.id: booking for booking in after.bookings}
    for booking_id in sorted(set(before_bookings) | set(after_bookings)):
        old = before_bookings.get(booking_id)
        new = after_bookings.get(booking_id)
        if old != new:
            changed.append(
                ChangedObject(
                    "booking",
                    booking_id,
                    {
                        "resource_id": old.resource_id if old else None,
                        "start_day": old.start_day if old else None,
                        "end_day": old.end_day if old else None,
                    },
                    {
                        "resource_id": new.resource_id if new else None,
                        "start_day": new.start_day if new else None,
                        "end_day": new.end_day if new else None,
                    },
                )
            )
    before_items = {item.id: item for item in before.readiness_items}
    after_items = {item.id: item for item in after.readiness_items}
    for item_id in sorted(set(before_items) | set(after_items)):
        old = before_items.get(item_id)
        new = after_items.get(item_id)
        if old != new:
            changed.append(
                ChangedObject(
                    "readiness_item",
                    item_id,
                    {"planned_day": old.planned_day if old else None},
                    {"planned_day": new.planned_day if new else None},
                )
            )
    return tuple(changed)


def _kpi_delta(
    before: ScheduleSnapshot,
    after: ScheduleSnapshot,
    capacity_reports: tuple[CapacityReport, ...],
) -> KpiDelta:
    before_jobs = _job_map(before)
    moved_jobs = 0
    total_delay = 0
    shortfall_days = Decimal("0")
    for job in after.jobs:
        old = before_jobs.get(job.id)
        if old is None or old.start_day == job.start_day:
            continue
        moved_jobs += 1
        delay = job.start_day - old.start_day
        total_delay += delay
        shortfall_days += job.shortfall_bopd * delay
    return KpiDelta(
        jobs_moved=moved_jobs,
        total_delay_days=total_delay,
        shortfall_bopd_days=shortfall_days,
        max_capacity_overflow=max(
            (report.max_overflow for report in capacity_reports),
            default=Decimal("0"),
        ),
    )


def simulate(
    snapshot: ScheduleSnapshot,
    changes: tuple[Change, ...] | list[Change],
    pack: DomainPack,
) -> SimulationResult:
    """Apply proposed changes to a copy and return deterministic findings."""

    candidate, violations = _apply_changes(snapshot, tuple(changes))
    resource_map = _resource_map(candidate)
    capacity_reports = calculate_all_capacity(
        candidate.resources,
        candidate.bookings,
        candidate.unavailability,
    )
    unavailable_by_resource: dict[str, tuple[ResourceUnavailability, ...]] = {
        resource_id: tuple(intervals)
        for resource_id, intervals in _group_unavailability(candidate.unavailability).items()
    }
    for booking in candidate.bookings:
        if booking.status.value == "cancelled":
            continue
        for interval in unavailable_by_resource.get(booking.resource_id, ()):
            if booking.start_day > interval.end_day or booking.end_day < interval.start_day:
                continue
            overlap_start = max(booking.start_day, interval.start_day)
            overlap_end = min(booking.end_day, interval.end_day)
            violations.append(
                SimulationViolation(
                    ViolationKind.RESOURCE_UNAVAILABLE,
                    booking.id,
                    overlap_start,
                    (
                        f"booking {booking.id} overlaps {interval.kind} interval {interval.id} "
                        f"on D+{overlap_start}–D+{overlap_end}: {interval.reason}"
                    ),
                )
            )
    for report in capacity_reports:
        for point in report.points:
            if point.capacity == 0:
                continue
            if point.overflow <= 0:
                continue
            kind = (
                ViolationKind.RESOURCE_OVERLAP
                if report.unit == "job"
                else ViolationKind.CAPACITY_OVERFLOW
            )
            violations.append(
                SimulationViolation(
                    kind,
                    report.resource_id,
                    point.day,
                    (
                        f"used {point.used} {report.unit}, capacity {point.capacity}; "
                        f"bookings {point.booking_ids}"
                    ),
                )
            )

    for booking in candidate.bookings:
        resource = resource_map.get(booking.resource_id)
        if resource is None:
            violations.append(
                SimulationViolation(
                    ViolationKind.UNKNOWN_TARGET,
                    booking.resource_id,
                    None,
                    f"booking {booking.id} references an unknown resource",
                )
            )
            continue
        for finding in check_booking_weather(booking, resource, candidate.forecast, pack):
            if finding.status is WeatherStatus.NO_GO:
                violations.append(
                    SimulationViolation(
                        ViolationKind.WEATHER_NO_GO,
                        booking.id,
                        finding.day,
                        finding.evidence,
                    )
                )
            elif finding.status is WeatherStatus.INSUFFICIENT_DATA:
                violations.append(
                    SimulationViolation(
                        ViolationKind.MISSING_WEATHER,
                        booking.id,
                        finding.day,
                        finding.evidence,
                        hard=False,
                    )
                )

    changed_objects = _changed_objects(snapshot, candidate)
    kpi_delta = _kpi_delta(snapshot, candidate, capacity_reports)
    hard_violations = tuple(violation for violation in violations if violation.hard)
    return SimulationResult(
        snapshot=candidate,
        violations=tuple(violations),
        changed_objects=changed_objects,
        kpi_delta=kpi_delta,
        feasible=not hard_violations,
        conditional=any(not violation.hard for violation in violations),
    )
