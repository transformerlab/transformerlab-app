# --- Centralized Database Configuration ---
import os
from lab import HOME_DIR

db = None  # This will hold the aiosqlite connection (for SQLite) or None (for PostgreSQL)
DATABASE_FILE_NAME = f"{HOME_DIR}/llmlab.sqlite3"

# Check for PostgreSQL configuration via environment variables
DATABASE_HOST = os.getenv("DATABASE_HOST")
DATABASE_PORT = os.getenv("DATABASE_PORT", "5432")
DATABASE_DB = os.getenv("DATABASE_DB")
DATABASE_USER = os.getenv("DATABASE_USER")
DATABASE_PASSWORD = os.getenv("DATABASE_PASSWORD")

# Construct DATABASE_URL based on available configuration
if DATABASE_HOST and DATABASE_DB and DATABASE_USER and DATABASE_PASSWORD:
    # Use PostgreSQL if all required credentials are provided
    DATABASE_URL = (
        f"postgresql+asyncpg://{DATABASE_USER}:{DATABASE_PASSWORD}@{DATABASE_HOST}:{DATABASE_PORT}/{DATABASE_DB}"
    )
    DATABASE_TYPE = "postgresql"
else:
    # Fall back to SQLite (default)
    DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite+aiosqlite:///{DATABASE_FILE_NAME}")
    DATABASE_TYPE = "sqlite"
