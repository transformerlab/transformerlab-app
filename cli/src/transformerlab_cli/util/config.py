import os
import json
import time
from typing import Any
from urllib.parse import urlparse

# 1. Import the centralized console instead of creating a new one
from transformerlab_cli.util.ui import console
from rich.table import Table
import typer

from transformerlab_cli.util.logo import one_liner_logo
from transformerlab_cli.util.ui import render_table
from transformerlab_cli.util.shared import CONFIG_DIR, CONFIG_FILE, set_base_url

VALID_CONFIG_KEYS = ["server", "team_id", "team_name", "user_email", "current_experiment"]
REQUIRED_CONFIG_KEYS = ["server", "team_id", "user_email"]

# We might as well just load the config once and cache it
# to avoid repeated file reads
cached_config = None

# Cached /healthz response so the header doesn't refetch per-process.
# Sentinel: None = not yet attempted; {} = fetch failed (don't retry).
_cached_healthz: dict[str, Any] | None = None


def _get_storage_label() -> str:
    """Return a short storage backend label for the header, e.g. 'aws' or '?'."""
    global _cached_healthz
    if _cached_healthz is None:
        _cached_healthz = {}
        try:
            # Imported lazily so config import doesn't pull httpx at startup
            from transformerlab_cli.util.api import get

            response = get("/healthz", timeout=2.0)
            if response.status_code == 200:
                _cached_healthz = response.json() or {}
        except Exception:
            _cached_healthz = {}

    storage = _cached_healthz.get("storage") if isinstance(_cached_healthz, dict) else None
    if not isinstance(storage, dict):
        return "?"
    provider = storage.get("provider")
    return str(provider) if provider else "?"


def load_config() -> dict[str, Any]:
    """Load config from file, return empty dict if not found.

    If the file exists but cannot be parsed (corrupt/truncated), move it
    aside to config.json.corrupt-<ts> and return {} so the next write
    does not silently overwrite a recoverable file.
    """
    global cached_config

    if cached_config is not None:
        return cached_config

    if not os.path.exists(CONFIG_FILE):
        return {}
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            cached_config = json.loads(f.read())
        return cached_config
    except (json.JSONDecodeError, OSError) as e:
        backup_path = f"{CONFIG_FILE}.corrupt-{int(time.time())}"
        try:
            os.rename(CONFIG_FILE, backup_path)
            console.print(
                f"[error]Error:[/error] Config file is unreadable ({e}). "
                f"Moved to [label]{backup_path}[/label] to avoid overwriting it."
            )
        except OSError as rename_err:
            console.print(
                f"[error]Error:[/error] Config file is unreadable ({e}) and could not be "
                f"backed up ({rename_err}). Refusing to continue."
            )
            raise typer.Exit(1)
        return {}


def _save_config(config: dict[str, Any]) -> bool:
    """Save config to file atomically. Returns True on success.

    Writes to a sibling tmp file and renames over the target so readers
    never observe a truncated or partially-written config.
    """
    global cached_config
    tmp_path = f"{CONFIG_FILE}.tmp"
    try:
        os.makedirs(CONFIG_DIR, exist_ok=True)
        with open(tmp_path, "w", encoding="utf-8") as f:
            f.write(json.dumps(config, indent=2))
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, CONFIG_FILE)
        cached_config = config
        return True
    except OSError as e:
        console.print(f"[error]Error:[/error] Failed to save config: {e}")
        try:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
        except OSError:
            pass
        return False


def list_config(output_format: str = "pretty") -> None:
    """Display all config values in a table."""
    config = load_config()

    if not config:
        if output_format == "json":
            print(json.dumps([]))
        else:
            console.print("[warning]No configuration values set[/warning]")
        return

    json_with_key_value = [{"Key": k, "Value": str(v)} for k, v in sorted(config.items())]

    render_table(
        data=json_with_key_value,
        format_type=output_format,
        table_columns=["Key", "Value"],
        title=None,
    )


def get_config(key: str) -> Any | None:
    """Get a config value by key."""
    config = load_config()
    return config.get(key)


def _validate_url(url: str) -> str | None:
    """Validate URL and ensure no trailing slash. Returns normalized URL or None if invalid."""
    try:
        parsed = urlparse(url)
        if not parsed.scheme or not parsed.netloc:
            return None
        if parsed.scheme not in ("http", "https"):
            return None
        normalized = url.rstrip("/")
        return normalized
    except ValueError:
        return None


def set_config(key: str, value: str, output_format: str = "pretty") -> bool:
    """Set a config value. Returns True on success."""
    if not key:
        if output_format == "json":
            print(json.dumps({"error": "Key cannot be empty"}))
        else:
            console.print("[error]Error:[/error] Key cannot be empty")
        return False
    if not value:
        if output_format == "json":
            print(json.dumps({"error": "Value cannot be empty"}))
        else:
            console.print("[error]Error:[/error] Value cannot be empty")
        return False

    if key not in VALID_CONFIG_KEYS:
        keys_list = ", ".join(VALID_CONFIG_KEYS)
        if output_format == "json":
            print(json.dumps({"error": f"Invalid config key '{key}'", "valid_keys": VALID_CONFIG_KEYS}))
        else:
            console.print(f"[error]Error:[/error] Invalid config key '{key}'")
            console.print(f"[warning]Valid keys:[/warning] {keys_list}")
        return False

    if key == "server":
        normalized_url = _validate_url(value)
        if normalized_url is None:
            if output_format == "json":
                print(json.dumps({"error": f"Invalid URL '{value}'"}))
            else:
                console.print(f"[error]Error:[/error] Invalid URL '{value}'")
                console.print("[warning]URL must start with http:// or https://[/warning]")
            return False
        value = normalized_url

    config = load_config()
    if key == "server" and config.get("server") != value:
        config.pop("current_experiment", None)
    config[key] = value

    if _save_config(config):
        if output_format == "json":
            print(json.dumps({"key": key, "value": value}))
        else:
            console.print(f"[success]✓[/success] Set [label]{key}[/label] = [value]{value}[/value]")
        return True
    return False


def delete_config(key: str) -> bool:
    """Delete a config value. Returns True on success."""
    config = load_config()

    if key not in config:
        console.print(f"[warning]Key '{key}' not found[/warning]")
        return False

    del config[key]

    if _save_config(config):
        console.print(f"[success]✓[/success] Deleted [label]{key}[/label]")
        return True
    return False


def check_configs(output_format: str = "pretty") -> None:
    """Check that required configs are set, warn if not."""
    config = load_config()
    missing_keys = [key for key in REQUIRED_CONFIG_KEYS if key not in config]
    if missing_keys:
        if output_format == "json":
            print(json.dumps({"error": "Missing required configuration keys: " + ", ".join(missing_keys)}))
        else:
            console.print(
                "[warning]Warning:[/warning] The following configuration keys are missing: " + ", ".join(missing_keys)
            )
            login_keys = {"team_id", "user_email"}
            missing_login_keys = [key for key in missing_keys if key in login_keys]
            missing_other_keys = [key for key in missing_keys if key not in login_keys]

            if missing_login_keys:
                console.print(
                    "Missing authentication context (" + ", ".join(missing_login_keys) + "). Please run 'lab login'."
                )
            if missing_other_keys:
                console.print("Use the 'lab config set <key> <value>' command to set: " + ", ".join(missing_other_keys))
        raise typer.Exit(1)

    set_base_url(config.get("server"))

    if output_format == "json":
        # Return nothing because this is usually something
        # that goes before other output
        return

    # Now print really nicely the name of the user, server, team and current experiment
    user_email = config.get("user_email", "N/A")
    team_name = config.get("team_id", "N/A")
    server = config.get("server", "N/A")
    experiment = config.get("current_experiment", "N/A")
    storage = _get_storage_label()

    table = Table(show_header=True, header_style="header", box=None, title_justify="left")

    table.add_column("User Email", style="value")
    table.add_column("Team ID", style="value")
    table.add_column("Server", style="value")
    table.add_column("Experiment", style="value")
    table.add_column("Storage", style="value")

    table.add_row(user_email, team_name, server, experiment, storage)
    console.rule()
    one_liner_logo(console)
    console.print(table)
    console.rule()


def get_current_experiment() -> str | None:
    """Get the current experiment ID from config."""
    config = load_config()
    return config.get("current_experiment", "alpha")


def require_current_experiment() -> str:
    """Get the current experiment ID from config, or exit with a helpful message."""
    from transformerlab_cli.state import cli_state

    check_configs(output_format=cli_state.output_format)
    current_experiment = get_config("current_experiment")
    if not current_experiment or not str(current_experiment).strip():
        console.print(
            "[warning]current_experiment is not set in config. Set it with:[/warning]"
            " [bold]lab config set current_experiment <experiment_name>[/bold]"
        )
        raise typer.Exit(1)
    return str(current_experiment)


def resolve_experiment_id(experiment_id: str | None = None) -> str:
    """Resolve experiment from CLI override or configured default."""
    if experiment_id is not None and str(experiment_id).strip():
        check_configs(output_format="json")
        return str(experiment_id).strip()
    return require_current_experiment()
