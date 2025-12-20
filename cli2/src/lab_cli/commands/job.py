from rich.console import Console

console = Console()


def list_jobs():
    """List all jobs."""
    # Placeholder logic for listing jobs
    console.print("[green]Listing all jobs...[/green]")
    # Add actual implementation here (e.g., API call to fetch jobs)


def info_job(job_id: str):
    """Get details of a specific job."""
    # Placeholder logic for job info
    console.print(f"[green]Fetching details for job ID: {job_id}[/green]")
    # Add actual implementation here (e.g., API call to fetch job details)
