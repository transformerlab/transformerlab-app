from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

# Import all models to ensure they're registered with Base.metadata
from transformerlab.shared.models.models import (
    Base,
    Config,
    Plugin,
    TrainingTemplate,
    Workflow,
    WorkflowRun,
    Team,
    UserTeam,
    TeamInvitation,
)

# Import User model which also inherits from Base
try:
    from transformerlab.shared.models.user_model import User
except ImportError:
    # fastapi-users might not be installed in all environments
    pass

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Set target_metadata to Base.metadata for autogenerate support
target_metadata = Base.metadata

# Override sqlalchemy.url from environment or use the one from constants
from transformerlab.db.constants import DATABASE_URL

# Remove the sqlite+aiosqlite:// prefix and use sqlite:// for Alembic
# Alembic needs a synchronous connection URL (uses sqlite3, not aiosqlite)
sync_url = DATABASE_URL.replace("sqlite+aiosqlite:///", "sqlite:///")
config.set_main_option("sqlalchemy.url", sync_url)


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
