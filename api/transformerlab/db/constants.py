# --- Centralized Database Configuration ---
import os
from lab import HOME_DIR

db = None  # This will hold the aiosqlite connection
DATABASE_FILE_NAME = f"{HOME_DIR}/llmlab.sqlite3"
# Allow DATABASE_URL to be overridden by environment variable (useful for testing)
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite+aiosqlite:///{DATABASE_FILE_NAME}")
