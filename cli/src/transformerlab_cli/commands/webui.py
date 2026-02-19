import subprocess
from pathlib import Path

import typer
from rich.console import Console

app = typer.Typer()
console = Console()


@app.command("launch")
def webui_launch(
    reload: bool = typer.Option(False, "--reload", "-r", help="Reload the server on file changes"),
    https: bool = typer.Option(False, "--https", "-s", help="Serve over HTTPS"),
    port: str = typer.Option("", "--port", "-p", help="Port to bind the API server"),
    host: str = typer.Option("", "--host", "-h", help="Host to bind the API server"),
) -> None:
    """Launch the Transformer Lab Web UI application."""
    src_dir = Path.home() / ".transformerlab" / "src"
    run_script = src_dir / "run.sh"

    if not run_script.exists():
        console.print(
            "[red]Error:[/red] run.sh not found at [bold]~/.transformerlab/src/run.sh[/bold]. "
            "Run [bold]lab webui update[/bold] to install it."
        )
        raise typer.Exit(1)

    args = ["bash", str(run_script)]
    if port:
        args.append("-p")
        args.append(port)
    if host:
        args.append("-h")
        args.append(host)
    if reload:
        args.append("-r")
    if https:
        args.append("-s")

    console.print("[bold green]Launching Transformer Lab Web UI...[/bold green]")
    try:
        subprocess.run(args, cwd=str(src_dir), check=True)
    except subprocess.CalledProcessError as e:
        console.print(f"[red]Error:[/red] Failed to launch Web UI: {e}")
        raise typer.Exit(1)


@app.command("update")
def webui_update() -> None:
    """Update (or install) the Transformer Lab Web UI by running the install script."""
    console.print("[bold green]Updating Transformer Lab Web UI...[/bold green]")
    try:
        subprocess.run(
            ["bash", "-c", "curl -fsSL https://lab.cloud/install.sh | bash"],
            check=True,
        )
        console.print("[green]✓[/green] Transformer Lab Web UI updated successfully.")
    except subprocess.CalledProcessError as e:
        console.print(f"[red]Error:[/red] Web UI update failed: {e}")
        raise typer.Exit(1)
