import os
import subprocess
import sys
from pathlib import Path

import typer
from rich.console import Console

app = typer.Typer()
console = Console()

TLAB_DIR = Path.home() / ".transformerlab"
TLAB_CODE_DIR = TLAB_DIR / "src"
RUN_SCRIPT = TLAB_CODE_DIR / "run.sh"


def _check_local_installation() -> bool:
    """Check if Transformer Lab is installed locally."""
    if not TLAB_CODE_DIR.exists():
        console.print(
            "[red]Error:[/red] Transformer Lab is not installed locally.\n"
            f"  Expected installation at: {TLAB_DIR}\n"
            "  Run the installer first: curl -fsSL https://lab.cloud/install.sh | bash"
        )
        return False

    if not RUN_SCRIPT.exists():
        console.print(
            f"[red]Error:[/red] run.sh not found at {RUN_SCRIPT}.\n"
            "  Your installation may be corrupted. Try reinstalling."
        )
        return False

    return True


@app.command()
def launch(
    port: int = typer.Option(8338, "--port", "-p", help="Port to run the server on"),
    host: str = typer.Option("0.0.0.0", "--host", "-h", help="Host to bind the server to"),
    reload: bool = typer.Option(False, "--reload", "-r", help="Enable auto-reload on file changes"),
    https: bool = typer.Option(False, "--https", "-s", help="Enable HTTPS"),
) -> None:
    """Launch the Transformer Lab server locally.

    This starts the API server from the local installation at ~/.transformerlab.
    Equivalent to running: cd ~/.transformerlab/src && ./run.sh
    """
    if not _check_local_installation():
        raise typer.Exit(1)

    console.print("[bold]🚀 Launching Transformer Lab server...[/bold]")
    console.print(f"  Host: {host}")
    console.print(f"  Port: {port}")
    if reload:
        console.print("  Reload: enabled")
    if https:
        console.print("  HTTPS: enabled")
    console.print()

    # Build the run.sh command with flags
    cmd = ["bash", str(RUN_SCRIPT)]
    cmd.extend(["-p", str(port)])
    cmd.extend(["-h", host])
    if reload:
        cmd.append("-r")
    if https:
        cmd.append("-s")

    try:
        # Run the server in the foreground, inheriting stdin/stdout/stderr
        # so the user can see output and Ctrl+C to stop
        process = subprocess.run(
            cmd,
            cwd=str(TLAB_CODE_DIR),
            env={**os.environ},
        )
        sys.exit(process.returncode)
    except KeyboardInterrupt:
        console.print("\n[yellow]Server stopped.[/yellow]")
        raise typer.Exit(0)
    except FileNotFoundError:
        console.print("[red]Error:[/red] bash not found. Cannot run the server.")
        raise typer.Exit(1)
