import json
from pathlib import Path
from typing import Any

from rich.console import Console
from rich.table import Table

CONFIG_DIR = Path.home() / ".lab"
CONFIG_FILE = CONFIG_DIR / "config.json"

console = Console()


def _load_config() -> dict[str, Any]:
    """Load config from file, return empty dict if not found."""
    if not CONFIG_FILE.exists():
        return {}
    try:
        return json.loads(CONFIG_FILE.read_text())
    except (json.JSONDecodeError, OSError):
        return {}


def _save_config(config: dict[str, Any]) -> bool:
    """Save config to file. Returns True on success."""
    try:
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        CONFIG_FILE.write_text(json.dumps(config, indent=2))
        return True
    except OSError as e:
        console.print(f"[red]Error:[/red] Failed to save config: {e}")
        return False


def list_config() -> None:
    """Display all config values in a table."""
    config = _load_config()

    if not config:
        console.print("[yellow]No configuration values set[/yellow]")
        return

    table = Table(title="Configuration")
    table.add_column("Key", style="cyan")
    table.add_column("Value", style="green")

    for key, value in sorted(config.items()):
        table.add_row(key, str(value))

    console.print(table)


def get_config(key: str) -> Any | None:
    """Get a config value by key."""
    config = _load_config()
    return config.get(key)


def set_config(key: str, value: str) -> bool:
    """Set a config value. Returns True on success."""
    if not key:
        console.print("[red]Error:[/red] Key cannot be empty")
        return False
    if not value:
        console.print("[red]Error:[/red] Value cannot be empty")
        return False

    config = _load_config()
    config[key] = value

    if _save_config(config):
        console.print(f"[green]✓[/green] Set [cyan]{key}[/cyan] = [green]{value}[/green]")
        return True
    return False


def delete_config(key: str) -> bool:
    """Delete a config value. Returns True on success."""
    config = _load_config()

    if key not in config:
        console.print(f"[yellow]Key '{key}' not found[/yellow]")
        return False

    del config[key]

    if _save_config(config):
        console.print(f"[green]✓[/green] Deleted [cyan]{key}[/cyan]")
        return True
    return False
