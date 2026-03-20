import typer
from rich.console import Console

from transformerlab_cli.util.auth import set_api_key, fetch_user_info, fetch_user_teams
from transformerlab_cli.util.config import load_config, set_config
from transformerlab_cli.util.shared import set_base_url


app = typer.Typer()
console = Console()


@app.command()
def login(
    api_key: str = typer.Option(None, "--api-key", help="Your API key"),
    server: str = typer.Option(None, "--server", help="Server URL"),
):
    """Log in to Transformer Lab."""
    # Load config to set the base URL before attempting login
    config = load_config()

    # Prompt for server URL, showing current value as default so user can confirm or change it
    if not server:
        default_server = config.get("server") or "http://alpha.lab.cloud:8338"
        server = typer.prompt("Server URL", default=default_server)

    # Validate and set server URL
    from transformerlab_cli.util.config import _validate_url

    normalized_url = _validate_url(server)
    if normalized_url is None:
        console.print(f"[red]Error:[/red] Invalid URL '{server}'")
        console.print("[yellow]URL must start with http:// or https://[/yellow]")
        raise typer.Exit(1)

    server = normalized_url
    set_base_url(server)

    # Save server to config if it changed
    if config.get("server") != server:
        set_config("server", server)

    # Show current server URL
    console.print(f"\n[cyan]Current server:[/cyan] [green]{server}[/green]")

    # Ask for API key if not provided
    if not api_key:
        console.print(
            f"\n[yellow]You can create an API key at:[/yellow] [bold]{server.rstrip('/')}/#/user/api-keys[/bold]"
        )
        api_key = typer.prompt("Please enter your API key", hide_input=True)

    # Attempt login
    login_success = set_api_key(api_key)

    if not login_success:
        # Even if login fails, show how to change server
        console.print("\n[yellow]To change the server URL, run:[/yellow]")
        console.print("[bold]  lab config server <SERVER_URL>[/bold]\n")
        console.print("[dim]Example: lab config server http://localhost:8000[/dim]")
        raise typer.Exit(1)

    # Fetch user info and teams after successful login
    with console.status("[bold cyan]Fetching user information...", spinner="dots"):
        user_info = fetch_user_info(api_key)
        teams_info = fetch_user_teams(api_key)

    if user_info and teams_info:
        # Save user email
        user_email = user_info.get("email")
        if user_email:
            set_config("user_email", user_email)
            console.print(f"[green]✓[/green] User email: [cyan]{user_email}[/cyan]")

        # Save team info
        teams = teams_info.get("teams", [])
        if teams:
            # Prefer the team the API key is scoped to, if provided by the server
            api_key_team_id = user_info.get("api_key_team_id")
            selected_team = None

            if api_key_team_id:
                selected_team = next((t for t in teams if t.get("id") == api_key_team_id), None)

            if not selected_team:
                # Look for owner role first (case-insensitive)
                owner_team = next(
                    (t for t in teams if str(t.get("role", "")).lower() == "owner"),
                    None,
                )
                selected_team = owner_team if owner_team else teams[0]

            team_id = selected_team.get("id")
            team_name = selected_team.get("name")

            if team_id:
                set_config("team_id", team_id)
                console.print(f"[green]✓[/green] Team ID: [cyan]{team_id}[/cyan]")
            if team_name:
                set_config("team_name", team_name)
                console.print(f"[green]✓[/green] Team name: [cyan]{team_name}[/cyan]")

        console.print("\n[green]✓[/green] Login successful!")
    else:
        console.print("[yellow]Warning:[/yellow] Could not fetch user information, but login was successful.")
