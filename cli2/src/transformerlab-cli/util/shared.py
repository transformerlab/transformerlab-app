from pathlib import Path

DEFAULT_BASE_URL = "http://alpha.lab.cloud:8338"
_BASE_URL = "http://alpha.lab.cloud:8338"

CREDENTIALS_DIR = Path.home() / ".lab"
CREDENTIALS_FILE = CREDENTIALS_DIR / "credentials"

CONFIG_DIR = Path.home() / ".lab"
CONFIG_FILE = CONFIG_DIR / "config.json"


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
    return BASE_URL() + "/server/info"
