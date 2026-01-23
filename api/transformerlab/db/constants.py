# --- Centralized Database Configuration ---
import os
from lab import HOME_DIR

db = None  # This will hold the aiosqlite connection (for SQLite) or None (for PostgreSQL)
DATABASE_FILE_NAME = f"{HOME_DIR}/llmlab.sqlite3"

# Check for PostgreSQL configuration via environment variables
POSTGRES_HOST = os.getenv("POSTGRES_HOST")
POSTGRES_PORT = os.getenv("POSTGRES_PORT", "5432")
POSTGRES_DB = os.getenv("POSTGRES_DB")
POSTGRES_USER = os.getenv("POSTGRES_USER")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD")

# Construct DATABASE_URL based on available configuration
if POSTGRES_HOST and POSTGRES_DB and POSTGRES_USER and POSTGRES_PASSWORD:
    # Use PostgreSQL if all required credentials are provided
    DATABASE_URL = (
        f"postgresql+asyncpg://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"
    )
    DATABASE_TYPE = "postgresql"
else:
    # Fall back to SQLite (default)
    DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite+aiosqlite:///{DATABASE_FILE_NAME}")
    DATABASE_TYPE = "sqlite"
