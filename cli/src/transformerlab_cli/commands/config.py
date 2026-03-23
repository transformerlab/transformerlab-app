import json

import typer

from transformerlab_cli.state import cli_state
from transformerlab_cli.util.config import list_config, set_config
from transformerlab_cli.util.ui import console

app = typer.Typer()


@app.command()
def config(
    key: str = typer.Argument(None, help="Config key to set"),
    value: str = typer.Argument(None, help="Config value to set"),
):
    """View or set configuration values."""
    output_format = cli_state.output_format
    if key is None and value is None:
        list_config(output_format=output_format)
    elif key is not None and value is not None:
        set_config(key, value, output_format=output_format)
    else:
        if output_format == "json":
            print(json.dumps({"error": "Both key and value are required to set a config"}))
        else:
            console.print("[error]Error:[/error] Both key and value are required to set a config")
        raise typer.Exit(1)
