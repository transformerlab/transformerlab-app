import typer
from rich import print
from rich.console import Console

from lab_cli.util.logo import show_header
from lab_cli.util.auth import set_api_key, delete_api_key
from lab_cli.util.config import list_config, set_config
from lab_cli import __version__

app = typer.Typer(name="lab", help="Transformer Lab CLI", add_completion=False, no_args_is_help=True)
task_app = typer.Typer(help="Task management commands")
app.add_typer(task_app, name="task")

console = Console()


@app.command()
def version():
    """Display the CLI version."""
    show_header(console)
    print(f"You are using [cyan]lab-cli[/cyan] [green]v{__version__}[/green]")


@app.command()
def login(
    api_key: str = typer.Option(..., "--api-key", help="Your API key"),
):
    """Log in to Transformer Lab."""
    set_api_key(api_key)


@app.command()
def logout():
    """Log out from Transformer Lab."""
    delete_api_key()


@app.command()
def config(
    key: str = typer.Argument(None, help="Config key to set"),
    value: str = typer.Argument(None, help="Config value to set"),
):
    """View or set configuration values."""
    if key is None and value is None:
        list_config()
    elif key is not None and value is not None:
        set_config(key, value)
    else:
        console.print("[red]Error:[/red] Both key and value are required to set a config")
        raise typer.Exit(1)


@task_app.command("list")
def task_list():
    """List all tasks."""
    print("Task list stub - implement me")


@task_app.command("add")
def task_add():
    """Add a new task."""
    print("Task add stub - implement me")


if __name__ == "__main__":
    app()
