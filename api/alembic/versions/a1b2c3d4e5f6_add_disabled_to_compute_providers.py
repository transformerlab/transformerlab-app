"""add_disabled_to_compute_providers

Revision ID: a1b2c3d4e5f6
Revises: 4937b0e0647c
Create Date: 2026-03-03 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "4937b0e0647c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("compute_providers", sa.Column("disabled", sa.Boolean(), server_default="0", nullable=False))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("compute_providers", "disabled")
