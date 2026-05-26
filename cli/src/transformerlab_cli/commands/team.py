import typer

from transformerlab_cli.commands.secret import app as secret_app

app = typer.Typer()

app.add_typer(secret_app, name="secret", help="Secret management commands", no_args_is_help=True)
