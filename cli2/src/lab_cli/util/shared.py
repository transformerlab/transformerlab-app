from pathlib import Path

BASE_URL = "http://alpha.lab.cloud:8338"

CREDENTIALS_DIR = Path.home() / ".lab"
CREDENTIALS_FILE = CREDENTIALS_DIR / "credentials"
AUTH_URL = f"{BASE_URL}/server/info"

CONFIG_DIR = Path.home() / ".lab"
CONFIG_FILE = CONFIG_DIR / "config.json"
