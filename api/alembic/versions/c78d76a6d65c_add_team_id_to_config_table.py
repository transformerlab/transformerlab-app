"""add_team_id_to_config_table

Revision ID: c78d76a6d65c
Revises: 1f7cb465d15a
Create Date: 2025-12-04 11:23:22.165544

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c78d76a6d65c"
down_revision: Union[str, Sequence[str], None] = "1f7cb465d15a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    connection = op.get_bind()

    # Check existing columns
    column_result = connection.execute(sa.text("PRAGMA table_info(config)"))
    existing_columns = [row[1] for row in column_result.fetchall()]

    # Get existing indexes by querying SQLite directly
    # SQLite stores unique constraints as unique indexes
    index_result = connection.execute(
        sa.text("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='config'")
    )
    existing_index_names = [row[0] for row in index_result.fetchall()]

    # Add columns first (outside batch mode to avoid circular dependency)
    # Only add if they don't already exist
    if "user_id" not in existing_columns:
        op.add_column("config", sa.Column("user_id", sa.String(), nullable=True))
    if "team_id" not in existing_columns:
        op.add_column("config", sa.Column("team_id", sa.String(), nullable=True))

    # Handle indexes outside of batch mode to avoid type inference issues
    # Drop existing unique index on key if it exists (to recreate as non-unique)
    if "ix_config_key" in existing_index_names:
        # Check if it's unique by querying the index definition
        index_info = connection.execute(
            sa.text("SELECT sql FROM sqlite_master WHERE type='index' AND name='ix_config_key'")
        ).fetchone()
        if index_info and index_info[0] and "UNIQUE" in index_info[0].upper():
            # Drop the unique index using raw SQL to avoid batch mode issues
            connection.execute(sa.text("DROP INDEX IF EXISTS ix_config_key"))
            existing_index_names.remove("ix_config_key")  # Update our list

    # Create new indexes (non-unique) - these can be done outside batch mode
    if "ix_config_key" not in existing_index_names:
        op.create_index("ix_config_key", "config", ["key"], unique=False)
    if "ix_config_user_id" not in existing_index_names:
        op.create_index("ix_config_user_id", "config", ["user_id"], unique=False)
    if "ix_config_team_id" not in existing_index_names:
        op.create_index("ix_config_team_id", "config", ["team_id"], unique=False)

    # For SQLite, unique constraints are stored as unique indexes
    # Create the unique constraint as a unique index using raw SQL to avoid batch mode issues
    if "uq_config_user_team_key" not in existing_index_names:
        connection.execute(
            sa.text("CREATE UNIQUE INDEX IF NOT EXISTS uq_config_user_team_key ON config(user_id, team_id, key)")
        )

    # Migrate existing configs to admin user's first team
    # Note: Don't call connection.commit() - Alembic manages transactions
    connection = op.get_bind()
    # Find admin user's first team
    admin_team_result = connection.execute(
        sa.text("""
            SELECT ut.team_id
            FROM users_teams ut
            JOIN user u ON ut.user_id = u.id
            WHERE u.email = 'admin@example.com'
            LIMIT 1
        """)
    )
    admin_team_row = admin_team_result.fetchone()

    if admin_team_row:
        admin_team_id = admin_team_row[0]
        # Update all existing configs (where team_id is NULL) to use admin team
        connection.execute(
            sa.text("UPDATE config SET team_id = :team_id WHERE team_id IS NULL"), {"team_id": admin_team_id}
        )
        print(f"✅ Migrated existing configs to team {admin_team_id}")
    else:
        # If no admin team found, try to get any user's first team
        any_team_result = connection.execute(sa.text("SELECT team_id FROM users_teams LIMIT 1"))
        any_team_row = any_team_result.fetchone()
        if any_team_row:
            any_team_id = any_team_row[0]
            connection.execute(
                sa.text("UPDATE config SET team_id = :team_id WHERE team_id IS NULL"), {"team_id": any_team_id}
            )
            print(f"✅ Migrated existing configs to team {any_team_id}")
        else:
            # No teams found, delete existing configs
            deleted_count = connection.execute(sa.text("DELETE FROM config WHERE team_id IS NULL")).rowcount
            print(f"⚠️  No teams found, deleted {deleted_count} config entries")
    # ### end Alembic commands ###


def downgrade() -> None:
    """Downgrade schema."""
    connection = op.get_bind()

    # Check existing indexes
    index_result = connection.execute(
        sa.text("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='config'")
    )
    existing_index_names = [row[0] for row in index_result.fetchall()]

    # Check existing columns
    column_result = connection.execute(sa.text("PRAGMA table_info(config)"))
    existing_columns = [row[1] for row in column_result.fetchall()]

    # Drop indexes and constraints outside of batch mode to avoid type inference issues
    # Drop unique constraint (stored as unique index in SQLite)
    if "uq_config_user_team_key" in existing_index_names:
        connection.execute(sa.text("DROP INDEX IF EXISTS uq_config_user_team_key"))

    # Drop indexes
    if "ix_config_team_id" in existing_index_names:
        op.drop_index("ix_config_team_id", table_name="config")
    if "ix_config_user_id" in existing_index_names:
        op.drop_index("ix_config_user_id", table_name="config")
    if "ix_config_key" in existing_index_names:
        op.drop_index("ix_config_key", table_name="config")

    # Drop columns using raw SQL to avoid batch mode type inference issues
    # SQLite doesn't support DROP COLUMN directly, so we recreate the table
    if "team_id" in existing_columns or "user_id" in existing_columns:
        # Create new table without user_id and team_id columns
        connection.execute(
            sa.text("""
                CREATE TABLE config_new (
                    id INTEGER NOT NULL PRIMARY KEY,
                    key VARCHAR NOT NULL,
                    value VARCHAR
                )
            """)
        )
        # Copy data from old table to new table (only id, key, value columns)
        connection.execute(sa.text("INSERT INTO config_new (id, key, value) SELECT id, key, value FROM config"))
        # Drop old table (this also drops all indexes)
        connection.execute(sa.text("DROP TABLE config"))
        # Rename new table to original name
        connection.execute(sa.text("ALTER TABLE config_new RENAME TO config"))
        # Recreate the original unique index on key (it was dropped with the old table)
        op.create_index("ix_config_key", "config", ["key"], unique=True)
    else:
        # If we're not dropping columns, just recreate the unique index on key
        op.create_index("ix_config_key", "config", ["key"], unique=True)
    # ### end Alembic commands ###
