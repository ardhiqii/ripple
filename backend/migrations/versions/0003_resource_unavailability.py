"""Persist scenario-owned resource maintenance and unavailable intervals.

The interval table is additive and does not rewrite the A-12 seed or any
existing booking.  A composite foreign key ties each interval's resource and
scenario together, so an interval cannot point at a resource from another
scenario.  The downgrade refuses to discard interval rows; callers must
remove the newly introduced data explicitly before rolling back this migration.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003_resource_unavailability"
down_revision: str | None = "0002_scenario_schedule_state"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    """Create the typed, scenario-scoped interval source."""

    # Resource.id is already globally unique, but PostgreSQL requires a unique
    # constraint for the composite FK that enforces the scenario boundary.
    op.create_unique_constraint(
        "uq_resources_id_scenario",
        "resources",
        ["id", "scenario_id"],
    )
    op.create_table(
        "resource_unavailability",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("scenario_id", sa.Text(), nullable=False),
        sa.Column("resource_id", sa.Text(), nullable=False),
        sa.Column("start_day", sa.Integer(), nullable=False),
        sa.Column("end_day", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.CheckConstraint(
            "end_day >= start_day",
            name="ck_resource_unavailability_day_range",
        ),
        sa.CheckConstraint(
            "kind IN ('maintenance', 'unavailable')",
            name="ck_resource_unavailability_kind",
        ),
        sa.ForeignKeyConstraint(
            ["resource_id", "scenario_id"],
            ["resources.id", "resources.scenario_id"],
            name="fk_resource_unavailability_resource_scenario",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_resource_unavailability_scenario_range",
        "resource_unavailability",
        ["scenario_id", "start_day", "end_day"],
    )
    op.create_index(
        "ix_resource_unavailability_resource_range",
        "resource_unavailability",
        ["resource_id", "start_day", "end_day"],
    )


def downgrade() -> None:
    """Drop only this additive table, refusing accidental interval loss."""

    op.execute(
        sa.text(
            """
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM resource_unavailability) THEN
                    RAISE EXCEPTION
                        'cannot downgrade resource unavailability: interval rows exist';
                END IF;
            END $$;
            """
        )
    )
    op.drop_index(
        "ix_resource_unavailability_resource_range",
        table_name="resource_unavailability",
    )
    op.drop_index(
        "ix_resource_unavailability_scenario_range",
        table_name="resource_unavailability",
    )
    op.drop_table("resource_unavailability")
    op.drop_constraint("uq_resources_id_scenario", "resources", type_="unique")
