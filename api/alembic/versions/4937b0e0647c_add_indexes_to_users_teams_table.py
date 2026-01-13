"""add_indexes_to_users_teams_table

Revision ID: 4937b0e0647c
Revises: c78d76a6d65c
Create Date: 2026-01-13 12:30:38.743839

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "4937b0e0647c"
down_revision: Union[str, Sequence[str], None] = "c78d76a6d65c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add indexes on user_id and team_id to improve query performance
    # These indexes will speed up queries filtering by user_id, team_id, or both
    op.create_index("ix_users_teams_user_id", "users_teams", ["user_id"], unique=False)
    op.create_index("ix_users_teams_team_id", "users_teams", ["team_id"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_users_teams_team_id", table_name="users_teams", if_exists=True)
    op.drop_index("ix_users_teams_user_id", table_name="users_teams", if_exists=True)
