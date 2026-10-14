from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from app.domain.changes import RiskEvidence
from app.domain.enums import Confidence
from app.domain.errors import InvalidEntityError
from app.domain.jobs import Job
from app.domain.policy import DomainPack, ReadinessStep
from app.domain.readiness import ReadinessItem
from app.engine.risk import LOW_CONFIDENCE_BUFFER_DAYS, evaluate_risk_tags


@dataclass(frozen=True, slots=True)
class ReadinessResult:
    item_id: str
    job_id: str
    stage: str
    required_by: int
    eta_earliest: int | None
    eta_latest: int | None
    effective_eta: int | None
    risk_buffer_days: int
    confidence: Confidence
    stale: bool
    freshness_hours: float | None
    slack: int | None
    effective_slack: int | None
    feasible_for_target: bool
    earliest_feasible_start: int | None
    plan_on_latest: bool
    vendor_expedite_required: bool
    notes: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class ReadinessReport:
    job_id: str
    target_start: int
    items: tuple[ReadinessResult, ...]
    earliest_feasible_start: int | None
    feasible: bool
    stale: bool
    job_locked_by_risk: bool
    vendor_expedite_required: bool
    blocking_item_ids: tuple[str, ...]
    notes: tuple[str, ...]


def _template_for_job(
    job: Job,
    pack: DomainPack,
    template_name: str | None,
) -> tuple[ReadinessStep, ...]:
    selected_name = template_name or job.job_type
    if selected_name in pack.readiness_templates:
        return pack.readiness_templates[selected_name]
    if len(pack.readiness_templates) == 1:
        return next(iter(pack.readiness_templates.values()))
    raise InvalidEntityError(f"no readiness template configured for job type: {selected_name}")


def _step_position(stage: str, steps: Sequence[ReadinessStep]) -> int:
    for index, step in enumerate(steps):
        if step.name == stage:
            return index
    raise InvalidEntityError(f"readiness stage is not in the configured template: {stage}")


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _stale(
    last_updated: datetime | None,
    as_of: datetime,
    stale_after_hours: int,
) -> tuple[bool, float | None]:
    if last_updated is None:
        return True, None
    age = _as_utc(as_of) - _as_utc(last_updated)
    age_hours = max(age.total_seconds() / 3600, 0)
    return age > timedelta(hours=stale_after_hours), age_hours


def _eta_values(item: ReadinessItem) -> tuple[int | None, int | None]:
    earliest = item.eta_earliest if item.eta_earliest is not None else item.planned_day
    latest = item.eta_latest if item.eta_latest is not None else item.planned_day
    if item.not_before_day is not None:
        if earliest is not None:
            earliest = max(earliest, item.not_before_day)
        if latest is not None:
            latest = max(latest, item.not_before_day)
    return earliest, latest


def _evaluate_item(
    item: ReadinessItem,
    job: Job,
    steps: Sequence[ReadinessStep],
    target_start: int,
    as_of: datetime,
    pack: DomainPack,
    risk_tags: Sequence[RiskEvidence | str],
) -> ReadinessResult:
    position = _step_position(item.stage, steps)
    steps_after = len(steps) - position - 1
    required_by_day = target_start - steps_after
    stale, freshness_hours = _stale(item.last_updated, as_of, pack.stale_after_hours)
    confidence = item.confidence
    if stale:
        confidence = Confidence.LOW
    risk = evaluate_risk_tags(
        confidence,
        risk_tags,
        pack,
        target_ids=frozenset({item.id, job.id}),
    )
    if risk.confidence is Confidence.LOW:
        confidence = Confidence.LOW
    low_confidence_buffer = LOW_CONFIDENCE_BUFFER_DAYS if confidence is Confidence.LOW else 0
    risk_buffer_days = item.risk_buffer_days + risk.risk_buffer_days + low_confidence_buffer
    eta_earliest, eta_latest = _eta_values(item)
    effective_eta = eta_latest + risk_buffer_days if eta_latest is not None else None
    slack = required_by_day - eta_latest if eta_latest is not None else None
    effective_slack = required_by_day - effective_eta if effective_eta is not None else None
    feasible = effective_eta is not None and effective_eta <= required_by_day
    earliest_feasible_start = effective_eta + steps_after if effective_eta is not None else None
    notes = list(risk.notes)
    if stale:
        notes.append("Source is stale; confidence reduced to low")
    if item.last_updated is None:
        notes.append("Source freshness is unknown; confidence reduced to low")
    return ReadinessResult(
        item_id=item.id,
        job_id=item.job_id,
        stage=item.stage,
        required_by=required_by_day,
        eta_earliest=eta_earliest,
        eta_latest=eta_latest,
        effective_eta=effective_eta,
        risk_buffer_days=risk_buffer_days,
        confidence=confidence,
        stale=stale,
        freshness_hours=freshness_hours,
        slack=slack,
        effective_slack=effective_slack,
        feasible_for_target=feasible,
        earliest_feasible_start=earliest_feasible_start,
        plan_on_latest=risk.plan_on_latest,
        vendor_expedite_required=risk.vendor_expedite_required,
        notes=tuple(notes),
    )


def check_readiness(
    job: Job,
    items: Sequence[ReadinessItem],
    pack: DomainPack,
    *,
    target_start: int | None = None,
    as_of: datetime | None = None,
    risk_tags: Sequence[RiskEvidence | str] = (),
    template_name: str | None = None,
) -> ReadinessReport:
    """Evaluate a job's readiness without database, HTTP, or model dependencies."""

    if not items:
        raise InvalidEntityError(f"job has no readiness items: {job.id}")
    if any(item.job_id != job.id for item in items):
        raise InvalidEntityError("all readiness items must belong to the requested job")
    resolved_target = job.start_day if target_start is None else target_start
    resolved_as_of = as_of or datetime.now(UTC)
    steps = _template_for_job(job, pack, template_name)
    results = tuple(
        _evaluate_item(item, job, steps, resolved_target, resolved_as_of, pack, risk_tags)
        for item in items
    )
    ordered_results = tuple(
        sorted(results, key=lambda result: (result.required_by, result.item_id))
    )
    known_starts = [result.earliest_feasible_start for result in ordered_results]
    usable_starts = [value for value in known_starts if value is not None]
    earliest_start = max(usable_starts) if len(usable_starts) == len(known_starts) else None
    blocking_ids = tuple(
        result.item_id for result in ordered_results if not result.feasible_for_target
    )
    report_risk = evaluate_risk_tags(Confidence.HIGH, risk_tags, pack)
    notes = list(report_risk.notes)
    if any(result.stale for result in ordered_results):
        notes.append("At least one readiness source is stale")
    return ReadinessReport(
        job_id=job.id,
        target_start=resolved_target,
        items=ordered_results,
        earliest_feasible_start=earliest_start,
        feasible=not blocking_ids,
        stale=any(result.stale for result in ordered_results),
        job_locked_by_risk=report_risk.locks_job,
        vendor_expedite_required=any(result.vendor_expedite_required for result in ordered_results),
        blocking_item_ids=blocking_ids,
        notes=tuple(notes),
    )


def earliest_feasible_start(
    job: Job,
    items: Sequence[ReadinessItem],
    pack: DomainPack,
    *,
    as_of: datetime | None = None,
    risk_tags: Sequence[RiskEvidence | str] = (),
    template_name: str | None = None,
) -> int:
    report = check_readiness(
        job,
        items,
        pack,
        as_of=as_of,
        risk_tags=risk_tags,
        template_name=template_name,
    )
    if report.earliest_feasible_start is None:
        raise InvalidEntityError("readiness has no usable ETA for earliest feasible start")
    return report.earliest_feasible_start
