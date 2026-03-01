"""Convert user and oauth_account UUID columns to native UUID type for PostgreSQL

This migration fixes the CHAR(36) vs native UUID type mismatch that causes
PostgreSQL to reject queries with the error:
  "operator does not exist: character = uuid"

FastAPI-users expects native UUID columns in PostgreSQL. The initial migration
created CHAR(36) columns (an SQLite compatibility workaround). This migration
converts those columns to the native UUID type on PostgreSQL. It is a no-op
for SQLite, which has no native UUID type.

Revision ID: a1b2c3d4e5f6
Revises: 4937b0e0647c
Create Date: 2026-02-28 00:00:00.000000

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
    """Convert CHAR(36) UUID columns to native UUID type on PostgreSQL."""
    connection = op.get_bind()

    if connection.dialect.name != "postgresql":
        # SQLite has no native UUID type — nothing to do
        return

    # Convert user.id from CHAR(36) to native UUID
    op.execute(sa.text('ALTER TABLE "user" ALTER COLUMN id TYPE uuid USING id::uuid'))

    # Convert oauth_account.id and oauth_account.user_id from CHAR(36) to native UUID
    op.execute(sa.text("ALTER TABLE oauth_account ALTER COLUMN id TYPE uuid USING id::uuid"))
    op.execute(sa.text("ALTER TABLE oauth_account ALTER COLUMN user_id TYPE uuid USING user_id::uuid"))


def downgrade() -> None:
    """Revert native UUID columns back to VARCHAR(36) on PostgreSQL."""
    connection = op.get_bind()

    if connection.dialect.name != "postgresql":
        return

    op.execute(sa.text('ALTER TABLE "user" ALTER COLUMN id TYPE varchar(36) USING id::text'))
    op.execute(sa.text("ALTER TABLE oauth_account ALTER COLUMN id TYPE varchar(36) USING id::text"))
    op.execute(sa.text("ALTER TABLE oauth_account ALTER COLUMN user_id TYPE varchar(36) USING user_id::text"))
