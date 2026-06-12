"""`lab profile` — inspect and manage CLI profiles.

Selection is per-process via the global `--profile` flag / `LAB_PROFILE` env var, so there
is intentionally no `use` subcommand here.
"""

import json
import os

import typer

from transformerlab_cli.state import cli_state
from transformerlab_cli.util import profile as profile_util
from transformerlab_cli.util.config import load_config
from transformerlab_cli.util.ui import console, render_table, exit_with_no_results

app = typer.Typer(help="Manage CLI profiles (server + team + credentials).")


def _fail(message: str, format_type: str) -> None:
    if format_type == "json":
        print(json.dumps({"error": message}))
    else:
        console.print(f"[error]Error:[/error] {message}")
    raise typer.Exit(1)


def _read_other(name: str, format_type: str) -> dict:
    """Read another profile's config.json directly (without switching the active profile).

    A corrupt/unreadable file fails cleanly (matching the json-mode error contract) rather
    than raising an uncaught traceback the way a bare json.loads would.
    """
    path = profile_util.config_path(name)
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.loads(f.read())
    except (json.JSONDecodeError, OSError):
        _fail(f"Profile '{name}' has an unreadable config.json.", format_type)


@app.command("list")
def list_profiles(format: str = typer.Option(None, "--format")) -> None:
    """List all profiles, marking the active one and which have saved credentials."""
    format_type = format or cli_state.output_format
    active = profile_util.current_profile_name()
    rows = [
        {
            "name": name,
            "active": name == active,
            "has_credentials": profile_util.profile_has_credentials(name),
        }
        for name in profile_util.list_profiles()
    ]
    if format_type == "json":
        print(json.dumps(rows))
        return
    display = [
        {
            "Profile": ("* " if r["active"] else "  ") + r["name"],
            "Active": "yes" if r["active"] else "",
            "Credentials": "yes" if r["has_credentials"] else "no",
        }
        for r in rows
    ]
    render_table(display, format_type, ["Profile", "Active", "Credentials"], title="Profiles")


@app.command("show")
def show_profile(
    name: str = typer.Argument(None, help="Profile to show (defaults to the active profile)."),
    format: str = typer.Option(None, "--format"),
) -> None:
    """Show a profile's server / team / user / experiment."""
    format_type = format or cli_state.output_format
    active = profile_util.current_profile_name()
    target = name or active
    cfg = load_config() if target == active else _read_other(target, format_type)
    if not cfg:
        exit_with_no_results(format_type, f"Profile '{target}' has no configuration.")
    out = {
        "name": target,
        "server": cfg.get("server"),
        "team_id": cfg.get("team_id"),
        "team_name": cfg.get("team_name"),
        "user_email": cfg.get("user_email"),
        "current_experiment": cfg.get("current_experiment"),
        "has_credentials": profile_util.profile_has_credentials(target),
    }
    if format_type == "json":
        print(json.dumps(out))
        return
    rows = [{"Key": k, "Value": "" if v is None else str(v)} for k, v in out.items()]
    render_table(rows, format_type, ["Key", "Value"], title=f"Profile: {target}")


@app.command("delete")
def delete_profile(
    name: str = typer.Argument(..., help="Profile to delete."),
    yes: bool = typer.Option(False, "--yes", "-y", help="Skip the confirmation prompt."),
) -> None:
    """Delete a named profile directory. The 'default' profile cannot be deleted."""
    format_type = cli_state.output_format
    if not yes and not cli_state.no_interactive:
        if not typer.confirm(f"Delete profile '{name}'? This removes its config and credentials."):
            raise typer.Exit(0)
    try:
        profile_util.delete_profile(name)
    except ValueError as e:
        _fail(str(e), format_type)
    if format_type == "json":
        print(json.dumps({"deleted": name}))
    else:
        console.print(f"[success]✓[/success] Deleted profile [label]{name}[/label]")
