"""add storage usage snapshots table

Revision ID: aaab927fe564
Revises: 598bc2e555d4
Create Date: 2026-06-10 10:18:24.375976

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from transformerlab.db.migration_utils import table_exists


# revision identifiers, used by Alembic.
revision: str = "aaab927fe564"
down_revision: Union[str, Sequence[str], None] = "598bc2e555d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    connection = op.get_bind()
    if not table_exists(connection, "storage_usage_snapshots"):
        op.create_table(
            "storage_usage_snapshots",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("team_id", sa.String(), nullable=False),
            sa.Column("total_bytes", sa.BigInteger(), server_default="0", nullable=False),
            sa.Column("has_data", sa.Boolean(), server_default="0", nullable=False),
            sa.Column("as_of", sa.DateTime(), nullable=True),
            sa.Column(
                "captured_at",
                sa.DateTime(),
                server_default=sa.text("(CURRENT_TIMESTAMP)"),
                nullable=False,
            ),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            "idx_storage_usage_snapshots_team_captured",
            "storage_usage_snapshots",
            ["team_id", "captured_at"],
        )


def downgrade() -> None:
    op.drop_index(
        "idx_storage_usage_snapshots_team_captured",
        table_name="storage_usage_snapshots",
        if_exists=True,
    )
    op.drop_table("storage_usage_snapshots", if_exists=True)
