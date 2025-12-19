from rich.console import Console

console = Console()


def list_tasks() -> None:
    """List all tasks."""
    console.print("[yellow]Task list - not implemented[/yellow]")


def add_task() -> None:
    """Add a new task."""
    console.print("[yellow]Task add - not implemented[/yellow]")


def delete_task(task_id: str) -> None:
    """Delete a task by ID."""
    console.print(f"[yellow]Task delete '{task_id}' - not implemented[/yellow]")


def info_task(task_id: str) -> None:
    """Get info for a task by ID."""
    console.print(f"[yellow]Task info '{task_id}' - not implemented[/yellow]")
