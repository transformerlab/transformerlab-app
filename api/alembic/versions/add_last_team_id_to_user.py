"""add last_team_id to user

Revision ID: add_last_team_id_to_user
Revises: 1f7cb465d15a
Create Date: 2026-01-17
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "add_last_team_id_to_user"
down_revision = "1f7cb465d15a"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "user",
        sa.Column("last_team_id", sa.String(), nullable=True),
    )


def downgrade():
    op.drop_column("user", "last_team_id")
