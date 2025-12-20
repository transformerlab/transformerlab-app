from rich.console import Console
from rich.table import Table
from rich import print
from lab_cli.util import api

console = Console()


def _fetch_jobs_and_return_table() -> Table:
    """Make a new table."""
    response = api.get("/experiment/alpha/jobs/list?type=REMOTE")  # Placeholder logic for listing jobs
    jobs = response.json()
    # Create a table to display job details
    table = Table()
    table.add_column("ID", justify="right", style="cyan", no_wrap=True)
    table.add_column("Experiment", style="magenta")
    table.add_column("Task Name", style="green")
    table.add_column("Status", style="yellow")
    table.add_column("Progress", justify="right", style="blue")
    table.add_column("Completion Status", style="red")

    for job in jobs:
        job_data = job.get("job_data", {})
        table.add_row(
            str(job.get("id", "N/A")),
            job.get("experiment_id", "N/A"),
            job_data.get("task_name", "N/A"),
            job.get("status", "N/A"),
            f"{job.get('progress', 0)}%",
            job_data.get("completion_status", "N/A"),
        )

    return table


def list_jobs():
    """List all jobs."""
    with console.status("[bold green]Fetching jobs[/bold green]", spinner="dots"):
        table = _fetch_jobs_and_return_table()
    print(table)


def info_job(job_id: str):
    """Get details of a specific job."""
    # Placeholder logic for job info
    console.print(f"[green]Fetching details for job ID: {job_id}[/green]")
    # Add actual implementation here (e.g., API call to fetch job details)
