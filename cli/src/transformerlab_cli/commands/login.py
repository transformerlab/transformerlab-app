import typer
from rich.console import Console

from transformerlab_cli.util.auth import set_api_key
from transformerlab_cli.util.config import load_config
from transformerlab_cli.util.shared import set_base_url

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
    set_api_key(api_key)
