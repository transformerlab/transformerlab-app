import typer
from rich import print
from rich.console import Console

from lab_cli.util.api import check_server_status
from lab_cli.util.logo import show_header
from lab_cli.util.auth import set_api_key, delete_api_key
from lab_cli.util.config import check_configs, list_config, set_config
from lab_cli.commands import task as task_commands
from lab_cli import __version__

app = typer.Typer(name="lab", help="Transformer Lab CLI", add_completion=False, no_args_is_help=True)
task_app = typer.Typer(help="Task management commands", no_args_is_help=True)
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


@app.command()
def status():
    """Check the status of the server."""
    check_configs()
    # list_config()
    check_server_status()


@task_app.command("list")
def task_list():
    """List all tasks."""
    check_configs()
    task_commands.list_tasks()


@task_app.command("add")
def task_add(
    task_yaml_path: str = typer.Argument(..., help="Path to the Task YAML file"),
    directory: str = typer.Argument(None, help="Path to the directory to upload (optional)"),
):
    """Add a new task."""
    check_configs()
    task_commands.add_task(task_yaml_path, directory if directory else None)


@task_app.command("delete")
def task_delete(
    task_id: str = typer.Argument(..., help="Task ID to delete"),
):
    """Delete a task."""
    check_configs()
    task_commands.delete_task(task_id)


@task_app.command("info")
def task_info(
    task_id: str = typer.Argument(..., help="Task ID to get info for"),
):
    """Get task details."""
    check_configs()
    task_commands.info_task(task_id)


# Apply common setup to all commands
@app.callback()
def common_setup():
    """Common setup code to run before any command."""


if __name__ == "__main__":
    app()
