import os

DEFAULT_BASE_URL = "http://alpha.lab.cloud:8338"
_BASE_URL = DEFAULT_BASE_URL

# Timeout defaults (seconds)
DEFAULT_TIMEOUT = 10.0
DEFAULT_UPLOAD_TIMEOUT = 60.0

CREDENTIALS_DIR = os.path.join(os.path.expanduser("~"), ".lab")
CREDENTIALS_FILE = os.path.join(CREDENTIALS_DIR, "credentials")

CONFIG_DIR = os.path.join(os.path.expanduser("~"), ".lab")
CONFIG_FILE = os.path.join(CONFIG_DIR, "config.json")


def set_base_url(url: str | None) -> None:
    """Set the base URL for the API."""
    global _BASE_URL

    if url is None or url.strip() == "":
        _BASE_URL = DEFAULT_BASE_URL
    else:
        _BASE_URL = url


def BASE_URL() -> str:
    return _BASE_URL


def AUTH_URL() -> str:
    return BASE_URL() + "/users/me"
