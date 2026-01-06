import typer
from rich.console import Console
from transformerlab_cli import __version__


app = typer.Typer()
console = Console()


@app.command()
def version():
    """Display the CLI version."""
    console.print(f"v{__version__}", highlight=False)
