"""Add immutable decision-time context to the existing decision rows.

The snapshot columns are additive.  Existing decision and decision-change
rows are retained, and legacy rows receive only context that can be proven
through ``Plan -> AgentRun -> EventExtraction`` at the run's recorded
extraction version.  Nature, cause, and jobs are left unknown when that exact
version is absent or cannot be validated; those rows remain explicitly
``partial_legacy`` rather than being filled from a mutable latest join.

The downgrade guard refuses to discard a captured snapshot.  If no captured
rows exist, downgrade removes only these additive columns; decisions and
their audit changes remain.  A downgraded database cannot recover discarded
snapshot values, and the legacy backfill cannot recover nature, cause, or job
IDs that were not present in a verifiable extraction version.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004_decision_context_snapshot"
down_revision: str | None = "0003_resource_unavailability"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

_json = postgresql.JSONB
_uuid = sa.UUID(as_uuid=True)


def upgrade() -> None:
    """Add snapshot storage and conservatively backfill legacy decisions."""

    op.add_column("decisions", sa.Column("event_id", _uuid, nullable=True))
    op.add_column("decisions", sa.Column("plan_version", sa.Integer(), nullable=True))
    op.add_column("decisions", sa.Column("event_nature", sa.String(32), nullable=True))
    op.add_column("decisions", sa.Column("event_cause", sa.Text(), nullable=True))
    op.add_column(
        "decisions",
        sa.Column(
            "job_ids",
            _json,
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
    )
    op.add_column(
        "decisions",
        sa.Column(
            "context_status",
            sa.String(32),
            server_default=sa.text("'partial_legacy'"),
            nullable=False,
        ),
    )
    op.create_check_constraint(
        "ck_decisions_context_status",
        "decisions",
        "context_status IN ('captured', 'partial_legacy')",
    )

    # Plan identity and version are immutable in the existing plan lineage.
    # They are safe to backfill even when no extraction was stored.
    op.execute(
        sa.text(
            """
            UPDATE decisions AS d
            SET event_id = p.event_id,
                plan_version = p.version
            FROM plans AS p
            WHERE p.id = d.plan_id
            """
        )
    )

    # Promote only rows whose exact extraction also proves nature, cause, and
    # every referenced job.  Missing or malformed evidence stays explicitly
    # partial_legacy instead of being presented as a complete snapshot.
    op.execute(
        sa.text(
            """
            WITH captured_context AS (
                SELECT d.id AS decision_id
                FROM decisions AS d
                JOIN plans AS p ON p.id = d.plan_id
                JOIN events AS e ON e.id = p.event_id
                JOIN agent_runs AS run
                  ON run.id = p.run_id
                 AND run.event_id = p.event_id
                JOIN event_extractions AS extraction
                  ON extraction.event_id = run.event_id
                 AND extraction.version = run.extraction_version
                WHERE jsonb_typeof(extraction.extracted_json -> 'nature') = 'string'
                  AND jsonb_typeof(extraction.extracted_json -> 'cause') = 'string'
                  AND NULLIF(extraction.extracted_json ->> 'nature', '') IS NOT NULL
                  AND NULLIF(extraction.extracted_json ->> 'cause', '') IS NOT NULL
                  AND jsonb_typeof(extraction.extracted_json -> 'job_ids') = 'array'
                  AND NOT EXISTS (
                      SELECT 1
                      FROM jsonb_array_elements(
                          extraction.extracted_json -> 'job_ids'
                      ) AS item(value)
                      WHERE jsonb_typeof(item.value) <> 'string'
                         OR NOT EXISTS (
                             SELECT 1
                             FROM jobs AS job
                             WHERE job.id = item.value #>> '{}'
                               AND job.scenario_id = e.scenario_id
                         )
                  )
            )
            UPDATE decisions AS d
            SET context_status = 'captured'
            FROM captured_context AS context
            WHERE d.id = context.decision_id
            """
        )
    )

    # Only use the extraction version actually consumed by the plan's run.
    # Every job ID must resolve in the event's scenario before the array is
    # copied; otherwise the whole legacy job context stays unknown.
    op.execute(
        sa.text(
            """
            WITH versioned_context AS (
                SELECT
                    d.id AS decision_id,
                    e.scenario_id,
                    extraction.extracted_json
                FROM decisions AS d
                JOIN plans AS p ON p.id = d.plan_id
                JOIN events AS e ON e.id = p.event_id
                JOIN agent_runs AS run
                  ON run.id = p.run_id
                 AND run.event_id = p.event_id
                JOIN event_extractions AS extraction
                  ON extraction.event_id = run.event_id
                 AND extraction.version = run.extraction_version
            )
            UPDATE decisions AS d
            SET event_nature = CASE
                    WHEN jsonb_typeof(context.extracted_json -> 'nature') = 'string'
                    THEN NULLIF(context.extracted_json ->> 'nature', '')
                    ELSE NULL
                END,
                event_cause = CASE
                    WHEN jsonb_typeof(context.extracted_json -> 'cause') = 'string'
                    THEN NULLIF(context.extracted_json ->> 'cause', '')
                    ELSE NULL
                END,
                job_ids = CASE
                    WHEN jsonb_typeof(context.extracted_json -> 'job_ids') = 'array'
                     AND NOT EXISTS (
                         SELECT 1
                         FROM jsonb_array_elements(
                             context.extracted_json -> 'job_ids'
                         ) AS item(value)
                         WHERE jsonb_typeof(item.value) <> 'string'
                            OR NOT EXISTS (
                                SELECT 1
                                FROM jobs AS job
                                WHERE job.id = item.value #>> '{}'
                                  AND job.scenario_id = context.scenario_id
                            )
                     )
                    THEN COALESCE(
                        (
                            SELECT jsonb_agg(item.value ORDER BY item.ordinal)
                            FROM jsonb_array_elements(
                                context.extracted_json -> 'job_ids'
                            ) WITH ORDINALITY AS item(value, ordinal)
                        ),
                        '[]'::jsonb
                    )
                    ELSE '[]'::jsonb
                END
            FROM versioned_context AS context
            WHERE d.id = context.decision_id
            """
        )
    )


def downgrade() -> None:
    """Remove only snapshot columns, refusing silent captured-context loss."""

    op.execute(
        sa.text(
            """
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM decisions
                    WHERE context_status = 'captured'
                ) THEN
                    RAISE EXCEPTION
                        'cannot downgrade decision context: captured snapshots would be lost';
                END IF;
            END $$;
            """
        )
    )
    op.drop_constraint("ck_decisions_context_status", "decisions", type_="check")
    op.drop_column("decisions", "context_status")
    op.drop_column("decisions", "job_ids")
    op.drop_column("decisions", "event_cause")
    op.drop_column("decisions", "event_nature")
    op.drop_column("decisions", "plan_version")
    op.drop_column("decisions", "event_id")
