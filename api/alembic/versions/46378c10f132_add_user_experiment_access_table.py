"""add_user_experiment_access_table

Revision ID: 46378c10f132
Revises: 6ccd4a4d9ca1
Create Date: 2026-05-04 13:23:27.122716

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from transformerlab.db.migration_utils import table_exists


# revision identifiers, used by Alembic.
revision: str = "46378c10f132"
down_revision: Union[str, Sequence[str], None] = "6ccd4a4d9ca1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    connection = op.get_bind()
    if not table_exists(connection, "user_experiment_access"):
        op.create_table(
            "user_experiment_access",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("team_id", sa.String(), nullable=False),
            sa.Column("experiment_id", sa.String(), nullable=False),
            sa.Column(
                "last_opened_at",
                sa.DateTime(),
                server_default=sa.text("(CURRENT_TIMESTAMP)"),
                nullable=False,
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "user_id",
                "team_id",
                "experiment_id",
                name="uq_user_experiment_access",
            ),
        )
        op.create_index(
            "idx_user_experiment_access_user_team",
            "user_experiment_access",
            ["user_id", "team_id"],
        )


def downgrade() -> None:
    op.drop_index("idx_user_experiment_access_user_team", table_name="user_experiment_access", if_exists=True)
    op.drop_table("user_experiment_access", if_exists=True)
