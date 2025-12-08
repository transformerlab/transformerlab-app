"""Fix  oauth_account schema

Revision ID: 64b507342a07
Revises: c175b784119c
Create Date: 2025-12-04 17:13:09.680509

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "64b507342a07"
down_revision: Union[str, Sequence[str], None] = "c175b784119c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema - use batch mode for SQLite compatibility."""
    # SQLite doesn't support ALTER COLUMN for NOT NULL or adding foreign keys
    # Use batch mode which recreates the table with the correct schema
    with op.batch_alter_table("oauth_account", schema=None) as batch_op:
        # Make columns NOT NULL
        batch_op.alter_column("access_token", existing_type=sa.VARCHAR(length=1024), nullable=False)
        batch_op.alter_column("account_email", existing_type=sa.VARCHAR(length=320), nullable=False)

        # Drop old indexes
        batch_op.drop_index("ix_oauth_account_oauth_name_account_id")
        batch_op.drop_index("ix_oauth_account_user_id")

        # Create new indexes (separate, not combined)
        batch_op.create_index("ix_oauth_account_account_id", ["account_id"], unique=False)
        batch_op.create_index("ix_oauth_account_oauth_name", ["oauth_name"], unique=False)

        # Add foreign key constraint
        batch_op.create_foreign_key("fk_oauth_account_user_id", "user", ["user_id"], ["id"], ondelete="cascade")

        # Drop unused column
        batch_op.drop_column("account_id_token")
    # ### end Alembic commands ###


def downgrade() -> None:
    """Downgrade schema - use batch mode for SQLite compatibility."""
    # Use batch mode to revert changes
    with op.batch_alter_table("oauth_account", schema=None) as batch_op:
        # Revert column constraints
        batch_op.alter_column("access_token", existing_type=sa.VARCHAR(length=1024), nullable=True)
        batch_op.alter_column("account_email", existing_type=sa.VARCHAR(length=320), nullable=True)

        # Drop new indexes
        batch_op.drop_index("ix_oauth_account_oauth_name")
        batch_op.drop_index("ix_oauth_account_account_id")

        # Recreate old indexes
        batch_op.create_index("ix_oauth_account_user_id", ["user_id"], unique=False)
        batch_op.create_index("ix_oauth_account_oauth_name_account_id", ["oauth_name", "account_id"], unique=True)

        # Drop foreign key
        batch_op.drop_constraint("fk_oauth_account_user_id", type_="foreignkey")

        # Add back the removed column
        batch_op.add_column(sa.Column("account_id_token", sa.VARCHAR(length=1024), nullable=True))
    # ### end Alembic commands ###
