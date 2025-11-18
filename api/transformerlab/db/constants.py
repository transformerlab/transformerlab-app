# --- Centralized Database Configuration ---
from lab import HOME_DIR

db = None  # This will hold the aiosqlite connection
DATABASE_FILE_NAME = f"{HOME_DIR}/llmlab.sqlite3"
DATABASE_URL = f"sqlite+aiosqlite:///{DATABASE_FILE_NAME}"
