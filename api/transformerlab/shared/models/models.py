import enum
import uuid

from fastapi_users.db import SQLAlchemyBaseOAuthAccountTableUUID, SQLAlchemyBaseUserTableUUID
from sqlalchemy import JSON, UUID, DateTime, Index, Integer, String, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Config(Base):
    """Configuration key-value store model."""

    __tablename__ = "config"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    key: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    value: Mapped[str | None] = mapped_column(String, nullable=True)


class Workflow(Base):
    """Workflow model."""

    __tablename__ = "workflows"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str | None] = mapped_column(String, nullable=True)
    config: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str | None] = mapped_column(String, index=True, nullable=True)
    experiment_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (Index("idx_workflow_id_experiment", "id", "experiment_id"),)


class WorkflowRun(Base):
    """Run of a workflow"""

    __tablename__ = "workflow_runs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    workflow_id: Mapped[int] = mapped_column(Integer, nullable=True)
    workflow_name: Mapped[str | None] = mapped_column(String, nullable=True)
    job_ids: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    node_ids: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str | None] = mapped_column(String, index=True, nullable=True)
    current_tasks: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    current_job_ids: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    experiment_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )


class Team(Base):
    """Team model."""

    __tablename__ = "teams"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String, nullable=False)


class TeamRole(str, enum.Enum):
    """Enum for user roles within a team."""

    OWNER = "owner"
    MEMBER = "member"


class UserTeam(Base):
    """User-Team association model."""

    __tablename__ = "users_teams"

    user_id: Mapped[str] = mapped_column(String, primary_key=True)
    team_id: Mapped[str] = mapped_column(String, primary_key=True)
    role: Mapped[str] = mapped_column(String, nullable=False, default=TeamRole.MEMBER.value)


class InvitationStatus(str, enum.Enum):
    """Enum for invitation status."""

    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class TeamInvitation(Base):
    """Team invitation model for pending invitations."""

    __tablename__ = "team_invitations"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    token: Mapped[str] = mapped_column(
        String, unique=True, index=True, nullable=False, default=lambda: str(uuid.uuid4())
    )
    email: Mapped[str] = mapped_column(String, nullable=False, index=True)
    team_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    invited_by_user_id: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False, default=TeamRole.MEMBER.value)
    status: Mapped[str] = mapped_column(
        String, nullable=False, default=InvitationStatus.PENDING.value, index=True
    )
    expires_at: Mapped[DateTime] = mapped_column(DateTime, nullable=False)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )


class ProviderType(str, enum.Enum):
    """Enum for provider types."""

    SLURM = "slurm"
    SKYPILOT = "skypilot"


class TeamComputeProvider(Base):
    """Team compute provider model for managing compute providers per team."""

    __tablename__ = "compute_providers"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    team_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    type: Mapped[str] = mapped_column(String, nullable=False, index=True)  # ProviderType enum value
    config: Mapped[dict | None] = mapped_column(
        JSON, nullable=False
    )  # Provider configuration (credentials, endpoints, etc.)
    created_by_user_id: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (Index("idx_compute_provider_name", "team_id", "name"),)


# User and OAuth Account models
class User(SQLAlchemyBaseUserTableUUID, Base):
    """
    User database model. Inherits from SQLAlchemyBaseUserTableUUID which provides:
    - id (UUID primary key)
    - email (unique, indexed)
    - hashed_password
    - is_active (boolean)
    - is_superuser (boolean)
    - is_verified (boolean)
    """

    __tablename__ = "user"

    first_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(100), nullable=True)

    oauth_accounts: Mapped[list["OAuthAccount"]] = relationship(
        "OAuthAccount", primaryjoin="User.id == foreign(OAuthAccount.user_id)", lazy="joined"
    )


class OAuthAccount(SQLAlchemyBaseOAuthAccountTableUUID, Base):
    """
    OAuth account model for linking OAuth providers to users.
    Stores OAuth provider info (Google, etc.) linked to our users.
    """

    __tablename__ = "oauth_account"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
