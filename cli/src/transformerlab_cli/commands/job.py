import io
import json
import os
import zipfile
from fnmatch import fnmatch
from urllib.parse import urlparse

import httpx
import typer
from rich.panel import Panel
from rich.progress import (
    BarColumn,
    DownloadColumn,
    Progress,
    SpinnerColumn,
    TextColumn,
    TransferSpeedColumn,
)
from rich.table import Table
from rich.text import Text

from transformerlab_cli.state import cli_state
from transformerlab_cli.util import api
from transformerlab_cli.util.config import check_configs, require_current_experiment
from transformerlab_cli.util.ui import console, exit_with_no_results

app = typer.Typer()

ACTIVE_JOB_STATUSES = {"RUNNING", "LAUNCHING", "INTERACTIVE", "WAITING"}


def _fetch_all_jobs(experiment_id: str) -> list[dict]:
    """Fetch all jobs from the API for a specific experiment."""
    response = api.get(f"/experiment/{experiment_id}/jobs/list?type=REMOTE")
    if response.status_code == 200:
        return response.json()
    else:
        console.print(f"[error]Error:[/error] Failed to fetch jobs. Status code: {response.status_code}")
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
    status_style = "bold green" if status == "COMPLETE" else "bold red" if status == "FAILED" else "bold yellow"
    status_chip = Text(status, style=status_style)

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
        "Error": job_data.get("error_msg", ""),
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


def list_jobs(experiment_id: str, running_only: bool = False):
    """List all jobs for a specific experiment."""
    output_format = cli_state.output_format
    jobs = []
    if output_format != "json":
        with console.status("[bold success]Fetching jobs[/bold success]", spinner="dots"):
            jobs = _fetch_all_jobs(experiment_id)
    else:
        jobs = _fetch_all_jobs(experiment_id)

    if running_only:
        jobs = [j for j in jobs if j.get("status") in ACTIVE_JOB_STATUSES]

    if output_format == "json":
        print(json.dumps(jobs))
    else:
        table = _render_jobs(jobs)
        console.print(table)


def info_job(job_id: str, experiment_id: str):
    """Get details of a specific job."""
    jobs = []
    with console.status("[bold success]Fetching jobs[/bold success]", spinner="dots"):
        jobs = _fetch_all_jobs(experiment_id)

    # filter the job with the given job_id
    job = next((job for job in jobs if str(job.get("id")) == job_id), None)
    if job:
        console.print(f"[bold success]Job Details for ID {job_id}:[/bold success]")
        _render_job(job)
    else:
        console.print(f"[error]Error:[/error] Job with ID {job_id} not found.")


def list_artifacts(job_id: str, output_format: str = "pretty") -> list[dict]:
    """List artifacts for a job by ID. Returns list of artifact dicts."""
    if output_format != "json":
        with console.status(f"[bold success]Fetching artifacts for job {job_id}...[/bold success]", spinner="dots"):
            response = api.get(f"/jobs/{job_id}/artifacts")
    else:
        response = api.get(f"/jobs/{job_id}/artifacts")

    if response.status_code != 200:
        if output_format == "json":
            print(json.dumps({"error": f"Failed to fetch artifacts. Status code: {response.status_code}"}))
            raise typer.Exit(1)
        console.print(f"[error]Error:[/error] Failed to fetch artifacts. Status code: {response.status_code}")
        raise typer.Exit(1)

    artifacts = response.json().get("artifacts", [])

    if not artifacts:
        exit_with_no_results(output_format, f"No artifacts found for job {job_id}")

    if output_format == "json":
        print(json.dumps(artifacts))
    else:
        table = Table(title=f"Artifacts for Job {job_id}")
        table.add_column("Filename", style="cyan", no_wrap=True)
        table.add_column("Path", style="dim")
        table.add_column("Size", justify="right")
        for artifact in artifacts:
            size = str(artifact.get("size", "—"))
            table.add_row(
                artifact.get("filename", "N/A"),
                artifact.get("path", "N/A"),
                size,
            )
        console.print(table)

    return artifacts


def download_artifacts(job_id: str, output_dir: str = None) -> None:
    """Download all artifacts for a job as a zip file."""
    if output_dir is None:
        output_dir = os.getcwd()
    else:
        output_dir = os.path.abspath(output_dir)
        os.makedirs(output_dir, exist_ok=True)

    # Determine output filename
    filename = f"artifacts_{job_id}.zip"
    output_path = os.path.join(output_dir, filename)

    # Check if file already exists
    if os.path.exists(output_path):
        console.print(f"[warning]Warning:[/warning] File {output_path} already exists. It will be overwritten.")

    try:
        with console.status(f"[bold success]Downloading artifacts for job {job_id}...[/bold success]", spinner="dots"):
            response = api.get(f"/jobs/{job_id}/artifacts/download_all", timeout=300.0)

        if response.status_code == 200:
            # Get filename from Content-Disposition header if available
            content_disposition = response.headers.get("Content-Disposition", "")
            if "filename=" in content_disposition:
                # Extract filename from Content-Disposition header
                filename_part = content_disposition.split("filename=")[1].strip('"')
                if filename_part:
                    filename = filename_part
                    output_path = os.path.join(output_dir, filename)

            # Write the file with progress tracking
            content_length = response.headers.get("Content-Length")
            total_size = int(content_length) if content_length else None

            with Progress(
                SpinnerColumn(),
                TextColumn("[progress.description]{task.description}"),
                BarColumn(),
                DownloadColumn(),
                TransferSpeedColumn(),
            ) as progress:
                task = progress.add_task(f"[cyan]Downloading {filename}...", total=total_size)

                with open(output_path, "wb") as f:
                    if total_size:
                        # Show progress if we know the total size
                        downloaded = 0
                        for chunk in response.iter_bytes(chunk_size=8192):
                            if chunk:
                                f.write(chunk)
                                downloaded += len(chunk)
                                progress.update(task, completed=downloaded)
                    else:
                        # Just write without progress if we don't know the size
                        f.write(response.content)
                        progress.update(task, completed=1, total=1)

            console.print(f"[success]✓[/success] Successfully downloaded artifacts to: {output_path}")
        elif response.status_code == 404:
            console.print(f"[error]Error:[/error] No artifacts found for job {job_id}.")
        else:
            console.print(f"[error]Error:[/error] Failed to download artifacts. Status code: {response.status_code}")
            if response.text:
                console.print(f"[error]Response:[/error] {response.text[:200]}")

    except (httpx.HTTPError, OSError) as e:
        console.print(f"[error]Error:[/error] Failed to download artifacts: {e}")


@app.command("artifacts")
def command_job_artifacts(
    job_id: str = typer.Argument(..., help="Job ID to list artifacts for"),
):
    """List artifacts for a job."""
    check_configs()
    list_artifacts(job_id, output_format=cli_state.output_format)


@app.command("download")
def command_job_download(
    job_id: str = typer.Argument(..., help="Job ID to download artifacts for"),
    output_dir: str = typer.Option(
        None, "--output", "-o", help="Output directory for the zip file (default: current directory)"
    ),
    file: list[str] = typer.Option(
        None,
        "--file",
        help="Filename or glob pattern to download (can be repeated). Omit to download all as zip.",
    ),
):
    """Download artifacts for a job. Use --file to download specific files."""
    check_configs()
    out = os.path.abspath(output_dir) if output_dir else os.getcwd()
    output_format = cli_state.output_format

    if not file:
        download_artifacts(job_id, output_dir)
        return

    raw_resp = api.get(f"/jobs/{job_id}/artifacts")
    if raw_resp.status_code != 200:
        if output_format == "json":
            print(json.dumps({"error": f"Failed to fetch artifacts. Status code: {raw_resp.status_code}"}))
        else:
            console.print(f"[red]Error:[/red] Failed to fetch artifacts. Status code: {raw_resp.status_code}")
        raise typer.Exit(1)

    artifacts = raw_resp.json().get("artifacts", [])
    all_filenames = [a.get("filename", "") for a in artifacts]

    matched = [fn for fn in all_filenames if any(fnmatch(fn, pat) for pat in file)]
    if not matched:
        if output_format == "json":
            print(json.dumps({"error": f"No artifacts matched the pattern(s): {', '.join(file)}"}))
        else:
            console.print(f"[yellow]No artifacts matched the pattern(s): {', '.join(file)}[/yellow]")
        raise typer.Exit(2)

    downloaded: list[dict] = []
    for filename in matched:
        if output_format != "json":
            console.print(f"Downloading [cyan]{filename}[/cyan]...")
        path = download_single_artifact(job_id, filename, out)
        if path:
            downloaded.append({"filename": filename, "path": path})
        elif output_format != "json":
            console.print(f"[red]Failed to download {filename}[/red]")

    if output_format == "json":
        print(json.dumps(downloaded))
    else:
        console.print(f"[green]✓[/green] Downloaded {len(downloaded)}/{len(matched)} file(s) to {out}")


def download_single_artifact(job_id: str, filename: str, output_dir: str) -> str | None:
    """Download a single artifact by filename. Returns local path or None on failure."""
    output_path = os.path.join(output_dir, filename)
    try:
        response = api.get(f"/jobs/{job_id}/artifact/{filename}?task=download", timeout=300.0)
        if response.status_code == 200:
            with open(output_path, "wb") as f:
                f.write(response.content)
            return output_path
        if response.status_code in (404, 405):
            zip_response = api.get(f"/jobs/{job_id}/artifacts/download_all", timeout=300.0)
            if zip_response.status_code == 200:
                with zipfile.ZipFile(io.BytesIO(zip_response.content)) as zf:
                    names = zf.namelist()
                    match = next(
                        (n for n in names if n.endswith(filename) or os.path.basename(n) == filename),
                        None,
                    )
                    if match:
                        with zf.open(match) as src, open(output_path, "wb") as dst:
                            dst.write(src.read())
                        return output_path
    except Exception as e:  # pragma: no cover - best-effort logging
        console.print(f"[red]Error downloading {filename}:[/red] {e}")
    return None


def fetch_logs(experiment_id: str, job_id: str):
    """Fetch current provider logs for a job."""
    return api.get(f"/experiment/{experiment_id}/jobs/{job_id}/provider_logs", timeout=15.0)


def stream_logs(experiment_id: str, job_id: str, output_format: str) -> None:
    """Poll and stream new log lines until job ends or Ctrl-C."""
    import time

    seen_lines = 0
    start = time.time()

    try:
        while True:
            elapsed = int(time.time() - start)
            try:
                response = fetch_logs(experiment_id, job_id)
                if response.status_code == 200:
                    data = response.json()
                    logs_text = data.get("logs", "") if isinstance(data, dict) else ""
                    lines = logs_text.splitlines() if logs_text else []

                    if len(lines) < seen_lines:
                        seen_lines = 0

                    new_lines = lines[seen_lines:]
                    if new_lines:
                        if output_format == "json":
                            print(
                                json.dumps(
                                    {
                                        "job_id": int(job_id),
                                        "new_lines": "\n".join(new_lines),
                                        "elapsed_seconds": elapsed,
                                    }
                                )
                            )
                        else:
                            for line in new_lines:
                                console.print(line)
                        seen_lines = len(lines)
            except Exception:
                pass

            try:
                jobs_response = api.get(
                    f"/experiment/{experiment_id}/jobs/list?type=REMOTE",
                    timeout=10.0,
                )
                if jobs_response.status_code == 200:
                    job = next(
                        (j for j in jobs_response.json() if str(j.get("id")) == str(job_id)),
                        None,
                    )
                    if job and job.get("status") not in ACTIVE_JOB_STATUSES:
                        break
            except Exception:
                pass

            time.sleep(2)
    except KeyboardInterrupt:
        pass


@app.command("logs")
def command_job_logs(
    job_id: str = typer.Argument(..., help="Job ID to fetch logs for"),
    follow: bool = typer.Option(False, "--follow", "-f", help="Stream new lines continuously"),
):
    """Fetch logs for a job. Use --follow to stream continuously."""
    experiment_id = require_current_experiment()
    output_format = cli_state.output_format

    if follow:
        stream_logs(experiment_id, job_id, output_format)
        return

    if output_format != "json":
        with console.status("[bold green]Fetching logs...[/bold green]", spinner="dots"):
            response = fetch_logs(experiment_id, job_id)
    else:
        response = fetch_logs(experiment_id, job_id)

    if response.status_code != 200:
        if output_format == "json":
            print(json.dumps({"error": f"Failed to fetch logs. Status code: {response.status_code}"}))
        else:
            console.print(f"[red]Error:[/red] Failed to fetch logs. Status code: {response.status_code}")
        raise typer.Exit(1)

    data = response.json()
    logs_text = data.get("logs", "") if isinstance(data, dict) else ""

    if not logs_text or "No log files found" in logs_text:
        exit_with_no_results(output_format, "No logs found for this job")

    if output_format == "json":
        lines = [line for line in logs_text.splitlines() if line]
        print(json.dumps({"job_id": int(job_id), "logs": logs_text, "line_count": len(lines)}))
    else:
        console.print(logs_text)


@app.command("list")
def command_job_list(
    running: bool = typer.Option(
        False, "--running", help="Show only active jobs (WAITING, LAUNCHING, RUNNING, INTERACTIVE)"
    ),
):
    """List all jobs."""
    check_configs()
    current_experiment = require_current_experiment()
    list_jobs(current_experiment, running_only=running)


@app.command("info")
def command_job_info(
    job_id: str = typer.Argument(..., help="Job ID to get info for"),
):
    """Get job details."""
    current_experiment = require_current_experiment()
    info_job(job_id, current_experiment)


@app.command("stop")
def command_job_stop(
    job_id: str = typer.Argument(..., help="Job ID to stop"),
):
    """Stop a running job."""
    current_experiment = require_current_experiment()

    with console.status(f"[bold success]Stopping job {job_id}...[/bold success]", spinner="dots"):
        response = api.get(f"/experiment/{current_experiment}/jobs/{job_id}/stop")

    if response.status_code == 200:
        console.print(f"[success]✓[/success] Job [bold]{job_id}[/bold] stopped.")
    else:
        console.print(f"[error]Error:[/error] Failed to stop job. Status code: {response.status_code}")
        try:
            detail = response.json().get("detail", response.text)
            console.print(f"[error]Detail:[/error] {detail}")
        except (ValueError, KeyError):
            console.print(f"[error]Response:[/error] {response.text}")
        raise typer.Exit(1)


@app.command("monitor")
def command_job_monitor():
    """Launch interactive job monitor TUI."""
    from transformerlab_cli.commands.job_monitor.job_monitor import run_monitor

    run_monitor()
