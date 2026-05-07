import typer

from transformerlab_cli.util.auth import set_api_key, fetch_user_info, fetch_user_teams
from transformerlab_cli.util.browser_login import run_browser_login, BrowserLoginError
from transformerlab_cli.util.config import load_config, set_config
from transformerlab_cli.util.shared import DEFAULT_BASE_URL, set_base_url
from transformerlab_cli.util.ui import console


app = typer.Typer()


@app.command()
def login(
    api_key: str = typer.Option(None, "--api-key", help="API key (skips browser flow; for CI/headless)."),
    server: str = typer.Option(None, "--server", help="Server URL"),
    no_browser: bool = typer.Option(False, "--no-browser", help="Print the login URL instead of opening a browser."),
):
    """Log in to Transformer Lab."""
    config = load_config()

    if not server:
        server = config.get("server")
    if not server:
        server = typer.prompt("Please enter the server URL", default=DEFAULT_BASE_URL)

    from transformerlab_cli.util.config import _validate_url

    normalized_url = _validate_url(server)
    if normalized_url is None:
        console.print(f"[error]Error:[/error] Invalid URL '{server}'")
        console.print("[warning]URL must start with http:// or https://[/warning]")
        raise typer.Exit(1)

    server = normalized_url
    set_base_url(server)

    if config.get("server") != server:
        set_config("server", server)

    console.print(f"\n[label]Current server:[/label] [value]{server}[/value]")

    browser_team_id = None
    browser_team_name = None

    if not api_key:
        # Default path: browser-based login.
        try:
            result = run_browser_login(server_url=server, open_browser=not no_browser)
        except BrowserLoginError as e:
            console.print(f"[error]Error:[/error] {e}")
            console.print("[warning]Tip:[/warning] use [bold]lab login --api-key <KEY>[/bold] for headless/CI.")
            raise typer.Exit(1)

        api_key = result["api_key"]
        browser_team_id = result.get("team_id")
        browser_team_name = result.get("team_name")

    # Validate the key (works for both paths).
    if not set_api_key(api_key):
        console.print("\n[warning]To change the server URL, run:[/warning]")
        console.print("[bold]  lab config server <SERVER_URL>[/bold]\n")
        raise typer.Exit(1)

    with console.status("[bold info]Fetching user information...", spinner="dots"):
        user_info = fetch_user_info(api_key)
        teams_info = fetch_user_teams(api_key)

    if user_info and teams_info:
        user_email = user_info.get("email")
        if user_email:
            set_config("user_email", user_email)
            console.print(f"[success]✓[/success] User email: [label]{user_email}[/label]")

        teams = teams_info.get("teams", [])
        selected_team = None

        # 1. Prefer team selected in the browser flow.
        if browser_team_id:
            selected_team = next((t for t in teams if t.get("id") == browser_team_id), None)

        # 2. Fall back to api_key_team_id from the server (paste flow).
        if not selected_team:
            api_key_team_id = user_info.get("api_key_team_id")
            if api_key_team_id:
                selected_team = next((t for t in teams if t.get("id") == api_key_team_id), None)

        # 3. Fall back to owner team, then first team.
        if not selected_team and teams:
            owner_team = next(
                (t for t in teams if str(t.get("role", "")).lower() == "owner"),
                None,
            )
            selected_team = owner_team if owner_team else teams[0]

        if selected_team:
            team_id = selected_team.get("id")
            team_name = selected_team.get("name") or browser_team_name
            if team_id:
                set_config("team_id", team_id)
                console.print(f"[success]✓[/success] Team ID: [label]{team_id}[/label]")
            if team_name:
                set_config("team_name", team_name)
                console.print(f"[success]✓[/success] Team name: [label]{team_name}[/label]")

        console.print("\n[success]✓[/success] Login successful!")
    else:
        console.print("[warning]Warning:[/warning] Could not fetch user information, but login was successful.")
