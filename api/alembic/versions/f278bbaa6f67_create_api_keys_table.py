"""create_api_keys_table

Revision ID: f278bbaa6f67
Revises: c175b784119c
Create Date: 2025-12-03 10:30:38.233879

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f278bbaa6f67"
down_revision: Union[str, Sequence[str], None] = "c175b784119c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create api_keys table."""
    connection = op.get_bind()

    # Helper function to check if table exists
    def table_exists(table_name: str) -> bool:
        result = connection.execute(
            sa.text("SELECT name FROM sqlite_master WHERE type='table' AND name=:name"), {"name": table_name}
        )
        return result.fetchone() is not None

    if not table_exists("api_keys"):
        op.create_table(
            "api_keys",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("key_hash", sa.String(), nullable=False),
            sa.Column("key_prefix", sa.String(), nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("team_id", sa.String(), nullable=True),
            sa.Column("name", sa.String(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
            sa.Column("last_used_at", sa.DateTime(), nullable=True),
            sa.Column("expires_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
            sa.Column("created_by_user_id", sa.String(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_api_keys_user_id"), "api_keys", ["user_id"], unique=False)
        op.create_index(op.f("ix_api_keys_key_hash"), "api_keys", ["key_hash"], unique=True)
        op.create_index(op.f("ix_api_keys_key_prefix"), "api_keys", ["key_prefix"], unique=False)
        op.create_index(op.f("ix_api_keys_team_id"), "api_keys", ["team_id"], unique=False)


def downgrade() -> None:
    """Drop api_keys table."""
    op.drop_index(op.f("ix_api_keys_team_id"), table_name="api_keys", if_exists=True)
    op.drop_index(op.f("ix_api_keys_key_prefix"), table_name="api_keys", if_exists=True)
    op.drop_index(op.f("ix_api_keys_key_hash"), table_name="api_keys", if_exists=True)
    op.drop_index(op.f("ix_api_keys_user_id"), table_name="api_keys", if_exists=True)
    op.drop_table("api_keys")
