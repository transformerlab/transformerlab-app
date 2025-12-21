import typer
from rich.console import Console
from rich.table import Table
from rich import print
from rich.progress import Progress
from rich.panel import Panel
from rich.text import Text
from urllib.parse import urlparse

from lab_cli.util.config import check_configs
from lab_cli.util import api

app = typer.Typer()

console = Console()


def _fetch_all_jobs() -> list[dict]:
    """Fetch all jobs from the API."""
    response = api.get("/experiment/alpha/jobs/list?type=REMOTE")  # Placeholder logic for listing jobs
    if response.status_code == 200:
        return response.json()
    else:
        console.print(f"[red]Error:[/red] Failed to fetch jobs. Status code: {response.status_code}")
        return []


def _render_jobs(jobs) -> Table:
    """Make a new table."""
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


def _render_artifacts(artifacts: list[str]) -> str:
    """Render artifact filenames from their paths."""
    filenames = [urlparse(artifact).path.split("/")[-1] for artifact in artifacts]
    return "\n".join(filenames)


def _render_job(job) -> None:
    """Render all details of a job."""
    job_data = job.get("job_data", {})

    # Render progress bar
    progress = job.get("progress", 0)
    with Progress(transient=True) as progress_bar:
        task = progress_bar.add_task("[cyan]Progress", total=100)
        progress_bar.update(task, completed=progress)

    # Render status as a chip
    status = job.get("status", "N/A")
    status_chip = Text(status, style="bold green" if status == "COMPLETE" else "bold yellow")

    # Render job details
    details = {
        "ID": job.get("id", "N/A"),
        "Experiment ID": job.get("experiment_id", "N/A"),
        "Task Name": job_data.get("task_name", "N/A"),
        "Command": job_data.get("command", "N/A"),
        "Cluster Name": job_data.get("cluster_name", "N/A"),
        "CPUs": job_data.get("cpus", "N/A"),
        "Memory": job_data.get("memory", "N/A"),
        "Setup": job_data.get("setup", "N/A"),
        "Environment Variables": job_data.get("env_vars", {}),
        "Provider ID": job_data.get("provider_id", "N/A"),
        "Provider Type": job_data.get("provider_type", "N/A"),
        "Provider Name": job_data.get("provider_name", "N/A"),
        "User Email": job_data.get("user_info", {}).get("email", "N/A"),
        "Experiment Name": job_data.get("experiment_name", "N/A"),
        "Model Name": job_data.get("model_name", "N/A"),
        "Template Name": job_data.get("template_name", "N/A"),
        "Evaluation Name": job_data.get("eval_name", "N/A"),
        "Dataset ID": job_data.get("dataset_id", "N/A"),
        "Generated Datasets": job_data.get("generated_datasets", []),
        "Evaluation Results": "\n".join(job_data.get("eval_results", [])),
        "Artifacts": _render_artifacts(job_data.get("artifacts", [])),
        "Completion Status": job_data.get("completion_status", "N/A"),
        "Completion Details": job_data.get("completion_details", "N/A"),
        "Config": job_data.get("_config", {}),
        "Score": job_data.get("score", {}),
    }

    # Format nested fields
    config = details.pop("Config")
    config_text = "\n".join([f"  {key}: {value}" for key, value in config.items()])
    details["Config"] = f"\n{config_text}"

    score = details.pop("Score")
    score_text = "\n".join([f"  {key}: {value}" for key, value in score.items()])
    details["Score"] = f"\n{score_text}"

    # Display details in a panel
    detail_text = "\n".join([f"[bold]{key}:[/bold] {value}" for key, value in details.items()])
    panel = Panel(detail_text, title=f"Job Details (ID: {job.get('id', 'N/A')})", subtitle=status_chip)
    console.print(panel)


def list_jobs():
    """List all jobs."""
    jobs = []
    with console.status("[bold green]Fetching jobs[/bold green]", spinner="dots"):
        jobs = _fetch_all_jobs()
    table = _render_jobs(jobs)
    print(table)


def info_job(job_id: str):
    """Get details of a specific job."""
    jobs = []
    with console.status("[bold green]Fetching jobs[/bold green]", spinner="dots"):
        jobs = _fetch_all_jobs()

    # filter the job with the given job_id
    job = next((job for job in jobs if str(job.get("id")) == job_id), None)
    if job:
        print(f"[bold green]Job Details for ID {job_id}:[/bold green]")
        _render_job(job)
    else:
        console.print(f"[red]Error:[/red] Job with ID {job_id} not found.")


def list_artifacts(job_id: str, output_format: str = "pretty") -> None:
    """List artifacts for a task by ID."""
    with console.status(f"[bold green]Fetching artifacts for task {job_id}...[/bold green]", spinner="dots"):
        response = api.get(f"/jobs/{job_id}/artifacts")

    if response.status_code == 200:
        artifacts = response.json().get("artifacts", [])
        if not artifacts:
            console.print(f"[yellow]No artifacts found for job {job_id}.[/yellow]")
            return

        # Print artifacts in a nice list
        table = Table(title=f"Artifacts for Job {job_id}")
        table.add_column("Filename", style="cyan", no_wrap=True)

        for artifact in artifacts:
            table.add_row(artifact.get("filename", "N/A"))

        console.print(table)
    else:
        console.print(f"[red]Error:[/red] Failed to fetch artifacts. Status code: {response.status_code}")


@app.command("artifacts")
def command_job_artifacts(
    job_id: str = typer.Argument(..., help="Job ID to list artifacts for"),
):
    """List artifacts for a job."""
    check_configs()
    list_artifacts(job_id)


@app.command("list")
def command_job_list():
    """List all jobs."""
    check_configs()
    list_jobs()  # Delegate to job_commands.list_jobs


@app.command("info")
def command_job_info(
    job_id: str = typer.Argument(..., help="Job ID to get info for"),
):
    """Get job details."""
    check_configs()
    info_job(job_id)  # Delegate to job_commands.info_job
