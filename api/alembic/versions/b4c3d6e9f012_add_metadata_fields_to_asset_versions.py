"""add metadata fields to asset_versions

Revision ID: b4c3d6e9f012
Revises: a3d2e5f8c901
Create Date: 2026-03-12 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b4c3d6e9f012"
down_revision: Union[str, Sequence[str], None] = "a3d2e5f8c901"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(connection, table_name: str, column_name: str) -> bool:
    """Check if a column already exists in a table (SQLite-compatible)."""
    result = connection.execute(sa.text(f"PRAGMA table_info('{table_name}')"))
    columns = [row[1] for row in result.fetchall()]
    return column_name in columns


def upgrade() -> None:
    """Add title, long_description, cover_image, evals, and metadata columns to asset_versions."""
    connection = op.get_bind()

    new_columns = [
        ("title", "VARCHAR"),
        ("long_description", "VARCHAR"),
        ("cover_image", "VARCHAR"),
        ("evals", "JSON"),
        ("metadata", "JSON"),
    ]

    for col_name, col_type in new_columns:
        if not _column_exists(connection, "asset_versions", col_name):
            op.add_column("asset_versions", sa.Column(col_name, getattr(sa, col_type)(), nullable=True))


def downgrade() -> None:
    """Remove the metadata columns from asset_versions."""
    columns_to_drop = ["title", "long_description", "cover_image", "evals", "metadata"]
    for col_name in columns_to_drop:
        op.drop_column("asset_versions", col_name)
