"""add_unique_constraint_job_id_quota_usage

Revision ID: 1f7cb465d15a
Revises: 90042b8ff500
Create Date: 2025-12-24 14:59:55.696151

"""

from typing import Sequence, Union

from alembic import op
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision: str = "1f7cb465d15a"
down_revision: Union[str, Sequence[str], None] = "90042b8ff500"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # First, clean up any duplicate (job_id, team_id) records
    # Keep the record with the earliest created_at for each (job_id, team_id) pair, delete the rest
    connection = op.get_bind()

    # Delete duplicates, keeping the one with the earliest created_at for each (job_id, team_id) pair
    # Note: job_id is NOT globally unique - same job_id can exist for different teams
    # SQLite-compatible approach: delete records that aren't the minimum id for each (job_id, team_id) pair
    connection.execute(
        text("""
        DELETE FROM quota_usage
        WHERE id NOT IN (
            SELECT MIN(id)
            FROM quota_usage
            GROUP BY job_id, team_id
        )
    """)
    )

    # Drop the existing non-unique index
    op.drop_index("idx_quota_usage_job_id", table_name="quota_usage", if_exists=True)

    # Create a unique index on (job_id, team_id) - ensures one quota record per job per team
    op.create_index(
        "idx_quota_usage_job_id_team_id_unique",
        "quota_usage",
        ["job_id", "team_id"],
        unique=True,
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Drop the unique index
    op.drop_index("idx_quota_usage_job_id_team_id_unique", table_name="quota_usage", if_exists=True)

    # Recreate the non-unique index
    op.create_index("idx_quota_usage_job_id", "quota_usage", ["job_id"], unique=False)
