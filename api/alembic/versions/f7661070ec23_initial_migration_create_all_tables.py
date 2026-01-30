"""Initial migration - create all tables

Revision ID: f7661070ec23
Revises:
Create Date: 2025-11-21 15:04:59.420186

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

from transformerlab.db.migration_utils import table_exists

# revision identifiers, used by Alembic.
revision: str = "f7661070ec23"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create all initial tables."""
    connection = op.get_bind()

    # Config table
    if not table_exists(connection, "config"):
        op.create_table(
            "config",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("key", sa.String(), nullable=False),
            sa.Column("value", sa.String(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("key"),
        )
        op.create_index(op.f("ix_config_key"), "config", ["key"], unique=True)

    # Plugin table
    if table_exists(connection, "plugins"):
        # Drop all indexes on the table
        op.drop_index(op.f("ix_plugins_name"), table_name="plugins", if_exists=True)
        op.drop_index(op.f("ix_plugins_type"), table_name="plugins", if_exists=True)
        # Drop the table
        op.drop_table("plugins")
        # Create the table again
        # op.create_table(
        #     "plugins",
        #     sa.Column("id", sa.Integer(), nullable=False),
        #     sa.Column("name", sa.String(), nullable=False),
        #     sa.Column("type", sa.String(), nullable=False),
        #     sa.PrimaryKeyConstraint("id"),
        #     sa.UniqueConstraint("name"),
        # )
        # op.create_index(op.f("ix_plugins_name"), "plugins", ["name"], unique=True)
        # op.create_index(op.f("ix_plugins_type"), "plugins", ["type"], unique=False)

    # TrainingTemplate table
    if table_exists(connection, "training_template"):
        # Drop all indexes on the table
        op.drop_index(op.f("ix_training_template_name"), table_name="training_template", if_exists=True)
        op.drop_index(op.f("ix_training_template_created_at"), table_name="training_template", if_exists=True)
        op.drop_index(op.f("ix_training_template_type"), table_name="training_template", if_exists=True)
        op.drop_index(op.f("ix_training_template_updated_at"), table_name="training_template", if_exists=True)
        # Drop the table
        op.drop_table("training_template")
        # Create the table again
        # op.create_table(
        #     "training_template",
        #     sa.Column("id", sa.Integer(), nullable=False),
        #     sa.Column("name", sa.String(), nullable=False),
        #     sa.Column("description", sa.String(), nullable=True),
        #     sa.Column("type", sa.String(), nullable=True),
        #     sa.Column("datasets", sa.String(), nullable=True),
        #     sa.Column("config", sa.String(), nullable=True),
        #     sa.Column("created_at", sa.DateTime(), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        #     sa.Column("updated_at", sa.DateTime(), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        #     sa.PrimaryKeyConstraint("id"),
        #     sa.UniqueConstraint("name"),
        # )
        # op.create_index(op.f("ix_training_template_name"), "training_template", ["name"], unique=True)
        # op.create_index(op.f("ix_training_template_created_at"), "training_template", ["created_at"], unique=False)
        # op.create_index(op.f("ix_training_template_type"), "training_template", ["type"], unique=False)
        # op.create_index(op.f("ix_training_template_updated_at"), "training_template", ["updated_at"], unique=False)

    # Workflow table
    if not table_exists(connection, "workflows"):
        op.create_table(
            "workflows",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(), nullable=True),
            sa.Column("config", sa.JSON(), nullable=True),
            sa.Column("status", sa.String(), nullable=True),
            sa.Column("experiment_id", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_workflows_status"), "workflows", ["status"], unique=False)
        op.create_index("idx_workflow_id_experiment", "workflows", ["id", "experiment_id"], unique=False)

    # WorkflowRun table
    if not table_exists(connection, "workflow_runs"):
        op.create_table(
            "workflow_runs",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("workflow_id", sa.Integer(), nullable=True),
            sa.Column("workflow_name", sa.String(), nullable=True),
            sa.Column("job_ids", sa.JSON(), nullable=True),
            sa.Column("node_ids", sa.JSON(), nullable=True),
            sa.Column("status", sa.String(), nullable=True),
            sa.Column("current_tasks", sa.JSON(), nullable=True),
            sa.Column("current_job_ids", sa.JSON(), nullable=True),
            sa.Column("experiment_id", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_workflow_runs_status"), "workflow_runs", ["status"], unique=False)

    # Team table
    if not table_exists(connection, "teams"):
        op.create_table(
            "teams",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )

    # UserTeam table
    if not table_exists(connection, "users_teams"):
        op.create_table(
            "users_teams",
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("team_id", sa.String(), nullable=False),
            sa.Column("role", sa.String(), nullable=False),
            sa.PrimaryKeyConstraint("user_id", "team_id"),
        )

    # TeamInvitation table
    if not table_exists(connection, "team_invitations"):
        op.create_table(
            "team_invitations",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("token", sa.String(), nullable=False),
            sa.Column("email", sa.String(), nullable=False),
            sa.Column("team_id", sa.String(), nullable=False),
            sa.Column("invited_by_user_id", sa.String(), nullable=False),
            sa.Column("role", sa.String(), nullable=False),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("token"),
        )
        op.create_index(op.f("ix_team_invitations_email"), "team_invitations", ["email"], unique=False)
        op.create_index(op.f("ix_team_invitations_status"), "team_invitations", ["status"], unique=False)
        op.create_index(op.f("ix_team_invitations_team_id"), "team_invitations", ["team_id"], unique=False)
        op.create_index(op.f("ix_team_invitations_token"), "team_invitations", ["token"], unique=True)

    # User table (from fastapi-users)
    # Check if table exists first to avoid errors on existing databases
    if not table_exists(connection, "user"):
        # Create new user table with correct schema
        op.create_table(
            "user",
            sa.Column("id", sa.CHAR(length=36), nullable=False),
            sa.Column("email", sa.String(length=320), nullable=False),
            sa.Column("hashed_password", sa.String(length=1024), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
            sa.Column("is_superuser", sa.Boolean(), nullable=False, server_default=sa.text("0")),
            sa.Column("is_verified", sa.Boolean(), nullable=False, server_default=sa.text("0")),
            sa.Column("first_name", sa.String(length=100), nullable=True),
            sa.Column("last_name", sa.String(length=100), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_user_email"), "user", ["email"], unique=True)
    else:
        # Table exists - check the schema
        result = connection.execute(sa.text("PRAGMA table_info(user)"))
        existing_columns = [row[1] for row in result.fetchall()]

        # Check if it's the old schema with 'name' column instead of 'first_name'/'last_name'
        has_old_schema = "name" in existing_columns and (
            "first_name" not in existing_columns or "last_name" not in existing_columns
        )

        if has_old_schema:
            # Drop the old table and create a new one with correct schema
            # Note: This will lose user data, but the schema is incompatible
            op.drop_index(op.f("ix_user_email"), table_name="user", if_exists=True)
            op.drop_table("user")

            # Create new user table with correct schema
            op.create_table(
                "user",
                sa.Column("id", sa.CHAR(length=36), nullable=False),
                sa.Column("email", sa.String(length=320), nullable=False),
                sa.Column("hashed_password", sa.String(length=1024), nullable=False),
                sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
                sa.Column("is_superuser", sa.Boolean(), nullable=False, server_default=sa.text("0")),
                sa.Column("is_verified", sa.Boolean(), nullable=False, server_default=sa.text("0")),
                sa.Column("first_name", sa.String(length=100), nullable=True),
                sa.Column("last_name", sa.String(length=100), nullable=True),
                sa.PrimaryKeyConstraint("id"),
            )
            op.create_index(op.f("ix_user_email"), "user", ["email"], unique=True)
        else:
            # Schema is compatible - just add missing columns if needed
            if "first_name" not in existing_columns:
                op.add_column("user", sa.Column("first_name", sa.String(length=100), nullable=True))
            if "last_name" not in existing_columns:
                op.add_column("user", sa.Column("last_name", sa.String(length=100), nullable=True))


def downgrade() -> None:
    """Drop all tables."""
    op.drop_index(op.f("ix_team_invitations_token"), table_name="team_invitations", if_exists=True)
    op.drop_index(op.f("ix_team_invitations_team_id"), table_name="team_invitations", if_exists=True)
    op.drop_index(op.f("ix_team_invitations_status"), table_name="team_invitations", if_exists=True)
    op.drop_index(op.f("ix_team_invitations_email"), table_name="team_invitations", if_exists=True)
    op.drop_table("team_invitations", if_exists=True)
    op.drop_table("users_teams", if_exists=True)
    op.drop_table("teams", if_exists=True)
    op.drop_index(op.f("ix_workflow_runs_status"), table_name="workflow_runs", if_exists=True)
    op.drop_table("workflow_runs", if_exists=True)
    op.drop_index("idx_workflow_id_experiment", table_name="workflows", if_exists=True)
    op.drop_index(op.f("ix_workflows_status"), table_name="workflows", if_exists=True)
    op.drop_table("workflows", if_exists=True)

    op.drop_index(op.f("ix_config_key"), table_name="config", if_exists=True)
    op.drop_table("config", if_exists=True)
    # User table - only drop if it was created by this migration
    try:
        op.drop_index(op.f("ix_user_email"), table_name="user", if_exists=True)
        op.drop_table("user", if_exists=True)
    except Exception:
        pass
