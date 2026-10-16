"""Allow one schedule state row per scenario without rewriting A-12 data.

The initial schema used ``id = 1`` as a table-wide singleton check even though
schedule reads and approval locks already use ``scenario_id``. This migration
removes only that check, keeps the existing surrogate key and unique scenario
lookup, and adds a smallint sequence for additional rows. The sequence is
aligned to the existing maximum ID before it becomes the column default, and
is marked called even when the table is empty. That keeps the explicit
``id = 1`` A-12 seed from colliding with the first generated scenario row.

Downgrade is intentionally guarded: if more than one schedule state exists,
the migration raises before changing the schema because restoring the
singleton check would reject valid scenario data. The failed downgrade is
transactional and does not delete or reinterpret any rows.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002_scenario_schedule_state"
down_revision: str | None = "0001_initial_schema"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

def upgrade() -> None:
    """Replace the table-wide singleton with scenario-keyed state rows."""

    op.execute(
        sa.text(
            "CREATE SEQUENCE schedule_state_id_seq AS smallint "
            "START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 32767 NO CYCLE"
        )
    )
    op.execute(
        sa.text(
            """
            SELECT setval(
                'schedule_state_id_seq',
                COALESCE(MAX(id), 1),
                TRUE
            )
            FROM schedule_state
            """
        )
    )
    op.execute(
        sa.text(
            "ALTER SEQUENCE schedule_state_id_seq "
            "OWNED BY schedule_state.id"
        )
    )
    op.alter_column(
        "schedule_state",
        "id",
        existing_type=sa.SmallInteger(),
        existing_nullable=False,
        server_default=sa.text("nextval('schedule_state_id_seq'::regclass)"),
    )
    op.drop_constraint(
        "ck_schedule_state_singleton_id",
        "schedule_state",
        type_="check",
    )


def downgrade() -> None:
    """Restore the singleton only when no second scenario would be rejected."""

    op.execute(
        sa.text(
            """
            DO $$
            BEGIN
                IF (SELECT COUNT(*) FROM schedule_state) > 1 THEN
                    RAISE EXCEPTION
                        'cannot downgrade schedule_state: multiple scenarios exist';
                ELSIF EXISTS (
                    SELECT 1 FROM schedule_state WHERE id <> 1
                ) THEN
                    RAISE EXCEPTION
                        'cannot downgrade schedule_state: generated scenario row is not id=1';
                END IF;
            END $$;
            """
        )
    )
    op.alter_column(
        "schedule_state",
        "id",
        existing_type=sa.SmallInteger(),
        existing_nullable=False,
        server_default=None,
    )
    op.create_check_constraint(
        "ck_schedule_state_singleton_id",
        "schedule_state",
        "id = 1",
    )
    op.execute(sa.text("DROP SEQUENCE schedule_state_id_seq"))
