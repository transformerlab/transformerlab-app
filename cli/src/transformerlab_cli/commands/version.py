import typer
from transformerlab_cli import __version__
from transformerlab_cli.util.ui import console


app = typer.Typer()


@app.command()
def version():
    """Display the CLI version."""
    console.print(f"v{__version__}", highlight=False)
