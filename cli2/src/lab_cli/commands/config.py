import typer
from rich.console import Console

from lab_cli.util.config import list_config, set_config

app = typer.Typer()
console = Console()


@app.command()
def config(
    key: str = typer.Argument(None, help="Config key to set"),
    value: str = typer.Argument(None, help="Config value to set"),
):
    """View or set configuration values."""
    if key is None and value is None:
        list_config()
    elif key is not None and value is not None:
        set_config(key, value)
    else:
        console.print("[red]Error:[/red] Both key and value are required to set a config")
        raise typer.Exit(1)
