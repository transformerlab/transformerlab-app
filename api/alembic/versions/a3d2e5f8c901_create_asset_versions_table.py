"""create_asset_versions_table

Revision ID: a3d2e5f8c901
Revises: 1f7cb465d15a
Create Date: 2026-03-06 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a3d2e5f8c901"
down_revision: Union[str, Sequence[str], None] = "1f7cb465d15a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create asset_versions table for tracking versioned groups of models and datasets."""
    connection = op.get_bind()

    # Helper function to check if table exists
    def table_exists(table_name: str) -> bool:
        result = connection.execute(
            sa.text("SELECT name FROM sqlite_master WHERE type='table' AND name=:name"), {"name": table_name}
        )
        return result.fetchone() is not None

    if not table_exists("asset_versions"):
        op.create_table(
            "asset_versions",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("asset_type", sa.String(), nullable=False),
            sa.Column("group_name", sa.String(), nullable=False),
            sa.Column("version", sa.Integer(), nullable=False),
            sa.Column("asset_id", sa.String(), nullable=False),
            sa.Column("tag", sa.String(), nullable=True),
            sa.Column("job_id", sa.String(), nullable=True),
            sa.Column("description", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("idx_asset_versions_group", "asset_versions", ["asset_type", "group_name"], unique=False)
        op.create_index(
            "idx_asset_versions_tag", "asset_versions", ["asset_type", "group_name", "tag"], unique=False
        )
        op.create_index("idx_asset_versions_asset_id", "asset_versions", ["asset_id"], unique=False)
        op.create_index(
            op.f("ix_asset_versions_asset_type"), "asset_versions", ["asset_type"], unique=False
        )
        op.create_index(
            op.f("ix_asset_versions_group_name"), "asset_versions", ["group_name"], unique=False
        )
        op.create_index(op.f("ix_asset_versions_tag_col"), "asset_versions", ["tag"], unique=False)


def downgrade() -> None:
    """Drop asset_versions table."""
    op.drop_index(op.f("ix_asset_versions_tag_col"), table_name="asset_versions")
    op.drop_index(op.f("ix_asset_versions_group_name"), table_name="asset_versions")
    op.drop_index(op.f("ix_asset_versions_asset_type"), table_name="asset_versions")
    op.drop_index("idx_asset_versions_asset_id", table_name="asset_versions")
    op.drop_index("idx_asset_versions_tag", table_name="asset_versions")
    op.drop_index("idx_asset_versions_group", table_name="asset_versions")
    op.drop_table("asset_versions")
