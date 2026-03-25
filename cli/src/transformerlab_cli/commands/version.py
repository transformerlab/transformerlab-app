import typer
from transformerlab_cli.util.ui import console
from importlib.metadata import PackageNotFoundError, version as pkg_version


app = typer.Typer()


@app.command()
def version():
    """Display the CLI version."""
    try:
        installed_version = pkg_version("transformerlab-cli")
    except PackageNotFoundError:
        installed_version = "unknown"

    console.print(f"v{installed_version}", highlight=False)
