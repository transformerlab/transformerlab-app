import typer
from transformerlab_cli.util.ui import console
from importlib.metadata import PackageNotFoundError, version


app = typer.Typer()


@app.command()
def version():
    """Display the CLI version."""
    try:
        pkg_version = version("transformerlab-cli")
    except PackageNotFoundError:
        pkg_version = "unknown"

    console.print(f"v{pkg_version}", highlight=False)
