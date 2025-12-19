from rich.console import Console
from lab_cli.util.ui import render_table
import lab_cli.util.api as api

console = Console()


def list_tasks(output_format: str = "table") -> None:
    """List all tasks."""

    with console.status("[bold green]Fetching tasks...[/bold green]", spinner="dots"):
        response = api.get("/tasks/list")

    if response.status_code == 200:
        tasks = response.json()
        table_columns = ["id", "name", "type", "created_at", "updated_at"]

        render_table(data=tasks, format_type=output_format, table_columns=table_columns, title="Tasks")
    else:
        console.print(f"[red]Error:[/red] Failed to fetch tasks. Status code: {response.status_code}")


def add_task() -> None:
    """Add a new task."""
    console.print("[yellow]Task add - not implemented[/yellow]")


def delete_task(task_id: str) -> None:
    """Delete a task by ID."""
    console.print(f"[yellow]Task delete '{task_id}' - not implemented[/yellow]")


def info_task(task_id: str) -> None:
    """Get info for a task by ID."""
    console.print(f"[yellow]Task info '{task_id}' - not implemented[/yellow]")
