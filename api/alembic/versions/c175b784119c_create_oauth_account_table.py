"""create_oauth_account_table

Revision ID: c175b784119c
Revises: be6b6cb9f784
Create Date: 2025-11-27 11:26:04.145053

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c175b784119c"
down_revision: Union[str, Sequence[str], None] = "be6b6cb9f784"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create oauth_account table."""
    connection = op.get_bind()

    # Helper function to check if table exists
    def table_exists(table_name: str) -> bool:
        result = connection.execute(
            sa.text("SELECT name FROM sqlite_master WHERE type='table' AND name=:name"), {"name": table_name}
        )
        return result.fetchone() is not None

    if not table_exists("oauth_account"):
        op.create_table(
            "oauth_account",
            sa.Column("id", sa.CHAR(length=36), nullable=False),
            sa.Column("oauth_name", sa.String(length=100), nullable=False),
            sa.Column("account_id", sa.String(length=320), nullable=False),
            sa.Column("account_email", sa.String(length=320), nullable=True),
            sa.Column("access_token", sa.String(length=1024), nullable=True),
            sa.Column("expires_at", sa.Integer(), nullable=True),
            sa.Column("refresh_token", sa.String(length=1024), nullable=True),
            sa.Column("account_id_token", sa.String(length=1024), nullable=True),
            sa.Column("user_id", sa.CHAR(length=36), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_oauth_account_user_id"), "oauth_account", ["user_id"], unique=False)
        op.create_index(
            "ix_oauth_account_oauth_name_account_id",
            "oauth_account",
            ["oauth_name", "account_id"],
            unique=True,
        )


def downgrade() -> None:
    """Drop oauth_account table."""
    op.drop_index("ix_oauth_account_oauth_name_account_id", table_name="oauth_account", if_exists=True)
    op.drop_index(op.f("ix_oauth_account_user_id"), table_name="oauth_account", if_exists=True)
    op.drop_table("oauth_account")
