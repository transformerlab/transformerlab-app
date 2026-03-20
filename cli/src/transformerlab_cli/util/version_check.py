"""Check the API server for available version updates and display a banner if outdated."""

from rich.console import Console
from rich.panel import Panel


def check_for_update(console: Console) -> None:
    """Query the API for version info and print a banner if an update is available."""
    try:
        from transformerlab_cli.util.api import get

        response = get("/server/version", timeout=3.0)
        if response.status_code != 200:
            return

        data = response.json()
        if not data.get("update_available"):
            return

        current = data.get("current_version", "unknown")
        latest = data.get("latest_version", "unknown")
        console.print(
            Panel(
                f"[yellow]Update available![/yellow] "
                f"You are running [bold]v{current}[/bold], but [bold]v{latest}[/bold] is available.\n"
                f"Visit [link=https://lab.cloud/for-teams/update]https://lab.cloud/for-teams/update[/link] "
                f"for update instructions.",
                border_style="yellow",
                expand=False,
            )
        )
    except Exception:
        # Never let version check failures interrupt CLI usage
        pass
