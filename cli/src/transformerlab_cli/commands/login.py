import typer

from transformerlab_cli.util.auth import set_api_key, fetch_user_info, fetch_user_teams
from transformerlab_cli.util.config import load_config, set_config
from transformerlab_cli.util.shared import DEFAULT_BASE_URL, set_base_url
from transformerlab_cli.util.ui import console


app = typer.Typer()


@app.command()
def login(
    api_key: str = typer.Option(None, "--api-key", help="Your API key"),
    server: str = typer.Option(None, "--server", help="Server URL"),
):
    """Log in to Transformer Lab."""
    # Load config to set the base URL before attempting login
    config = load_config()

    # Ask for server if not provided and not in config
    if not server:
        server = config.get("server")

    if not server:
        server = typer.prompt("Please enter the server URL", default=DEFAULT_BASE_URL)

    # Validate and set server URL
    from transformerlab_cli.util.config import _validate_url

    normalized_url = _validate_url(server)
    if normalized_url is None:
        console.print(f"[error]Error:[/error] Invalid URL '{server}'")
        console.print("[warning]URL must start with http:// or https://[/warning]")
        raise typer.Exit(1)

    server = normalized_url
    set_base_url(server)

    # Save server to config if it changed
    if config.get("server") != server:
        set_config("server", server)

    # Show current server URL
    console.print(f"\n[label]Current server:[/label] [value]{server}[/value]")

    # Ask for API key if not provided
    if not api_key:
        api_key = typer.prompt("Please enter your API key", hide_input=True)

    # Attempt login
    login_success = set_api_key(api_key)

    if not login_success:
        # Even if login fails, show how to change server
        console.print("\n[warning]To change the server URL, run:[/warning]")
        console.print("[bold]  lab config server <SERVER_URL>[/bold]\n")
        console.print("[dim]Example: lab config server http://localhost:8000[/dim]")
        raise typer.Exit(1)

    # Fetch user info and teams after successful login
    with console.status("[bold info]Fetching user information...", spinner="dots"):
        user_info = fetch_user_info(api_key)
        teams_info = fetch_user_teams(api_key)

    if user_info and teams_info:
        # Save user email
        user_email = user_info.get("email")
        if user_email:
            set_config("user_email", user_email)
            console.print(f"[success]✓[/success] User email: [label]{user_email}[/label]")

        # Save team info (prefer OWNER role, otherwise first team)
        teams = teams_info.get("teams", [])
        if teams:
            # Look for OWNER role first
            owner_team = next((t for t in teams if t.get("role") == "OWNER"), None)
            selected_team = owner_team if owner_team else teams[0]

            team_id = selected_team.get("id")
            team_name = selected_team.get("name")

            if team_id:
                set_config("team_id", team_id)
                console.print(f"[success]✓[/success] Team ID: [label]{team_id}[/label]")
            if team_name:
                set_config("team_name", team_name)
                console.print(f"[success]✓[/success] Team name: [label]{team_name}[/label]")

        console.print("\n[success]✓[/success] Login successful!")
    else:
        console.print("[warning]Warning:[/warning] Could not fetch user information, but login was successful.")
