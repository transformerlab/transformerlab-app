"""Merge team providers migrations with OAuth account migrations

Revision ID: 38d379ecd206
Revises: be6b6cb9f784, ce15d079ccd0
Create Date: 2025-11-27 11:38:23.213314

"""
from typing import Sequence, Union



# revision identifiers, used by Alembic.
revision: str = '38d379ecd206'
down_revision: Union[str, Sequence[str], None] = ('be6b6cb9f784', 'ce15d079ccd0')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
