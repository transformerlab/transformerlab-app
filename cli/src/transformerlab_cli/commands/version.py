import json

import typer

from transformerlab_cli.state import cli_state
from transformerlab_cli.util.ui import console

app = typer.Typer()


@app.command()
def version() -> None:
    """Display the CLI version and check for updates."""
    from transformerlab_cli.util.pypi import is_update_available

    installed, latest = is_update_available()

    if cli_state.output_format == "json":
        data: dict[str, object] = {"installed_version": installed, "update_available": latest is not None}
        if latest is not None:
            data["latest_version"] = latest
            data["upgrade_command"] = "uv tool upgrade transformerlab-cli"
        print(json.dumps(data))
    else:
        console.print(f"v{installed}", highlight=False)
        if latest is not None:
            console.print(
                f"[yellow]Update available:[/yellow] v{latest}\n"
                f"Run [bold]uv tool upgrade transformerlab-cli[/bold] to upgrade."
            )
        else:
            console.print("[green]You are up to date.[/green]")
