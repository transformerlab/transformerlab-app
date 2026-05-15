"""add public_share_link

Revision ID: 598bc2e555d4
Revises: 46378c10f132
Create Date: 2026-05-11 12:28:50.036092

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "598bc2e555d4"
down_revision: Union[str, Sequence[str], None] = "46378c10f132"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "public_share_link",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("token", sa.String(), nullable=False),
        sa.Column("resource_type", sa.String(), nullable=False),
        sa.Column("resource_id", sa.String(), nullable=False),
        sa.Column("team_id", sa.String(), nullable=False),
        sa.Column("created_by", sa.String(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_public_share_link_resource_active",
        "public_share_link",
        ["resource_type", "resource_id", "revoked_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_public_share_link_team_id"),
        "public_share_link",
        ["team_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_public_share_link_token"),
        "public_share_link",
        ["token"],
        unique=True,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_public_share_link_token"), table_name="public_share_link")
    op.drop_index(op.f("ix_public_share_link_team_id"), table_name="public_share_link")
    op.drop_index("ix_public_share_link_resource_active", table_name="public_share_link")
    op.drop_table("public_share_link")
