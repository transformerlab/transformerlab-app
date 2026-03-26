import json

import httpx
import typer

from transformerlab_cli.util.config import _validate_url, load_config, set_config
from transformerlab_cli.util.shared import DEFAULT_BASE_URL, set_base_url
from transformerlab_cli.util.ui import console


def _server_get(server: str, path: str, timeout: float = 10.0) -> httpx.Response:
    with httpx.Client(timeout=timeout, follow_redirects=True) as client:
        return client.get(f"{server}{path}")


def _server_post_json(server: str, path: str, payload: dict, timeout: float = 30.0) -> httpx.Response:
    with httpx.Client(timeout=timeout, follow_redirects=True) as client:
        return client.post(f"{server}{path}", json=payload)


def _prompt_server_url(existing_server: str | None) -> str:
    server = existing_server or typer.prompt("Server URL", default=DEFAULT_BASE_URL)

    normalized = _validate_url(server)
    if normalized is None:
        console.print(f"[error]Error:[/error] Invalid URL '{server}'")
        console.print("[warning]URL must start with http:// or https://[/warning]")
        raise typer.Exit(1)

    return normalized


def _check_api_running(server: str) -> None:
    with console.status(f"[bold info]Checking API health at {server}...", spinner="dots"):
        try:
            resp = _server_get(server, "/healthz", timeout=10.0)
        except httpx.RequestError as e:
            console.print(f"[error]Error:[/error] Could not connect to server: {e}")
            raise typer.Exit(1)

    if not resp.is_success:
        console.print(f"[error]Error:[/error] Server health check failed (HTTP {resp.status_code})")
        try:
            console.print(resp.text)
        except Exception:
            pass
        raise typer.Exit(1)


def _maybe_create_first_user(server: str) -> None:
    # Check bootstrap status (no auth required)
    with console.status("[bold info]Checking first-user setup status...", spinner="dots"):
        try:
            status_resp = _server_get(server, "/auth/setup/status", timeout=10.0)
        except httpx.RequestError as e:
            console.print(f"[error]Error:[/error] Could not connect to server: {e}")
            raise typer.Exit(1)

    if status_resp.is_success:
        try:
            data = status_resp.json()
        except Exception:
            data = {}
        if data.get("has_users") is True:
            console.print("[success]✓[/success] Server already has at least one user.")
            return

    console.print("\n[bold header]First Admin User Setup[/bold header]")
    console.print("[dim]This is a one-time step for fresh installs.[/dim]")

    email = typer.prompt("Admin email", default="admin@example.com")
    password = typer.prompt("Admin password", hide_input=True, confirmation_prompt=True)
    first_name = typer.prompt("First name (optional)", default="", show_default=False)
    last_name = typer.prompt("Last name (optional)", default="", show_default=False)

    payload = {
        "email": email,
        "password": password,
        "confirm_password": password,
        "first_name": first_name.strip() or None,
        "last_name": last_name.strip() or None,
    }

    with console.status("[bold info]Creating first user...", spinner="dots"):
        try:
            create_resp = _server_post_json(server, "/auth/setup/create-first-user", payload, timeout=30.0)
        except httpx.RequestError as e:
            console.print(f"[error]Error:[/error] Could not connect to server: {e}")
            raise typer.Exit(1)

    if create_resp.status_code == 409:
        console.print("[success]✓[/success] First-user setup already complete (a user already exists).")
        return

    if not create_resp.is_success:
        console.print(f"[error]Error:[/error] First-user setup failed (HTTP {create_resp.status_code})")
        try:
            detail = create_resp.json()
            console.print(json.dumps(detail, indent=2))
        except Exception:
            console.print(create_resp.text)
        raise typer.Exit(1)

    console.print("[success]✓[/success] First admin user created.")


def _prompt_and_save_api_key(server: str) -> None:
    from transformerlab_cli.util.auth import fetch_user_info, fetch_user_teams, set_api_key

    console.print("\n[bold header]API Key Setup[/bold header]")
    console.print("[dim]Create an API key in the web UI, then paste it here.[/dim]")
    console.print(f"[yellow]API keys page:[/yellow] [bold]{server.rstrip('/')}/#/user/api-keys[/bold]")

    key = typer.prompt("API key", hide_input=True)

    ok = set_api_key(key)
    if not ok:
        raise typer.Exit(1)

    with console.status("[bold info]Fetching user + team info...", spinner="dots"):
        user_info = fetch_user_info(key)
        teams_info = fetch_user_teams(key)

    if not user_info or not teams_info:
        console.print("[warning]Warning:[/warning] API key saved, but could not fetch user/team info.")
        return

    user_email = user_info.get("email")
    if user_email:
        set_config("user_email", user_email)
        console.print(f"[success]✓[/success] User email: [label]{user_email}[/label]")

    teams = teams_info.get("teams", [])
    if not teams:
        console.print("[warning]Warning:[/warning] No teams found for this user.")
        return

    api_key_team_id = user_info.get("api_key_team_id")
    selected_team = None
    if api_key_team_id:
        selected_team = next((t for t in teams if t.get("id") == api_key_team_id), None)
    if not selected_team:
        owner_team = next((t for t in teams if str(t.get("role", "")).lower() == "owner"), None)
        selected_team = owner_team if owner_team else teams[0]

    team_id = selected_team.get("id")
    team_name = selected_team.get("name")

    if team_id:
        set_config("team_id", team_id)
        console.print(f"[success]✓[/success] Team ID: [label]{team_id}[/label]")
    if team_name:
        set_config("team_name", team_name)
        console.print(f"[success]✓[/success] Team name: [label]{team_name}[/label]")


def command_setup() -> None:
    """
    Interactive setup wizard:
    - Configure server URL
    - Verify API is reachable
    - Bootstrap first admin user if needed
    - Save API key + team/user context
    """
    console.print("\n[bold header]Transformer Lab CLI Setup[/bold header]")

    config = load_config()
    server = _prompt_server_url(config.get("server"))

    # Apply and persist server URL before any further steps
    set_base_url(server)
    if config.get("server") != server:
        set_config("server", server)

    console.print(f"\n[label]Current server:[/label] [value]{server}[/value]")

    _check_api_running(server)
    console.print("[success]✓[/success] API is reachable.")

    _maybe_create_first_user(server)

    _prompt_and_save_api_key(server)

    console.print("\n[success]Setup complete.[/success]")
