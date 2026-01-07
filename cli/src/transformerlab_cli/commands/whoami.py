import typer
from rich.console import Console
from rich.table import Table

from transformerlab_cli.util.auth import get_api_key, fetch_user_info, fetch_user_teams
from transformerlab_cli.util.config import load_config
from transformerlab_cli.util.shared import BASE_URL, set_base_url
from transformerlab_cli.state import cli_state

app = typer.Typer()
console = Console()


@app.command()
def whoami():
    """Show current logged in user information."""
    # Check if API key exists
    api_key = get_api_key()
    if not api_key:
        console.print("[red]Error:[/red] Not logged in. Please run 'lab login' first.")
        raise typer.Exit(1)
    
    # Load config for server URL
    config = load_config()
    if config.get("server"):
        set_base_url(config.get("server"))
    
    # Fetch user info
    with console.status("[bold cyan]Fetching user information...", spinner="dots"):
        user_info = fetch_user_info(api_key)
        teams_info = fetch_user_teams(api_key)
    
    if not user_info:
        console.print("[red]Error:[/red] Could not fetch user information. Please check your API key and server connection.")
        raise typer.Exit(1)
    
    # Display user info
    if cli_state.output_format == "json":
        import json
        output = {
            "user": user_info,
            "teams": teams_info.get("teams", []) if teams_info else [],
            "server": BASE_URL(),
        }
        console.print(json.dumps(output, indent=2))
    else:
        # Pretty format
        table = Table(show_header=False, box=None, padding=(0, 2))
        table.add_column("Field", style="cyan", no_wrap=True)
        table.add_column("Value", style="green")
        
        # User info
        table.add_row("Email", user_info.get("email", "N/A"))
        table.add_row("User ID", str(user_info.get("id", "N/A")))
        if user_info.get("first_name") or user_info.get("last_name"):
            name = f"{user_info.get('first_name', '')} {user_info.get('last_name', '')}".strip()
            table.add_row("Name", name)
        table.add_row("Active", "Yes" if user_info.get("is_active") else "No")
        table.add_row("Verified", "Yes" if user_info.get("is_verified") else "No")
        table.add_row("Superuser", "Yes" if user_info.get("is_superuser") else "No")
        table.add_row("Server", BASE_URL())
        
        # Teams info
        if teams_info and teams_info.get("teams"):
            teams = teams_info.get("teams", [])
            team_names = [f"{t.get('name', 'N/A')} ({t.get('role', 'N/A')})" for t in teams]
            table.add_row("Teams", ", ".join(team_names))
            
            # Show current team from config
            current_team_id = config.get("team_id")
            if current_team_id:
                current_team = next((t for t in teams if t.get("id") == current_team_id), None)
                if current_team:
                    table.add_row("Current Team", f"{current_team.get('name', 'N/A')} ({current_team.get('role', 'N/A')})")
        
        console.print("\n")
        console.print(table)
        console.print("\n")

