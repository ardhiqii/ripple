from datetime import datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from app.domain.enums import (
    BookingStatus,
    Confidence,
    EventNature,
    EventState,
    JobStatus,
    ReadinessStatus,
    ResourceType,
)
from pydantic import BaseModel, ConfigDict, Field, model_validator


class ApiModel(BaseModel):
    # Keep Decimal JSON output numeric without attaching a wildcard serializer
    # to every field. FastAPI uses the response model's serializers while
    # building OpenAPI; the wildcard serializer made otherwise typed fields
    # appear as untyped properties in the generated contract.
    model_config = ConfigDict(extra="forbid", json_encoders={Decimal: float})


class ErrorPayload(ApiModel):
    code: str
    message: str
    request_id: str
    retryable: bool
    details: dict[str, Any] = Field(default_factory=dict)


class ErrorEnvelope(ApiModel):
    error: ErrorPayload


class HardConstraintExtraction(ApiModel):
    kind: str = Field(min_length=1, max_length=128)
    value: Any = None
    source_excerpt: str = Field(min_length=1, max_length=5000)


class EtaUpdateExtraction(ApiModel):
    job_id: str = Field(min_length=1, max_length=128)
    stage: str = Field(min_length=1, max_length=128)
    eta_earliest: int | None = Field(default=None, ge=0)
    eta_latest: int | None = Field(default=None, ge=0)
    source_excerpt: str = Field(min_length=1, max_length=5000)

    @model_validator(mode="after")
    def validate_eta_range(self) -> "EtaUpdateExtraction":
        if (
            self.eta_earliest is not None
            and self.eta_latest is not None
            and self.eta_latest < self.eta_earliest
        ):
            raise ValueError("eta_latest cannot be before eta_earliest")
        return self


class RiskTagExtraction(ApiModel):
    tag: str = Field(min_length=1, max_length=128)
    source_excerpt: str = Field(min_length=1, max_length=5000)
    object_id: str | None = Field(default=None, max_length=128)


class RuledOutLeverExtraction(ApiModel):
    lever: str = Field(min_length=1, max_length=128)
    source_excerpt: str = Field(min_length=1, max_length=5000)


class ChangeEventExtraction(ApiModel):
    nature: EventNature | None = None
    cause: str | None = Field(default=None, max_length=256)
    job_ids: tuple[str, ...] = ()
    objective: str | None = Field(default=None, max_length=2000)
    requested_start: int | None = Field(default=None, ge=0)
    eta_updates: tuple[EtaUpdateExtraction, ...] = ()
    hard_constraints: tuple[HardConstraintExtraction, ...] = ()
    soft_preferences: tuple[str, ...] = ()
    risk_tags: tuple[RiskTagExtraction, ...] = ()
    levers_ruled_out: tuple[RuledOutLeverExtraction, ...] = ()
    missing_info: tuple[str, ...] = ()
    source_excerpt: str = Field(min_length=1, max_length=5000)

    @model_validator(mode="after")
    def validate_clarification_inputs(self) -> "ChangeEventExtraction":
        if len(set(self.job_ids)) != len(self.job_ids):
            raise ValueError("job_ids must be unique")
        if not self.job_ids and not self.missing_info:
            raise ValueError("missing_info is required when no job is resolved")
        if self.requested_start is None and not self.objective and not self.missing_info:
            raise ValueError("missing_info is required when no target or objective is present")
        return self


class CreateEventRequest(ApiModel):
    raw_text: str = Field(min_length=1, max_length=100_000)
    nature: EventNature | None = None
    cause: str | None = Field(default=None, max_length=256)
    parent_event_id: UUID | None = None
    parent_plan_id: UUID | None = None


class EventResponse(ApiModel):
    id: UUID
    scenario_id: str
    nature: EventNature | None
    cause: str | None
    raw_text: str
    state: EventState
    origin_type: str
    extraction_version: int
    created_by: str
    created_at: datetime
    updated_at: datetime


class EventSummaryResponse(ApiModel):
    id: UUID
    nature: EventNature | None
    cause: str | None
    state: EventState
    extraction_version: int
    raw_text_preview: str
    created_at: datetime
    updated_at: datetime
    job_ids: tuple[str, ...]
    latest_run_id: UUID | None
    latest_run_state: str | None
    latest_plan_id: UUID | None
    latest_plan_status: str | None


class ExtractionVersionResponse(ApiModel):
    event_id: UUID
    version: int
    extracted_json: dict[str, Any]
    model_name: str
    prompt_version: str
    confidence_summary: dict[str, Any]
    corrected: bool
    correction_actor: str | None
    corrected_at: datetime | None
    created_at: datetime


class LinkedRunResponse(ApiModel):
    id: UUID
    state: str
    attempt: int
    extraction_version: int
    started_at: datetime
    completed_at: datetime | None


class LinkedPlanResponse(ApiModel):
    id: UUID
    version: int
    verdict: str
    status: str
    base_schedule_version: int
    created_at: datetime


class EventListResponse(ApiModel):
    events: tuple[EventSummaryResponse, ...]
    next_cursor: str | None
    total_count: int
    scenario_lifecycle_counts: dict[str, int]


class EventDetailResponse(ApiModel):
    event: EventResponse
    extractions: tuple[ExtractionVersionResponse, ...]
    runs: tuple[LinkedRunResponse, ...]
    plans: tuple[LinkedPlanResponse, ...]


class ExtractionCorrectionRequest(ApiModel):
    expected_extraction_version: int = Field(ge=0)
    extraction: ChangeEventExtraction


class ExtractionStartResponse(ApiModel):
    event_id: UUID
    state: EventState
    extraction_version: int
    status: str


class JobResponse(ApiModel):
    id: str
    site: str
    job_type: str
    start_day: int
    duration_days: int
    shortfall_bopd: Decimal | float
    locked: bool
    lock_reason: str | None
    status: JobStatus
    row_version: int


class ResourceResponse(ApiModel):
    id: str
    type: ResourceType
    name: str
    capacity: Decimal | float
    unit: str
    active: bool
    metadata: dict[str, Any]


class BookingResponse(ApiModel):
    id: str
    resource_id: str
    start_day: int
    end_day: int
    load: Decimal | float
    status: BookingStatus
    job_id: str | None
    cargo_id: str | None
    row_version: int


class UnavailabilityResponse(ApiModel):
    id: str
    resource_id: str
    start_day: int
    end_day: int
    kind: Literal["maintenance", "unavailable"]
    reason: str


class WeatherResponse(ApiModel):
    location: str
    day: int
    metric: str
    value: Decimal | float | None
    go: bool | None
    source: str


class CapacityPointResponse(ApiModel):
    resource_id: str
    day: int
    used: Decimal | float
    capacity: Decimal | float
    overflow: Decimal | float
    utilization_percent: Decimal | float
    booking_ids: tuple[str, ...]


class CapacityResponse(ApiModel):
    resource_id: str
    unit: str
    feasible: bool
    max_overflow: Decimal | float
    points: tuple[CapacityPointResponse, ...]


class ScheduleResponse(ApiModel):
    scenario_id: str
    from_day: int | None
    to_day: int | None
    version: int
    jobs: tuple[JobResponse, ...]
    resources: tuple[ResourceResponse, ...]
    bookings: tuple[BookingResponse, ...]
    unavailability: tuple[UnavailabilityResponse, ...]
    weather: tuple[WeatherResponse, ...]
    capacity: tuple[CapacityResponse, ...]


class ChangedObjectResponse(ApiModel):
    entity_type: str
    entity_id: str
    change_kind: str
    before: dict[str, Any]
    after: dict[str, Any]


class ScheduleChangesResponse(ApiModel):
    decision_id: UUID
    schedule_version_before: int
    schedule_version_after: int | None
    changes: tuple[ChangedObjectResponse, ...]


class LeverResponse(ApiModel):
    name: str
    allowed: bool
    approval: str | None
    cost_weight: Decimal | float


class PolicyLeversResponse(ApiModel):
    levers: tuple[LeverResponse, ...]


class WeightProfileResponse(ApiModel):
    name: str
    delay_weight: Decimal | float
    lever_cost_weight: Decimal | float
    movement_weight: Decimal | float
    risk_weight: Decimal | float


class PolicyProfilesResponse(ApiModel):
    default_profile: str
    profiles: tuple[WeightProfileResponse, ...]


class SourceHealthResponse(ApiModel):
    source_type: str
    item_count: int
    latest_updated_at: datetime | None
    stale_count: int
    status: str


class PolicyDataHealthResponse(ApiModel):
    as_of: datetime
    stale_after_hours: int
    sources: tuple[SourceHealthResponse, ...]


class ReadinessItemResponse(ApiModel):
    id: str
    job_id: str
    stage: str
    step_order: int
    lead_time_days: int
    planned_day: int | None
    eta_earliest: int | None
    eta_latest: int | None
    confidence: Confidence
    status: ReadinessStatus
    source_type: str
    source_reference: str | None
    last_updated: datetime | None
    not_before_day: int | None
    risk_buffer_days: int
    row_version: int
    required_by: int
    effective_eta: int | None
    slack: int | None
    effective_slack: int | None
    stale: bool
    freshness_hours: float | None
    feasible_for_target: bool
    earliest_feasible_start: int | None
    plan_on_latest: bool
    vendor_expedite_required: bool
    notes: tuple[str, ...]


class ReadinessSummary(ApiModel):
    total: int
    at_risk: int
    stale: int
    low_confidence: int
    blocked: int


class ReadinessListResponse(ApiModel):
    scenario_id: str
    schedule_version: int
    items: tuple[ReadinessItemResponse, ...]
    summary: ReadinessSummary
    total_count: int


class ReadinessSourceResponse(ApiModel):
    source_type: str
    source_reference: str | None
    last_updated: datetime | None
    confidence: Confidence
    stale: bool
    freshness_hours: float | None


class ReadinessSuggestionResponse(ApiModel):
    id: UUID
    event_id: UUID
    readiness_item_id: str
    proposed_patch: dict[str, Any]
    source_excerpt: str | None
    confidence: Decimal | float | None
    base_row_version: int
    state: str
    review_actor: str | None
    review_note: str | None
    created_at: datetime
    reviewed_at: datetime | None


class ReadinessDetailResponse(ApiModel):
    scenario_id: str
    schedule_version: int
    item: ReadinessItemResponse
    source: ReadinessSourceResponse
    suggestion: ReadinessSuggestionResponse | None
    history: tuple[ReadinessSuggestionResponse, ...]


class ReadinessPatchFields(ApiModel):
    status: ReadinessStatus | None = None
    planned_day: int | None = None
    eta_earliest: int | None = None
    eta_latest: int | None = None
    confidence: Confidence | None = None
    risk_buffer_days: int | None = Field(default=None, ge=0)
    source_reference: str | None = None


class ReadinessPatchRequest(ReadinessPatchFields):
    expected_row_version: int = Field(gt=0)

    @model_validator(mode="after")
    def require_patch_value(self) -> "ReadinessPatchRequest":
        if not (self.model_fields_set - {"expected_row_version"}):
            raise ValueError("at least one readiness field must be provided")
        return self


class ReadinessWriteResponse(ApiModel):
    item: ReadinessItemResponse
    schedule_version: int


class SuggestionReviewResponse(ApiModel):
    suggestion: ReadinessSuggestionResponse
    schedule_version: int


class SuggestionReviewRequest(ApiModel):
    note: str | None = Field(default=None, max_length=2000)
