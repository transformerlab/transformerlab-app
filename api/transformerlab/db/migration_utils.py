"""
Utility functions for Alembic migrations.

Keep this clean and isolated. Do NOT import Transformer Lab stuff in here.
"""

import sqlalchemy as sa


def table_exists(connection, table_name: str) -> bool:
    """
    Check if a table exists in the database.

    Supports SQLite, PostgreSQL, and a generic case for
    other SQL databases via information_schema.

    Args:
        connection: The database connection from op.get_bind()
        table_name: The name of the table to check

    Returns:
        bool: True if table exists, False otherwise
    """
    dialect_name = connection.dialect.name

    if dialect_name == "sqlite":
        # SQLite-specific query
        result = connection.execute(
            sa.text("SELECT name FROM sqlite_master WHERE type='table' AND name=:name"), {"name": table_name}
        )
    elif dialect_name == "postgresql":
        # PostgreSQL-specific query
        result = connection.execute(
            sa.text("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename=:name"),
            {"name": table_name},
        )
    else:
        # Fallback to standard information_schema (works for most databases)
        result = connection.execute(
            sa.text(
                "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name=:name"
            ),
            {"name": table_name},
        )

    return result.fetchone() is not None
