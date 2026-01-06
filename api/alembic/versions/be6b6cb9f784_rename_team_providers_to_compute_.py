"""rename_team_providers_to_compute_providers

Revision ID: be6b6cb9f784
Revises: 63ca6eebc24c
Create Date: 2025-11-26 14:47:16.424026

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "be6b6cb9f784"
down_revision: Union[str, Sequence[str], None] = "63ca6eebc24c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Rename the table from team_providers to compute_providers
    op.rename_table("team_providers", "compute_providers")

    # Rename the index
    op.drop_index("idx_team_provider_name", table_name="compute_providers")
    op.create_index("idx_compute_provider_name", "compute_providers", ["team_id", "name"], unique=False)

    # Update index names that use the table name pattern
    # The ix_team_providers_* indexes will be automatically handled by SQLAlchemy/Alembic
    # but we should verify they exist and update if needed
    try:
        op.drop_index(op.f("ix_team_providers_team_id"), table_name="compute_providers")
    except Exception:
        pass  # Index might not exist or already dropped
    try:
        op.drop_index(op.f("ix_team_providers_type"), table_name="compute_providers")
    except Exception:
        pass  # Index might not exist or already dropped

    # Create new indexes with correct names (Alembic will auto-generate these on next autogenerate)
    op.create_index(op.f("ix_compute_providers_team_id"), "compute_providers", ["team_id"], unique=False)
    op.create_index(op.f("ix_compute_providers_type"), "compute_providers", ["type"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    # Drop new indexes
    op.drop_index(op.f("ix_compute_providers_type"), table_name="compute_providers", if_exists=True)
    op.drop_index(op.f("ix_compute_providers_team_id"), table_name="compute_providers", if_exists=True)
    op.drop_index("idx_compute_provider_name", table_name="compute_providers", if_exists=True)

    # Rename the table back first
    op.rename_table("compute_providers", "team_providers")

    # Recreate old indexes on the renamed table
    op.create_index("idx_team_provider_name", "team_providers", ["team_id", "name"], unique=False)
    op.create_index(op.f("ix_team_providers_team_id"), "team_providers", ["team_id"], unique=False)
    op.create_index(op.f("ix_team_providers_type"), "team_providers", ["type"], unique=False)
