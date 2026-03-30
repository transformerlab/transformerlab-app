"""Check for CLI updates via PyPI and display a banner if outdated."""

from rich.console import Console
from rich.panel import Panel


def check_for_update(console: Console) -> None:
    """Check if a newer CLI version is available on PyPI and print a banner if so."""
    try:
        from transformerlab_cli.util.pypi import is_update_available

        installed, latest = is_update_available()
        if latest is None:
            return

        console.print(
            Panel(
                f"[yellow]Update available![/yellow] "
                f"You are running [bold]v{installed}[/bold], but [bold]v{latest}[/bold] is available.\n"
                f"Run [bold]uv tool upgrade transformerlab-cli[/bold] to upgrade.",
                border_style="yellow",
                expand=False,
            )
        )
    except Exception:
        # Never let version check failures interrupt CLI usage
        pass
