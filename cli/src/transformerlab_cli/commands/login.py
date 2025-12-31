import typer
from rich.console import Console

from transformerlab_cli.util.auth import set_api_key
from transformerlab_cli.util.config import load_config
from transformerlab_cli.util.shared import set_base_url, BASE_URL

app = typer.Typer()
console = Console()


@app.command()
def login(
    api_key: str = typer.Option(None, "--api-key", help="Your API key", prompt="Please enter your API key"),
):
    """Log in to Transformer Lab."""
    # Load config to set the base URL before attempting login
    config = load_config()
    if config.get("server"):
        set_base_url(config.get("server"))
    else:
        # If no server in config, use default
        set_base_url(None)

    # Show current server URL
    current_server = BASE_URL()
    console.print(f"\n[cyan]Current server:[/cyan] [green]{current_server}[/green]")

    # Attempt login
    login_success = set_api_key(api_key)

    if not login_success:
        # Even if login fails, show how to change server
        console.print("\n[yellow]To change the server URL, run:[/yellow]")
        console.print("[bold]  lab config set server <SERVER_URL>[/bold]\n")
        console.print("[dim]Example: lab config set server http://localhost:8000[/dim]")
