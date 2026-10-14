"""Create the initial Ripple persistence schema.

Revision ID: 0001_initial_schema
Revises:
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial_schema"
down_revision: str | None = None
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

_timestamp = sa.TIMESTAMP(timezone=True)
_now = sa.text("CURRENT_TIMESTAMP")
_json = postgresql.JSONB
_uuid = sa.UUID(as_uuid=True)


def upgrade() -> None:
    """Create the immutable initial schema snapshot."""

    op.create_table(
        "schedule_state",
        sa.Column("id", sa.SmallInteger(), autoincrement=False, nullable=False),
        sa.Column("scenario_id", sa.Text(), nullable=False),
        sa.Column("version", sa.BigInteger(), server_default=sa.text("0"), nullable=False),
        sa.Column("updated_at", _timestamp, server_default=_now, nullable=False),
        sa.CheckConstraint("id = 1", name="ck_schedule_state_singleton_id"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("scenario_id"),
    )
    op.create_table(
        "jobs",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("scenario_id", sa.Text(), nullable=False),
        sa.Column("site", sa.Text(), nullable=False),
        sa.Column("job_type", sa.Text(), nullable=False),
        sa.Column("start_day", sa.Integer(), nullable=False),
        sa.Column("duration_days", sa.Integer(), nullable=False),
        sa.Column("shortfall_bopd", sa.Numeric(14, 3), nullable=False),
        sa.Column("locked", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("lock_reason", sa.Text()),
        sa.Column("status", sa.String(32), server_default=sa.text("'planned'"), nullable=False),
        sa.Column("row_version", sa.BigInteger(), server_default=sa.text("1"), nullable=False),
        sa.CheckConstraint("duration_days > 0", name="ck_jobs_duration_positive"),
        sa.CheckConstraint("shortfall_bopd >= 0", name="ck_jobs_shortfall_nonnegative"),
        sa.CheckConstraint("row_version > 0", name="ck_jobs_row_version_positive"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_jobs_scenario_start_day", "jobs", ["scenario_id", "start_day"])
    op.create_index("ix_jobs_scenario_status", "jobs", ["scenario_id", "status"])
    op.create_index("ix_jobs_locked", "jobs", ["locked"])
    op.create_table(
        "resources",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("scenario_id", sa.Text(), nullable=False),
        sa.Column("type", sa.String(64), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("capacity", sa.Numeric(14, 3), nullable=False),
        sa.Column("unit", sa.Text(), nullable=False),
        sa.Column("active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("metadata", _json, server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.CheckConstraint("capacity > 0", name="ck_resources_capacity_positive"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("scenario_id", "name", name="uq_resources_scenario_name"),
    )
    op.create_table(
        "weather_forecast",
        sa.Column("scenario_id", sa.Text(), nullable=False),
        sa.Column("location", sa.Text(), nullable=False),
        sa.Column("day", sa.Integer(), nullable=False),
        sa.Column("wave_height", sa.Numeric(8, 3), nullable=False),
        sa.Column("go_flag", sa.Boolean(), nullable=False),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("last_updated_at", _timestamp, server_default=_now, nullable=False),
        sa.PrimaryKeyConstraint("scenario_id", "location", "day"),
    )
    op.create_table(
        "events",
        sa.Column("id", _uuid, nullable=False),
        sa.Column("scenario_id", sa.Text(), nullable=False),
        sa.Column("nature", sa.String(32)),
        sa.Column("cause", sa.Text()),
        sa.Column("raw_text", sa.Text(), nullable=False),
        sa.Column("file_object_ref", sa.Text()),
        sa.Column("state", sa.String(32), server_default=sa.text("'received'"), nullable=False),
        sa.Column("parent_event_id", _uuid),
        sa.Column("parent_plan_id", _uuid),
        sa.Column("origin_type", sa.String(32), nullable=False),
        sa.Column("extraction_version", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("created_by", sa.Text(), nullable=False),
        sa.Column("created_at", _timestamp, server_default=_now, nullable=False),
        sa.Column("updated_at", _timestamp, server_default=_now, nullable=False),
        sa.ForeignKeyConstraint(["parent_event_id"], ["events.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "idempotency_keys",
        sa.Column("id", _uuid, nullable=False),
        sa.Column("actor_id", sa.Text(), nullable=False),
        sa.Column("route_scope", sa.Text(), nullable=False),
        sa.Column("key", sa.Text(), nullable=False),
        sa.Column("request_hash", sa.String(128), nullable=False),
        sa.Column("response_status", sa.Integer()),
        sa.Column("response_body", _json),
        sa.Column("expires_at", _timestamp, nullable=False),
        sa.Column("created_at", _timestamp, server_default=_now, nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "actor_id",
            "route_scope",
            "key",
            name="uq_idempotency_actor_route_key",
        ),
    )
    op.create_table(
        "bookings",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("scenario_id", sa.Text(), nullable=False),
        sa.Column("job_id", sa.Text()),
        sa.Column("activity_id", sa.Text()),
        sa.Column("resource_id", sa.Text(), nullable=False),
        sa.Column("start_day", sa.Integer(), nullable=False),
        sa.Column("end_day", sa.Integer(), nullable=False),
        sa.Column("load", sa.Numeric(14, 3), nullable=False),
        sa.Column("status", sa.String(32), server_default=sa.text("'planned'"), nullable=False),
        sa.Column("row_version", sa.BigInteger(), server_default=sa.text("1"), nullable=False),
        sa.CheckConstraint("end_day >= start_day", name="ck_bookings_day_range"),
        sa.CheckConstraint(
            "(job_id IS NULL) <> (activity_id IS NULL)", name="ck_bookings_one_owner"
        ),
        sa.CheckConstraint("load >= 0", name="ck_bookings_load_nonnegative"),
        sa.CheckConstraint("row_version > 0", name="ck_bookings_row_version_positive"),
        sa.ForeignKeyConstraint(["job_id"], ["jobs.id"]),
        sa.ForeignKeyConstraint(["resource_id"], ["resources.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_bookings_resource_date", "bookings", ["resource_id", "start_day", "end_day"]
    )
    op.create_table(
        "readiness_items",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("scenario_id", sa.Text(), nullable=False),
        sa.Column("job_id", sa.Text(), nullable=False),
        sa.Column("stage", sa.Text(), nullable=False),
        sa.Column("step_order", sa.Integer(), nullable=False),
        sa.Column("lead_time_days", sa.Integer(), nullable=False),
        sa.Column("planned_day", sa.Integer()),
        sa.Column("eta_earliest_day", sa.Integer()),
        sa.Column("eta_latest_day", sa.Integer()),
        sa.Column("confidence", sa.Numeric(5, 4)),
        sa.Column("status", sa.String(32), server_default=sa.text("'pending'"), nullable=False),
        sa.Column("source_type", sa.String(32), nullable=False),
        sa.Column("source_reference", sa.Text()),
        sa.Column("last_updated_at", _timestamp, server_default=_now, nullable=False),
        sa.Column("not_before_day", sa.Integer()),
        sa.Column("risk_buffer_days", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("row_version", sa.BigInteger(), server_default=sa.text("1"), nullable=False),
        sa.CheckConstraint("lead_time_days >= 0", name="ck_readiness_lead_time_nonnegative"),
        sa.CheckConstraint("risk_buffer_days >= 0", name="ck_readiness_risk_buffer_nonnegative"),
        sa.CheckConstraint("row_version > 0", name="ck_readiness_row_version_positive"),
        sa.ForeignKeyConstraint(["job_id"], ["jobs.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "event_extractions",
        sa.Column("event_id", _uuid, nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("extracted_json", _json, nullable=False),
        sa.Column("model_name", sa.Text(), nullable=False),
        sa.Column("prompt_version", sa.Text(), nullable=False),
        sa.Column("confidence_summary", _json, nullable=False),
        sa.Column("corrected", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("correction_actor", sa.Text()),
        sa.Column("corrected_at", _timestamp),
        sa.Column("created_at", _timestamp, server_default=_now, nullable=False),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"]),
        sa.PrimaryKeyConstraint("event_id", "version"),
    )
    op.create_table(
        "agent_runs",
        sa.Column("id", _uuid, nullable=False),
        sa.Column("event_id", _uuid, nullable=False),
        sa.Column("extraction_version", sa.Integer(), nullable=False),
        sa.Column("state", sa.String(32), nullable=False),
        sa.Column("attempt", sa.Integer(), server_default=sa.text("1"), nullable=False),
        sa.Column("model_config_snapshot", _json, nullable=False),
        sa.Column("tool_call_budget", sa.Integer(), nullable=False),
        sa.Column("tool_call_usage", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("token_count", sa.BigInteger()),
        sa.Column("estimated_cost", sa.Numeric(14, 6)),
        sa.Column("started_at", _timestamp, server_default=_now, nullable=False),
        sa.Column("completed_at", _timestamp),
        sa.Column("timeout_at", _timestamp),
        sa.Column("error_code", sa.String(64)),
        sa.Column("error_detail", sa.Text()),
        sa.Column("idempotency_key", sa.Text()),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "cargo_items",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("scenario_id", sa.Text(), nullable=False),
        sa.Column("job_id", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("deck_units", sa.Numeric(14, 3), nullable=False),
        sa.Column("needed_by_day", sa.Integer(), nullable=False),
        sa.Column("sailing_booking_id", sa.Text()),
        sa.Column("row_version", sa.BigInteger(), server_default=sa.text("1"), nullable=False),
        sa.CheckConstraint("deck_units >= 0", name="ck_cargo_deck_units_nonnegative"),
        sa.CheckConstraint("row_version > 0", name="ck_cargo_row_version_positive"),
        sa.ForeignKeyConstraint(["job_id"], ["jobs.id"]),
        sa.ForeignKeyConstraint(["sailing_booking_id"], ["bookings.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "agent_run_events",
        sa.Column("run_id", _uuid, nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(64), nullable=False),
        sa.Column("public_payload", _json, nullable=False),
        sa.Column("internal_payload", _json),
        sa.Column("created_at", _timestamp, server_default=_now, nullable=False),
        sa.ForeignKeyConstraint(["run_id"], ["agent_runs.id"]),
        sa.PrimaryKeyConstraint("run_id", "sequence"),
    )
    op.create_table(
        "tool_calls",
        sa.Column("id", _uuid, nullable=False),
        sa.Column("run_id", _uuid, nullable=False),
        sa.Column("tool_name", sa.Text(), nullable=False),
        sa.Column("ordinal", sa.Integer(), nullable=False),
        sa.Column("sanitized_input", _json, nullable=False),
        sa.Column("sanitized_result", _json),
        sa.Column("started_at", _timestamp, server_default=_now, nullable=False),
        sa.Column("completed_at", _timestamp),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("error_code", sa.String(64)),
        sa.Column("input_hash", sa.String(128), nullable=False),
        sa.ForeignKeyConstraint(["run_id"], ["agent_runs.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("run_id", "ordinal", name="uq_tool_calls_run_ordinal"),
    )
    op.create_table(
        "plans",
        sa.Column("id", _uuid, nullable=False),
        sa.Column("event_id", _uuid, nullable=False),
        sa.Column("run_id", _uuid, nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("verdict", sa.String(64), nullable=False),
        sa.Column("recommended_option_id", _uuid),
        sa.Column("base_schedule_version", sa.BigInteger(), nullable=False),
        sa.Column("explanation", _json, nullable=False),
        sa.Column("counterfactual", _json),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("supersedes_plan_id", _uuid),
        sa.Column("created_at", _timestamp, server_default=_now, nullable=False),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"]),
        sa.ForeignKeyConstraint(["run_id"], ["agent_runs.id"]),
        sa.ForeignKeyConstraint(["supersedes_plan_id"], ["plans.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("event_id", "version", name="uq_plans_event_version"),
    )
    op.create_table(
        "readiness_suggestions",
        sa.Column("id", _uuid, nullable=False),
        sa.Column("event_id", _uuid, nullable=False),
        sa.Column("readiness_item_id", sa.Text(), nullable=False),
        sa.Column("proposed_patch", _json, nullable=False),
        sa.Column("source_excerpt", sa.Text()),
        sa.Column("confidence", sa.Numeric(5, 4)),
        sa.Column("base_row_version", sa.BigInteger(), nullable=False),
        sa.Column("state", sa.String(32), nullable=False),
        sa.Column("review_actor", sa.Text()),
        sa.Column("review_note", sa.Text()),
        sa.Column("created_at", _timestamp, server_default=_now, nullable=False),
        sa.Column("reviewed_at", _timestamp),
        sa.Column("updated_at", _timestamp, server_default=_now, nullable=False),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"]),
        sa.ForeignKeyConstraint(["readiness_item_id"], ["readiness_items.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "plan_options",
        sa.Column("id", _uuid, nullable=False),
        sa.Column("plan_id", _uuid, nullable=False),
        sa.Column("label", sa.Text(), nullable=False),
        sa.Column("weight_profile", _json, nullable=False),
        sa.Column("solver_status", sa.String(32), nullable=False),
        sa.Column("objective_value", sa.Numeric(14, 6)),
        sa.Column("solve_milliseconds", sa.Integer()),
        sa.Column("changes", _json, nullable=False),
        sa.Column("conditions", _json, nullable=False),
        sa.Column("kpi", _json, nullable=False),
        sa.Column("violations", _json, nullable=False),
        sa.Column("rank", sa.Integer(), nullable=False),
        sa.Column("is_recommended", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.ForeignKeyConstraint(["plan_id"], ["plans.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "plan_evidence",
        sa.Column("plan_id", _uuid, nullable=False),
        sa.Column("claim_id", sa.Text(), nullable=False),
        sa.Column("claim_text", sa.Text(), nullable=False),
        sa.Column("tool_call_id", _uuid),
        sa.Column("evidence_type", sa.String(32), nullable=False),
        sa.ForeignKeyConstraint(["plan_id"], ["plans.id"]),
        sa.ForeignKeyConstraint(["tool_call_id"], ["tool_calls.id"]),
        sa.PrimaryKeyConstraint("plan_id", "claim_id"),
    )
    op.create_table(
        "decisions",
        sa.Column("id", _uuid, nullable=False),
        sa.Column("plan_id", _uuid, nullable=False),
        sa.Column("selected_option_id", _uuid),
        sa.Column("action", sa.String(32), nullable=False),
        sa.Column("actor", sa.Text(), nullable=False),
        sa.Column("reason", sa.Text()),
        sa.Column("category", sa.String(64)),
        sa.Column("acknowledged_condition_ids", _json, nullable=False),
        sa.Column("schedule_version_before", sa.BigInteger()),
        sa.Column("schedule_version_after", sa.BigInteger()),
        sa.Column("created_at", _timestamp, server_default=_now, nullable=False),
        sa.ForeignKeyConstraint(["plan_id"], ["plans.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "decision_changes",
        sa.Column("decision_id", _uuid, nullable=False),
        sa.Column("entity_type", sa.String(64), nullable=False),
        sa.Column("entity_id", sa.Text(), nullable=False),
        sa.Column("field", sa.Text(), nullable=False),
        sa.Column("change_kind", sa.String(32), nullable=False),
        sa.Column("before", _json),
        sa.Column("after", _json),
        sa.ForeignKeyConstraint(["decision_id"], ["decisions.id"]),
        sa.PrimaryKeyConstraint("decision_id", "entity_type", "entity_id", "field"),
    )
    op.create_table(
        "alerts",
        sa.Column("id", _uuid, nullable=False),
        sa.Column("scenario_id", sa.Text(), nullable=False),
        sa.Column("type", sa.String(64), nullable=False),
        sa.Column("severity", sa.String(32), nullable=False),
        sa.Column("state", sa.String(32), nullable=False),
        sa.Column("dedupe_key", sa.Text(), nullable=False),
        sa.Column("affected_objects", _json, nullable=False),
        sa.Column("evidence", _json, nullable=False),
        sa.Column("linked_event_id", _uuid),
        sa.Column("linked_decision_id", _uuid),
        sa.Column("acknowledged_at", _timestamp),
        sa.Column("acknowledged_by", sa.Text()),
        sa.Column("dismissed_at", _timestamp),
        sa.Column("dismissed_by", sa.Text()),
        sa.Column("resolved_at", _timestamp),
        sa.Column("resolved_by", sa.Text()),
        sa.Column("created_at", _timestamp, server_default=_now, nullable=False),
        sa.Column("updated_at", _timestamp, server_default=_now, nullable=False),
        sa.ForeignKeyConstraint(["linked_decision_id"], ["decisions.id"]),
        sa.ForeignKeyConstraint(["linked_event_id"], ["events.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("dedupe_key"),
    )
    op.create_table(
        "notification_outbox",
        sa.Column("id", _uuid, nullable=False),
        sa.Column("decision_id", _uuid),
        sa.Column("audience", sa.Text(), nullable=False),
        sa.Column("payload", _json, nullable=False),
        sa.Column("state", sa.String(32), nullable=False),
        sa.Column("attempts", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("next_attempt_at", _timestamp),
        sa.Column("created_at", _timestamp, server_default=_now, nullable=False),
        sa.ForeignKeyConstraint(["decision_id"], ["decisions.id"]),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    """Drop only the tables created by this initial revision."""

    op.drop_table("notification_outbox")
    op.drop_table("decision_changes")
    op.drop_table("alerts")
    op.drop_table("plan_options")
    op.drop_table("plan_evidence")
    op.drop_table("decisions")
    op.drop_table("tool_calls")
    op.drop_table("readiness_suggestions")
    op.drop_table("plans")
    op.drop_table("cargo_items")
    op.drop_table("agent_run_events")
    op.drop_table("readiness_items")
    op.drop_table("event_extractions")
    op.drop_table("bookings")
    op.drop_table("agent_runs")
    op.drop_table("weather_forecast")
    op.drop_table("schedule_state")
    op.drop_table("resources")
    op.drop_table("jobs")
    op.drop_table("idempotency_keys")
    op.drop_table("events")
