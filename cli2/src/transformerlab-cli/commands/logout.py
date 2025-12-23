import typer
from rich.console import Console

from lab_cli.util.auth import delete_api_key

app = typer.Typer()
console = Console()


@app.command()
def logout():
    """Log out from Transformer Lab."""
    delete_api_key()
