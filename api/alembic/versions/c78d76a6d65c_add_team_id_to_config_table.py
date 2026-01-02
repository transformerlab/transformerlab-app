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

    # For SQLite, use batch mode to handle constraint/index changes
    with op.batch_alter_table("config", schema=None) as batch_op:
        # Check if ix_config_key is unique (old schema) - if so, drop it to recreate as non-unique
        # We need to check the index definition to see if it's unique
        # For simplicity, if the index exists, we'll drop and recreate it as non-unique
        # (This is safe because we're changing from unique to non-unique)
        ix_config_key_exists = "ix_config_key" in existing_index_names
        if ix_config_key_exists:
            try:
                batch_op.drop_index("ix_config_key")
            except Exception:
                pass  # Index might not exist in batch context

        # Create new indexes (non-unique)
        # Always create ix_config_key (either it was dropped above, or it didn't exist)
        batch_op.create_index("ix_config_key", ["key"], unique=False)
        if "ix_config_user_id" not in existing_index_names:
            batch_op.create_index("ix_config_user_id", ["user_id"], unique=False)
        if "ix_config_team_id" not in existing_index_names:
            batch_op.create_index("ix_config_team_id", ["team_id"], unique=False)

        # Check if unique constraint already exists
        # SQLite stores unique constraints as unique indexes
        if "uq_config_user_team_key" not in existing_index_names:
            batch_op.create_unique_constraint("uq_config_user_team_key", ["user_id", "team_id", "key"])

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

    # For SQLite, use batch mode to handle constraint/index/column changes
    with op.batch_alter_table("config", schema=None) as batch_op:
        # Drop unique constraint (stored as unique index in SQLite)
        if "uq_config_user_team_key" in existing_index_names:
            batch_op.drop_constraint("uq_config_user_team_key", type_="unique")

        # Drop indexes
        if "ix_config_team_id" in existing_index_names:
            batch_op.drop_index("ix_config_team_id")
        if "ix_config_user_id" in existing_index_names:
            batch_op.drop_index("ix_config_user_id")
        if "ix_config_key" in existing_index_names:
            batch_op.drop_index("ix_config_key")

        # Recreate the original unique index on key
        batch_op.create_index("ix_config_key", ["key"], unique=True)

        # Drop columns (SQLite requires batch mode for dropping columns)
        if "team_id" in existing_columns:
            batch_op.drop_column("team_id")
        if "user_id" in existing_columns:
            batch_op.drop_column("user_id")
    # ### end Alembic commands ###
