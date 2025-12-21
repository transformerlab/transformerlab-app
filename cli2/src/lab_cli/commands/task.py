from rich.console import Console
import typer
from lab_cli.util.ui import render_table, render_object
from lab_cli.util.config import check_configs

import lab_cli.util.api as api
import yaml
import os
import subprocess
from shutil import which

app = typer.Typer()


console = Console()

REQUIRED_TASK_FIELDS = ["name", "type"]


def list_tasks(output_format: str = "pretty") -> None:
    """List all tasks."""

    with console.status("[bold green]Fetching tasks...[/bold green]", spinner="dots"):
        response = api.get("/tasks/list")

    if response.status_code == 200:
        tasks = response.json()
        table_columns = ["id", "name", "type", "created_at", "updated_at"]

        render_table(data=tasks, format_type=output_format, table_columns=table_columns, title="Tasks")
    else:
        console.print(f"[red]Error:[/red] Failed to fetch tasks. Status code: {response.status_code}")


def delete_task(task_id: str) -> None:
    """Delete a task by ID."""
    console.print(f"[yellow]Task delete '{task_id}' - not implemented[/yellow]")


def info_task(task_id: str) -> None:
    """Get info for a task by ID."""
    with console.status(f"[bold green]Fetching info for task {task_id}...[/bold green]", spinner="dots"):
        response = api.get(f"/tasks/{task_id}/get")

    if response.status_code == 200:
        task_info = response.json()
        # console.print(f"[bold green]Task Info for ID {task_id}:[/bold green]")
        render_object(task_info)
    else:
        console.print(f"[red]Error:[/red] Failed to fetch task info. Status code: {response.status_code}")


def _check_if_zip_command_exists():
    """Check if the 'zip' command is available on the system."""
    if which("zip") is None:
        console.print(
            "[red]Error:[/red] The 'zip' command is not available on this system. Please install it to proceed."
        )
        raise typer.Exit(1)


def add_task(task_yaml_path: str, directory: str | None) -> None:
    """Add a new task."""
    # First read the YAML file
    console.print(f"[yellow]Task add from '{task_yaml_path}'[/yellow]")

    # load file:
    with open(task_yaml_path, "r") as f:
        task_data = yaml.safe_load(f)

    # Validate required fields
    missing_fields = [field for field in REQUIRED_TASK_FIELDS if field not in task_data]
    if missing_fields:
        console.print(f"[red]Error:[/red] Missing required fields in task YAML: {', '.join(missing_fields)}")
        raise typer.Exit(1)

    # Now if directory is not None, then we would package files from there
    files = {}
    if directory:
        console.print(f"[yellow]Including files from directory '{directory}'[/yellow]")
        zip_path = os.path.join(directory, "files.zip")
        _check_if_zip_command_exists()
        subprocess.run(["zip", "-r", zip_path, "."], cwd=directory, check=True)
        with open(zip_path, "rb") as zip_file:
            files["files"] = ("files.zip", zip_file.read(), "application/zip")

    # Now send the YAML and the zip (if any) to the server
    with console.status("[bold green]Uploading task...[/bold green]", spinner="dots"):
        data = {"task_yaml": yaml.dump(task_data)}
        response = api.post("/tasks/add", data=data, files=files)
    if response.status_code == 201:
        console.print(f"[green]✓[/green] Task added successfully with ID: {response.json().get('task_id')}")
    else:
        console.print(f"[red]Error:[/red] Failed to add task. Status code: {response.status_code}")


@app.command("list")
def task_list():
    """List all tasks."""
    check_configs()
    list_tasks()


@app.command("add")
def task_add(
    task_yaml_path: str = typer.Argument(..., help="Path to the Task YAML file"),
    directory: str = typer.Argument(None, help="Path to the directory to upload (optional)"),
):
    """Add a new task."""
    check_configs()
    add_task(task_yaml_path, directory if directory else None)


@app.command("delete")
def task_delete(
    task_id: str = typer.Argument(..., help="Task ID to delete"),
):
    """Delete a task."""
    check_configs()
    delete_task(task_id)


@app.command("info")
def task_info(
    task_id: str = typer.Argument(..., help="Task ID to get info for"),
):
    """Get task details."""
    check_configs()
    info_task(task_id)
