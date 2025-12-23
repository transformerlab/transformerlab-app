import typer
from rich.console import Console

from lab_cli.util.api import check_server_status
from lab_cli.util.config import check_configs

app = typer.Typer()
console = Console()


@app.command()
def status():
    """Check the status of the server."""
    check_configs(output_format="json")
    check_server_status()
