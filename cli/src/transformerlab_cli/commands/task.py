from rich.console import Console

import typer
from transformerlab_cli.util.ui import render_table, render_object
from transformerlab_cli.util.config import check_configs, get_config

import transformerlab_cli.util.api as api
import yaml
from shutil import which
import requests

app = typer.Typer()


console = Console()

REQUIRED_TASK_FIELDS = ["name", "type"]


def list_tasks(output_format: str = "pretty", experiment_id: str = "alpha") -> None:
    """List all REMOTE tasks."""

    with console.status("[bold green]Fetching tasks...[/bold green]", spinner="dots"):
        response = api.get(f"/experiment/{experiment_id}/task/list_by_type_in_experiment?type=REMOTE")

    if response.status_code == 200:
        tasks = response.json()
        table_columns = ["id", "name", "type", "created_at", "updated_at"]

        render_table(data=tasks, format_type=output_format, table_columns=table_columns, title="Tasks")
    else:
        console.print(f"[red]Error:[/red] Failed to fetch tasks. Status code: {response.status_code}")


def delete_task(task_id: str, experiment_id: str) -> None:
    """Delete a task by ID."""
    with console.status(f"[bold green]Deleting task {task_id}...[/bold green]", spinner="dots"):
        response = api.get(f"/experiment/{experiment_id}/task/{task_id}/delete")
    if response.status_code == 200:
        body = response.json()
        if body.get("message") == "OK":
            console.print(f"[green]✓[/green] Task [bold]{task_id}[/bold] deleted.")
        else:
            console.print(f"[red]Error:[/red] Task not found. {body.get('message', '')}")
            raise typer.Exit(1)
    else:
        console.print(f"[red]Error:[/red] Failed to delete task. Status code: {response.status_code}")
        raise typer.Exit(1)


def info_task(task_id: str, experiment_id: str) -> None:
    """Get info for a task by ID."""
    with console.status(f"[bold green]Fetching info for task {task_id}...[/bold green]", spinner="dots"):
        response = api.get(f"/experiment/{experiment_id}/task/{task_id}/get")

    if response.status_code == 200:
        task_info = response.json()
        # console.print(f"[bold green]Task Info for ID {task_id}:[/bold green]")
        render_object(task_info)
    else:
        console.print(f"[red]Error:[/red] Failed to fetch task info. Status code: {response.status_code}")


def add_task_from_directory(task_directory_path: str):
    pass


def add_task_from_github(repo_url: str):
    pass


## COMMANDS ##


@app.command("list")
def command_task_list():
    """List all tasks."""
    check_configs()
    current_experiment = get_config("current_experiment")
    if not current_experiment or not str(current_experiment).strip():
        console.print("[yellow]current_experiment is not set in config.[/yellow]")
        console.print("Set it first with: [bold]lab config current_experiment <experiment_name>[/bold]")
        raise typer.Exit(1)
    list_tasks(experiment_id=current_experiment)


@app.command("add")
def command_task_add(
    task_yaml_path: str = typer.Argument(None, help="Path to the Task YAML file", metavar="<Task File>"),
    from_url: str = typer.Option(None, "--from-url", help="URL to fetch the Task YAML from"),
):
    """Add a new task. Provide a file path directly, or use --from-url to fetch the YAML from a URL."""
    check_configs()


@app.command("delete")
def command_task_delete(
    task_id: str = typer.Argument(..., help="Task ID to delete"),
):
    """Delete a task."""
    check_configs()
    current_experiment = get_config("current_experiment")
    if not current_experiment or not str(current_experiment).strip():
        console.print("[yellow]current_experiment is not set in config.[/yellow]")
        console.print("Set it first with: [bold]lab config current_experiment <experiment_name>[/bold]")
        raise typer.Exit(1)
    delete_task(task_id, experiment_id=current_experiment)


@app.command("info")
def command_task_info(
    task_id: str = typer.Argument(..., help="Task ID to get info for"),
):
    """Get task details."""
    check_configs()
    current_experiment = get_config("current_experiment")
    if not current_experiment or not str(current_experiment).strip():
        console.print("[yellow]current_experiment is not set in config.[/yellow]")
        console.print("Set it first with: [bold]lab config current_experiment <experiment_name>[/bold]")
        raise typer.Exit(1)
    info_task(task_id, current_experiment)
