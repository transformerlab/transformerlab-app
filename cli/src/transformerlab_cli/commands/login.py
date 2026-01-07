import typer
from rich.console import Console
from rich.prompt import Prompt

from transformerlab_cli.util.auth import set_api_key
from transformerlab_cli.util.config import load_config
from transformerlab_cli.util.shared import set_base_url, BASE_URL
from transformerlab_cli.util.config import _save_config


app = typer.Typer()
console = Console()


@app.command()
def login(
    serverURL: str = typer.Option(None, "--serverURL", help="Server URL"),
    apiKey: str = typer.Option(None, "--apiKey", help="Your API key"),
):
    """Log in to Transformer Lab."""
    # Load config to set the base URL before attempting login
    config = load_config()
    if config.get("server"):
        set_base_url(config.get("server"))
    else:
        # If no server in config, use default
        set_base_url(None)

    # Interactive mode when no arguments provided
    if serverURL is None and apiKey is None:
        # Ask for server URL first
        current_server = BASE_URL()
        new_server = Prompt.ask("Server URL (enter for no change)", default=current_server).strip()
        if not new_server:
            new_server = current_server
        if new_server != current_server:
            set_base_url(new_server)
            # Save new server to config
            config["server"] = new_server
            _save_config(config)
            console.print(f"[green]Server URL updated to:[/green] {new_server}")

        # Then ask for API key
        apiKey = Prompt.ask("API key").strip()
    else:
        # Handle serverURL if provided via argument
        if serverURL is not None:
            set_base_url(serverURL)
            config["server"] = serverURL
            _save_config(config)
            console.print(f"[green]Server URL set to:[/green] {serverURL}")

        # Show current server URL
        current_server = BASE_URL()
        console.print(f"\n[cyan]Current server:[/cyan] [green]{current_server}[/green]")

        # If apiKey not provided, prompt for it
        if apiKey is None:
            apiKey = Prompt.ask("API key").strip()

    # Attempt login
    login_success = set_api_key(apiKey)

    if not login_success:
        # Even if login fails, show how to change server
        console.print("\n[yellow]To change the server URL, run:[/yellow]")
        console.print("[bold]  lab config server <SERVER_URL>[/bold]\n")
        console.print("[dim]Example: lab config server http://localhost:8000[/dim]")
