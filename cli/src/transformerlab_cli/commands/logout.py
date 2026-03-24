import typer

from transformerlab_cli.util.auth import delete_api_key
from transformerlab_cli.util.config import delete_config, load_config

app = typer.Typer()


@app.command()
def logout() -> None:
    """Log out from Transformer Lab."""
    # Remove stored API key credentials
    delete_api_key()
    config = load_config()

    # Clear related configuration values if they exist
    for key in ("team_id", "team_name", "user_email", "current_experiment"):
        # Only delete config if it exists
        if key in config:
            delete_config(key)
