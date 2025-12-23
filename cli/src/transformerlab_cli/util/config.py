import json
from typing import Any
from urllib.parse import urlparse

from rich.console import Console
from rich.table import Table
import typer

from transformerlab_cli.util.logo import one_liner_logo
from transformerlab_cli.util.ui import render_table
from transformerlab_cli.util.shared import CONFIG_DIR, CONFIG_FILE, set_base_url

VALID_CONFIG_KEYS = ["server", "team_id", "team_name", "user_email", "current_experiment"]
REQUIRED_CONFIG_KEYS = ["server", "team_id", "user_email"]

console = Console()

# We might as well just load the config once and cache it
# to avoid repeated file reads
cached_config = None


def load_config() -> dict[str, Any]:
    """Load config from file, return empty dict if not found."""
    global cached_config

    if cached_config is not None:
        return cached_config

    if not CONFIG_FILE.exists():
        return {}
    try:
        cached_config = json.loads(CONFIG_FILE.read_text())
        return cached_config
    except (json.JSONDecodeError, OSError):
        return {}


def _save_config(config: dict[str, Any]) -> bool:
    """Save config to file. Returns True on success."""
    global cached_config
    try:
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        CONFIG_FILE.write_text(json.dumps(config, indent=2))
        cached_config = config
        return True
    except OSError as e:
        console.print(f"[red]Error:[/red] Failed to save config: {e}")
        return False


def list_config() -> None:
    """Display all config values in a table."""
    config = load_config()

    if not config:
        console.print("[yellow]No configuration values set[/yellow]")
        return

    json_with_key_value = [{"Key": k, "Value": str(v)} for k, v in sorted(config.items())]

    render_table(
        data=json_with_key_value,
        format_type="pretty",
        table_columns=["Key", "Value"],
        title="Configuration",
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
    except Exception:
        return None


def set_config(key: str, value: str) -> bool:
    """Set a config value. Returns True on success."""
    if not key:
        console.print("[red]Error:[/red] Key cannot be empty")
        return False
    if not value:
        console.print("[red]Error:[/red] Value cannot be empty")
        return False

    if key not in VALID_CONFIG_KEYS:
        keys_list = ", ".join(VALID_CONFIG_KEYS)
        console.print(f"[red]Error:[/red] Invalid config key '{key}'")
        console.print(f"[yellow]Valid keys:[/yellow] {keys_list}")
        return False

    if key == "server":
        normalized_url = _validate_url(value)
        if normalized_url is None:
            console.print(f"[red]Error:[/red] Invalid URL '{value}'")
            console.print("[yellow]URL must start with http:// or https://[/yellow]")
            return False
        value = normalized_url

    config = load_config()
    config[key] = value

    if _save_config(config):
        console.print(f"[green]✓[/green] Set [cyan]{key}[/cyan] = [green]{value}[/green]")
        return True
    return False


def delete_config(key: str) -> bool:
    """Delete a config value. Returns True on success."""
    config = load_config()

    if key not in config:
        console.print(f"[yellow]Key '{key}' not found[/yellow]")
        return False

    del config[key]

    if _save_config(config):
        console.print(f"[green]✓[/green] Deleted [cyan]{key}[/cyan]")
        return True
    return False


def check_configs(output_format: str = "pretty") -> None:
    """Check that required configs are set, warn if not."""
    config = load_config()
    missing_keys = [key for key in REQUIRED_CONFIG_KEYS if key not in config]
    if missing_keys:
        console.print(
            "[yellow]Warning:[/yellow] The following configuration keys are missing: " + ", ".join(missing_keys)
        )
        console.print("Use the 'lab config' command to set them.")
        raise typer.Exit(1)

    set_base_url(config.get("server"))

    if output_format == "json":
        # Return nothing because this is usually something
        # that goes before other output
        return

    # Now print really nicely the name of the user, server and team
    user_email = config.get("user_email", "N/A")
    team_name = config.get("team_id", "N/A")
    server = config.get("server", "N/A")
    experiment = "Not Implemented"
    table = Table(show_header=True, header_style="bold magenta", box=None)
    table.add_column("User Email", style="cyan")
    table.add_column("Team ID", style="cyan")
    table.add_column("Server", style="cyan")
    table.add_column("Experiment", style="cyan")
    table.add_row(user_email, team_name, server, experiment)
    console.rule()
    one_liner_logo(console)
    console.print(table)
    console.rule()


def get_current_experiment() -> str | None:
    """Get the current experiment ID from config."""
    config = load_config()
    return config.get("current_experiment", "alpha")
