"""SQLAlchemy table mappings for the Ripple persistence schema.

These mappings describe storage shape and constraints only. Domain rules stay
in ``app.domain`` and application services; no business workflow is encoded
in ORM events or model methods.
"""

from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    Sequence,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Declarative metadata registry for migrations and persistence tests."""


Timestamp = DateTime(timezone=True)
Json = dict[str, Any]
schedule_state_id_sequence = Sequence(
    "schedule_state_id_seq",
    start=1,
    increment=1,
    minvalue=1,
    maxvalue=32767,
)


class ScheduleState(Base):
    __tablename__ = "schedule_state"

    id: Mapped[int] = mapped_column(
        SmallInteger,
        schedule_state_id_sequence,
        primary_key=True,
        autoincrement=True,
    )
    scenario_id: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    version: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default=text("0"))
    updated_at: Mapped[datetime] = mapped_column(
        Timestamp, nullable=False, server_default=func.current_timestamp()
    )

class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    scenario_id: Mapped[str] = mapped_column(Text, nullable=False)
    site: Mapped[str] = mapped_column(Text, nullable=False)
    job_type: Mapped[str] = mapped_column(Text, nullable=False)
    start_day: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_days: Mapped[int] = mapped_column(Integer, nullable=False)
    shortfall_bopd: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    locked: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    lock_reason: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, server_default=text("'planned'")
    )
    row_version: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default=text("1"))

    __table_args__ = (
        CheckConstraint("duration_days > 0", name="ck_jobs_duration_positive"),
        CheckConstraint("shortfall_bopd >= 0", name="ck_jobs_shortfall_nonnegative"),
        CheckConstraint("row_version > 0", name="ck_jobs_row_version_positive"),
        Index("ix_jobs_scenario_start_day", "scenario_id", "start_day"),
        Index("ix_jobs_scenario_status", "scenario_id", "status"),
        Index("ix_jobs_locked", "locked"),
    )


class Resource(Base):
    __tablename__ = "resources"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    scenario_id: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    capacity: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    unit: Mapped[str] = mapped_column(Text, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    metadata_json: Mapped[Json] = mapped_column(
        "metadata", JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )

    __table_args__ = (
        UniqueConstraint("scenario_id", "name", name="uq_resources_scenario_name"),
        UniqueConstraint("id", "scenario_id", name="uq_resources_id_scenario"),
        CheckConstraint("capacity > 0", name="ck_resources_capacity_positive"),
    )


class ResourceUnavailability(Base):
    __tablename__ = "resource_unavailability"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    scenario_id: Mapped[str] = mapped_column(Text, nullable=False)
    resource_id: Mapped[str] = mapped_column(Text, nullable=False)
    start_day: Mapped[int] = mapped_column(Integer, nullable=False)
    end_day: Mapped[int] = mapped_column(Integer, nullable=False)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)

    __table_args__ = (
        ForeignKeyConstraint(
            ["resource_id", "scenario_id"],
            ["resources.id", "resources.scenario_id"],
            name="fk_resource_unavailability_resource_scenario",
        ),
        CheckConstraint("end_day >= start_day", name="ck_resource_unavailability_day_range"),
        CheckConstraint(
            "kind IN ('maintenance', 'unavailable')",
            name="ck_resource_unavailability_kind",
        ),
        Index(
            "ix_resource_unavailability_scenario_range",
            "scenario_id",
            "start_day",
            "end_day",
        ),
        Index(
            "ix_resource_unavailability_resource_range",
            "resource_id",
            "start_day",
            "end_day",
        ),
    )


class Booking(Base):
    __tablename__ = "bookings"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    scenario_id: Mapped[str] = mapped_column(Text, nullable=False)
    job_id: Mapped[str | None] = mapped_column(ForeignKey("jobs.id"))
    activity_id: Mapped[str | None] = mapped_column(Text)
    resource_id: Mapped[str] = mapped_column(ForeignKey("resources.id"), nullable=False)
    start_day: Mapped[int] = mapped_column(Integer, nullable=False)
    end_day: Mapped[int] = mapped_column(Integer, nullable=False)
    load: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, server_default=text("'planned'")
    )
    row_version: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default=text("1"))

    __table_args__ = (
        CheckConstraint("end_day >= start_day", name="ck_bookings_day_range"),
        CheckConstraint("(job_id IS NULL) <> (activity_id IS NULL)", name="ck_bookings_one_owner"),
        CheckConstraint("load >= 0", name="ck_bookings_load_nonnegative"),
        CheckConstraint("row_version > 0", name="ck_bookings_row_version_positive"),
        Index("ix_bookings_resource_date", "resource_id", "start_day", "end_day"),
    )


class ReadinessItem(Base):
    __tablename__ = "readiness_items"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    scenario_id: Mapped[str] = mapped_column(Text, nullable=False)
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id"), nullable=False)
    stage: Mapped[str] = mapped_column(Text, nullable=False)
    step_order: Mapped[int] = mapped_column(Integer, nullable=False)
    lead_time_days: Mapped[int] = mapped_column(Integer, nullable=False)
    planned_day: Mapped[int | None] = mapped_column(Integer)
    eta_earliest_day: Mapped[int | None] = mapped_column(Integer)
    eta_latest_day: Mapped[int | None] = mapped_column(Integer)
    confidence: Mapped[Decimal | None] = mapped_column(Numeric(5, 4))
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, server_default=text("'pending'")
    )
    source_type: Mapped[str] = mapped_column(String(32), nullable=False)
    source_reference: Mapped[str | None] = mapped_column(Text)
    last_updated_at: Mapped[datetime] = mapped_column(
        Timestamp, nullable=False, server_default=func.current_timestamp()
    )
    not_before_day: Mapped[int | None] = mapped_column(Integer)
    risk_buffer_days: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    row_version: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default=text("1"))

    __table_args__ = (
        CheckConstraint("lead_time_days >= 0", name="ck_readiness_lead_time_nonnegative"),
        CheckConstraint("risk_buffer_days >= 0", name="ck_readiness_risk_buffer_nonnegative"),
        CheckConstraint("row_version > 0", name="ck_readiness_row_version_positive"),
    )


class CargoItem(Base):
    __tablename__ = "cargo_items"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    scenario_id: Mapped[str] = mapped_column(Text, nullable=False)
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id"), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    deck_units: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    needed_by_day: Mapped[int] = mapped_column(Integer, nullable=False)
    sailing_booking_id: Mapped[str | None] = mapped_column(ForeignKey("bookings.id"))
    row_version: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default=text("1"))

    __table_args__ = (
        CheckConstraint("deck_units >= 0", name="ck_cargo_deck_units_nonnegative"),
        CheckConstraint("row_version > 0", name="ck_cargo_row_version_positive"),
    )


class WeatherForecast(Base):
    __tablename__ = "weather_forecast"

    scenario_id: Mapped[str] = mapped_column(Text, primary_key=True)
    location: Mapped[str] = mapped_column(Text, primary_key=True)
    day: Mapped[int] = mapped_column(Integer, primary_key=True)
    wave_height: Mapped[Decimal] = mapped_column(Numeric(8, 3), nullable=False)
    go_flag: Mapped[bool] = mapped_column(Boolean, nullable=False)
    source: Mapped[str] = mapped_column(Text, nullable=False)
    last_updated_at: Mapped[datetime] = mapped_column(
        Timestamp, nullable=False, server_default=func.current_timestamp()
    )


class Event(Base):
    __tablename__ = "events"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    scenario_id: Mapped[str] = mapped_column(Text, nullable=False)
    nature: Mapped[str | None] = mapped_column(String(32))
    cause: Mapped[str | None] = mapped_column(Text)
    raw_text: Mapped[str] = mapped_column(Text, nullable=False)
    file_object_ref: Mapped[str | None] = mapped_column(Text)
    state: Mapped[str] = mapped_column(
        String(32), nullable=False, server_default=text("'received'")
    )
    parent_event_id: Mapped[UUID | None] = mapped_column(ForeignKey("events.id"))
    parent_plan_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True))
    origin_type: Mapped[str] = mapped_column(String(32), nullable=False)
    extraction_version: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0")
    )
    created_by: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        Timestamp, nullable=False, server_default=func.current_timestamp()
    )
    updated_at: Mapped[datetime] = mapped_column(
        Timestamp, nullable=False, server_default=func.current_timestamp()
    )


class EventExtraction(Base):
    __tablename__ = "event_extractions"

    event_id: Mapped[UUID] = mapped_column(ForeignKey("events.id"), primary_key=True)
    version: Mapped[int] = mapped_column(Integer, primary_key=True)
    extracted_json: Mapped[Json] = mapped_column(JSONB, nullable=False)
    model_name: Mapped[str] = mapped_column(Text, nullable=False)
    prompt_version: Mapped[str] = mapped_column(Text, nullable=False)
    confidence_summary: Mapped[Json] = mapped_column(JSONB, nullable=False)
    corrected: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    correction_actor: Mapped[str | None] = mapped_column(Text)
    corrected_at: Mapped[datetime | None] = mapped_column(Timestamp)
    created_at: Mapped[datetime] = mapped_column(
        Timestamp, nullable=False, server_default=func.current_timestamp()
    )


class AgentRun(Base):
    __tablename__ = "agent_runs"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    event_id: Mapped[UUID] = mapped_column(ForeignKey("events.id"), nullable=False)
    extraction_version: Mapped[int] = mapped_column(Integer, nullable=False)
    state: Mapped[str] = mapped_column(String(32), nullable=False)
    attempt: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("1"))
    model_config_snapshot: Mapped[Json] = mapped_column(JSONB, nullable=False)
    tool_call_budget: Mapped[int] = mapped_column(Integer, nullable=False)
    tool_call_usage: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    token_count: Mapped[int | None] = mapped_column(BigInteger)
    estimated_cost: Mapped[Decimal | None] = mapped_column(Numeric(14, 6))
    started_at: Mapped[datetime] = mapped_column(
        Timestamp, nullable=False, server_default=func.current_timestamp()
    )
    completed_at: Mapped[datetime | None] = mapped_column(Timestamp)
    timeout_at: Mapped[datetime | None] = mapped_column(Timestamp)
    error_code: Mapped[str | None] = mapped_column(String(64))
    error_detail: Mapped[str | None] = mapped_column(Text)
    idempotency_key: Mapped[str | None] = mapped_column(Text)


class AgentRunEvent(Base):
    __tablename__ = "agent_run_events"

    run_id: Mapped[UUID] = mapped_column(ForeignKey("agent_runs.id"), primary_key=True)
    sequence: Mapped[int] = mapped_column(Integer, primary_key=True)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    public_payload: Mapped[Json] = mapped_column(JSONB, nullable=False)
    internal_payload: Mapped[Json | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(
        Timestamp, nullable=False, server_default=func.current_timestamp()
    )


class ToolCall(Base):
    __tablename__ = "tool_calls"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    run_id: Mapped[UUID] = mapped_column(ForeignKey("agent_runs.id"), nullable=False)
    tool_name: Mapped[str] = mapped_column(Text, nullable=False)
    ordinal: Mapped[int] = mapped_column(Integer, nullable=False)
    sanitized_input: Mapped[Json] = mapped_column(JSONB, nullable=False)
    sanitized_result: Mapped[Json | None] = mapped_column(JSONB)
    started_at: Mapped[datetime] = mapped_column(
        Timestamp, nullable=False, server_default=func.current_timestamp()
    )
    completed_at: Mapped[datetime | None] = mapped_column(Timestamp)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    error_code: Mapped[str | None] = mapped_column(String(64))
    input_hash: Mapped[str] = mapped_column(String(128), nullable=False)

    __table_args__ = (UniqueConstraint("run_id", "ordinal", name="uq_tool_calls_run_ordinal"),)


class Plan(Base):
    __tablename__ = "plans"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    event_id: Mapped[UUID] = mapped_column(ForeignKey("events.id"), nullable=False)
    run_id: Mapped[UUID] = mapped_column(ForeignKey("agent_runs.id"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    verdict: Mapped[str] = mapped_column(String(64), nullable=False)
    recommended_option_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True))
    base_schedule_version: Mapped[int] = mapped_column(BigInteger, nullable=False)
    explanation: Mapped[Json] = mapped_column(JSONB, nullable=False)
    counterfactual: Mapped[Json | None] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    supersedes_plan_id: Mapped[UUID | None] = mapped_column(ForeignKey("plans.id"))
    created_at: Mapped[datetime] = mapped_column(
        Timestamp, nullable=False, server_default=func.current_timestamp()
    )

    __table_args__ = (UniqueConstraint("event_id", "version", name="uq_plans_event_version"),)


class PlanOption(Base):
    __tablename__ = "plan_options"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    plan_id: Mapped[UUID] = mapped_column(ForeignKey("plans.id"), nullable=False)
    label: Mapped[str] = mapped_column(Text, nullable=False)
    weight_profile: Mapped[Json] = mapped_column(JSONB, nullable=False)
    solver_status: Mapped[str] = mapped_column(String(32), nullable=False)
    objective_value: Mapped[Decimal | None] = mapped_column(Numeric(14, 6))
    solve_milliseconds: Mapped[int | None] = mapped_column(Integer)
    changes: Mapped[Json] = mapped_column(JSONB, nullable=False)
    conditions: Mapped[Json] = mapped_column(JSONB, nullable=False)
    kpi: Mapped[Json] = mapped_column(JSONB, nullable=False)
    violations: Mapped[Json] = mapped_column(JSONB, nullable=False)
    rank: Mapped[int] = mapped_column(Integer, nullable=False)
    is_recommended: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )


class PlanEvidence(Base):
    __tablename__ = "plan_evidence"

    plan_id: Mapped[UUID] = mapped_column(ForeignKey("plans.id"), primary_key=True)
    claim_id: Mapped[str] = mapped_column(Text, primary_key=True)
    claim_text: Mapped[str] = mapped_column(Text, nullable=False)
    tool_call_id: Mapped[UUID | None] = mapped_column(ForeignKey("tool_calls.id"))
    evidence_type: Mapped[str] = mapped_column(String(32), nullable=False)


class Decision(Base):
    __tablename__ = "decisions"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    plan_id: Mapped[UUID] = mapped_column(ForeignKey("plans.id"), nullable=False)
    event_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True))
    plan_version: Mapped[int | None] = mapped_column(Integer)
    event_nature: Mapped[str | None] = mapped_column(String(32))
    event_cause: Mapped[str | None] = mapped_column(Text)
    job_ids: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, server_default=text("'[]'::jsonb")
    )
    context_status: Mapped[str] = mapped_column(
        String(32), nullable=False, server_default=text("'partial_legacy'")
    )
    selected_option_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True))
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    actor: Mapped[str] = mapped_column(Text, nullable=False)
    reason: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str | None] = mapped_column(String(64))
    acknowledged_condition_ids: Mapped[Json] = mapped_column(JSONB, nullable=False)
    schedule_version_before: Mapped[int | None] = mapped_column(BigInteger)
    schedule_version_after: Mapped[int | None] = mapped_column(BigInteger)
    created_at: Mapped[datetime] = mapped_column(
        Timestamp, nullable=False, server_default=func.current_timestamp()
    )

    __table_args__ = (
        CheckConstraint(
            "context_status IN ('captured', 'partial_legacy')",
            name="ck_decisions_context_status",
        ),
    )


class DecisionChange(Base):
    __tablename__ = "decision_changes"

    decision_id: Mapped[UUID] = mapped_column(ForeignKey("decisions.id"), primary_key=True)
    entity_type: Mapped[str] = mapped_column(String(64), primary_key=True)
    entity_id: Mapped[str] = mapped_column(Text, primary_key=True)
    field: Mapped[str] = mapped_column(Text, primary_key=True)
    change_kind: Mapped[str] = mapped_column(String(32), nullable=False)
    before_value: Mapped[Json | None] = mapped_column("before", JSONB)
    after_value: Mapped[Json | None] = mapped_column("after", JSONB)


class ReadinessSuggestion(Base):
    __tablename__ = "readiness_suggestions"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    event_id: Mapped[UUID] = mapped_column(ForeignKey("events.id"), nullable=False)
    readiness_item_id: Mapped[str] = mapped_column(ForeignKey("readiness_items.id"), nullable=False)
    proposed_patch: Mapped[Json] = mapped_column(JSONB, nullable=False)
    source_excerpt: Mapped[str | None] = mapped_column(Text)
    confidence: Mapped[Decimal | None] = mapped_column(Numeric(5, 4))
    base_row_version: Mapped[int] = mapped_column(BigInteger, nullable=False)
    state: Mapped[str] = mapped_column(String(32), nullable=False)
    review_actor: Mapped[str | None] = mapped_column(Text)
    review_note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        Timestamp, nullable=False, server_default=func.current_timestamp()
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(Timestamp)
    updated_at: Mapped[datetime] = mapped_column(
        Timestamp, nullable=False, server_default=func.current_timestamp()
    )


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    scenario_id: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[str] = mapped_column(String(64), nullable=False)
    severity: Mapped[str] = mapped_column(String(32), nullable=False)
    state: Mapped[str] = mapped_column(String(32), nullable=False)
    dedupe_key: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    affected_objects: Mapped[Json] = mapped_column(JSONB, nullable=False)
    evidence: Mapped[Json] = mapped_column(JSONB, nullable=False)
    linked_event_id: Mapped[UUID | None] = mapped_column(ForeignKey("events.id"))
    linked_decision_id: Mapped[UUID | None] = mapped_column(ForeignKey("decisions.id"))
    acknowledged_at: Mapped[datetime | None] = mapped_column(Timestamp)
    acknowledged_by: Mapped[str | None] = mapped_column(Text)
    dismissed_at: Mapped[datetime | None] = mapped_column(Timestamp)
    dismissed_by: Mapped[str | None] = mapped_column(Text)
    resolved_at: Mapped[datetime | None] = mapped_column(Timestamp)
    resolved_by: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        Timestamp, nullable=False, server_default=func.current_timestamp()
    )
    updated_at: Mapped[datetime] = mapped_column(
        Timestamp, nullable=False, server_default=func.current_timestamp()
    )


class NotificationOutbox(Base):
    __tablename__ = "notification_outbox"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    decision_id: Mapped[UUID | None] = mapped_column(ForeignKey("decisions.id"))
    audience: Mapped[str] = mapped_column(Text, nullable=False)
    payload: Mapped[Json] = mapped_column(JSONB, nullable=False)
    state: Mapped[str] = mapped_column(String(32), nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    next_attempt_at: Mapped[datetime | None] = mapped_column(Timestamp)
    created_at: Mapped[datetime] = mapped_column(
        Timestamp, nullable=False, server_default=func.current_timestamp()
    )


class IdempotencyKey(Base):
    __tablename__ = "idempotency_keys"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    actor_id: Mapped[str] = mapped_column(Text, nullable=False)
    route_scope: Mapped[str] = mapped_column(Text, nullable=False)
    key: Mapped[str] = mapped_column(Text, nullable=False)
    request_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    response_status: Mapped[int | None] = mapped_column(Integer)
    response_body: Mapped[Json | None] = mapped_column(JSONB)
    expires_at: Mapped[datetime] = mapped_column(Timestamp, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        Timestamp, nullable=False, server_default=func.current_timestamp()
    )

    __table_args__ = (
        UniqueConstraint("actor_id", "route_scope", "key", name="uq_idempotency_actor_route_key"),
    )


__all__ = ["Base"]
