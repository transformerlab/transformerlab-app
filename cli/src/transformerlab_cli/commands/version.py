import typer
from rich.console import Console
from rich import print
from transformerlab_cli.util.logo import show_header

from transformerlab_cli import __version__


app = typer.Typer()
console = Console()


@app.command()
def version():
    """Display the CLI version."""
    show_header(console)
    print("")
    print(f"You are using [cyan]lab-cli[/cyan] [green]v{__version__}[/green]")
