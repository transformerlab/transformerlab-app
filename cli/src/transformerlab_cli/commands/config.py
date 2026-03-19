import typer

from transformerlab_cli.util.config import list_config, set_config
from transformerlab_cli.util.ui import console

app = typer.Typer()


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
        console.print("[error]Error:[/error] Both key and value are required to set a config")
        raise typer.Exit(1)
