import typer

from transformerlab_cli.util.auth import delete_api_key

app = typer.Typer()


@app.command()
def logout():
    """Log out from Transformer Lab."""
    delete_api_key()
