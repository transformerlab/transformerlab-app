import typer

from transformerlab_cli.util.api import check_server_status
from transformerlab_cli.util.config import check_configs

app = typer.Typer()


@app.command()
def status():
    """Check the status of the server."""
    check_configs(output_format="json")
    check_server_status()
