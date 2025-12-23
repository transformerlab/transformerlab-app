import typer
from rich.console import Console

from lab_cli.util.auth import set_api_key

app = typer.Typer()
console = Console()


@app.command()
def login(
    api_key: str = typer.Option(None, "--api-key", help="Your API key", prompt="Please enter your API key"),
):
    """Log in to Transformer Lab."""
    set_api_key(api_key)
