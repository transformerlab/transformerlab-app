import json

import typer

from transformerlab_cli.state import cli_state
from transformerlab_cli.util.ui import console

app = typer.Typer()


@app.command()
def version() -> None:
    """Display the CLI version and check for updates."""
    from transformerlab_cli.util.pypi import fetch_latest_version, get_installed_version, _parse_version

    installed = get_installed_version()
    latest = fetch_latest_version()

    # Determine state: update available, up to date, or check failed
    update_available = False
    check_succeeded = latest is not None and installed != "unknown"
    if check_succeeded and latest is not None:
        try:
            update_available = _parse_version(latest) > _parse_version(installed)
        except ValueError:
            check_succeeded = False

    if cli_state.output_format == "json":
        data: dict[str, object] = {"installed_version": installed, "update_available": update_available}
        if update_available:
            data["latest_version"] = latest
            data["upgrade_command"] = "uv tool upgrade transformerlab-cli"
        if not check_succeeded:
            data["check_succeeded"] = False
        print(json.dumps(data))
    else:
        console.print(f"v{installed}", highlight=False)
        if update_available:
            console.print(
                f"[yellow]Update available:[/yellow] v{latest}\n"
                f"Run [bold]uv tool upgrade transformerlab-cli[/bold] to upgrade."
            )
        elif check_succeeded:
            console.print("[green]You are up to date.[/green]")
        else:
            console.print("[dim]Could not check for updates.[/dim]")
