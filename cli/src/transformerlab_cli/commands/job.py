import io
import json
import os
import zipfile
from datetime import datetime
from fnmatch import fnmatch
from urllib.parse import quote, urlencode, urlparse

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
publish_app = typer.Typer()

ACTIVE_JOB_STATUSES = {"RUNNING", "LAUNCHING", "INTERACTIVE", "WAITING"}


def _extract_provider_cluster_from_job(job: dict) -> tuple[str | None, str | None]:
    """Extract provider_id and cluster_name from a job payload."""
    if not isinstance(job, dict):
        return None, None
    job_data = job.get("job_data", {})
    if not isinstance(job_data, dict):
        return None, None
    provider_id = job_data.get("provider_id")
    cluster_name = job_data.get("cluster_name")
    if not provider_id or not cluster_name:
        return None, None
    return str(provider_id), str(cluster_name)


def _stop_provider_cluster(experiment_id: str, job_id: str) -> None:
    """Best-effort provider cluster stop to mirror GUI behavior."""
    job_response = api.get(f"/experiment/{experiment_id}/jobs/{job_id}")
    if job_response.status_code != 200:
        return

    provider_id, cluster_name = _extract_provider_cluster_from_job(job_response.json())
    if not provider_id or not cluster_name:
        return

    cluster_stop_url = f"/compute_provider/providers/{provider_id}/clusters/{cluster_name}/stop?job_id={job_id}"
    cluster_response = api.post(cluster_stop_url)
    if cluster_response.status_code >= 400:
        console.print(
            f"[warning]Warning:[/warning] Job stop requested, but cluster stop request failed "
            f"(status {cluster_response.status_code})."
        )


def _publish_job_asset(
    asset_type: str,
    endpoint_collection: str,
    job_id: str,
    asset_name: str,
    experiment_id: str,
    group: str | None,
    mode: str,
    tag: str,
    description: str | None,
) -> None:
    """Publish a job-produced model/dataset to the registry."""
    if mode not in {"new", "existing"}:
        console.print("[error]Error:[/error] --mode must be either 'new' or 'existing'.")
        raise typer.Exit(1)
    if mode == "existing" and not group:
        console.print("[error]Error:[/error] --group is required when --mode=existing.")
        raise typer.Exit(1)

    params: dict[str, str] = {
        "mode": mode,
        "tag": tag,
    }
    if group:
        params["target_name"] = group
    if description:
        params["description"] = description

    encoded_asset_name = quote(asset_name, safe="")
    endpoint = (
        f"/experiment/{experiment_id}/jobs/{job_id}/{endpoint_collection}/{encoded_asset_name}/save_to_registry"
        f"?{urlencode(params)}"
    )

    if cli_state.output_format != "json":
        with console.status(
            f"[bold success]Publishing {asset_type} '{asset_name}' to registry...[/bold success]",
            spinner="dots",
        ):
            response = api.post(endpoint)
    else:
        response = api.post(endpoint)

    if response.status_code == 200:
        payload = response.json()
        if cli_state.output_format == "json":
            print(json.dumps(payload))
        else:
            console.print(
                f"[success]✓[/success] Started publishing {asset_type} [bold]{asset_name}[/bold] to registry."
            )
        return

    try:
        detail = response.json().get("detail", response.text)
    except Exception:
        detail = response.text

    if cli_state.output_format == "json":
        print(json.dumps({"error": detail or f"Failed to publish {asset_type}.", "status_code": response.status_code}))
    else:
        console.print(f"[error]Error:[/error] Failed to publish {asset_type}. Status code: {response.status_code}")
        if detail:
            console.print(f"[error]Detail:[/error] {detail}")
    raise typer.Exit(1)


def _prompt_publish_options(
    *,
    asset_type: str,
    job_id: str,
    mode: str,
    group: str | None,
    tag: str,
    description: str | None,
) -> tuple[str, str | None, str, str | None]:
    """Prompt for publish metadata in pretty mode."""
    console.print(f"\n[bold label]Publish {asset_type} from job {job_id}[/bold label]")
    mode = typer.prompt("Mode (new/existing)", default=mode).strip().lower()
    if mode not in {"new", "existing"}:
        console.print("[error]Error:[/error] Mode must be 'new' or 'existing'.")
        raise typer.Exit(1)

    if mode == "existing":
        group_default = group or ""
        group_value = typer.prompt("Registry group", default=group_default, show_default=bool(group_default)).strip()
        if not group_value:
            console.print("[error]Error:[/error] Registry group is required for mode 'existing'.")
            raise typer.Exit(1)
        group = group_value

    tag = typer.prompt("Tag", default=tag).strip()

    default_description = description or ""
    resolved_description = typer.prompt(
        "Description (optional)",
        default=default_description,
        show_default=bool(default_description),
    ).strip()
    description = resolved_description or None

    return mode, group, tag, description


def _prompt_asset_from_job(asset_type: str, endpoint_collection: str, experiment_id: str, job_id: str) -> str:
    """List assets from a job and let user choose one."""
    endpoint = f"/experiment/{experiment_id}/jobs/{job_id}/{endpoint_collection}"
    with console.status(
        f"[bold success]Fetching {endpoint_collection} from job {job_id}...[/bold success]",
        spinner="dots",
    ):
        response = api.get(endpoint)

    if response.status_code != 200:
        console.print(
            f"[error]Error:[/error] Failed to fetch {endpoint_collection}. Status code: {response.status_code}"
        )
        raise typer.Exit(1)

    payload = response.json()
    assets = payload.get(endpoint_collection, []) if isinstance(payload, dict) else []

    if endpoint_collection == "models":
        names = [str(item.get("name")) for item in assets if isinstance(item, dict) and item.get("name")]
    else:
        names = [str(item.get("name")) for item in assets if isinstance(item, dict) and item.get("name")]

    if not names:
        console.print(f"[error]Error:[/error] No {endpoint_collection} found for job {job_id}.")
        raise typer.Exit(1)

    console.print(f"\n[bold label]Select {asset_type} to publish:[/bold label]")
    for idx, name in enumerate(names, start=1):
        console.print(f"  [bold]{idx}[/bold]. {name}")

    while True:
        choice = typer.prompt("Enter number", default="1").strip()
        try:
            selected_index = int(choice) - 1
        except ValueError:
            console.print("[error]Please enter a valid number.[/error]")
            continue
        if 0 <= selected_index < len(names):
            return names[selected_index]
        console.print(f"[error]Please enter a number between 1 and {len(names)}.[/error]")


def _fetch_all_jobs(experiment_id: str) -> list[dict]:
    """Fetch all jobs from the API for a specific experiment."""
    response = api.get(f"/experiment/{experiment_id}/jobs/list?type=REMOTE")
    if response.status_code == 200:
        return response.json()
    else:
        console.print(f"[error]Error:[/error] Failed to fetch jobs. Status code: {response.status_code}")
        return []


def _compute_duration(job_data: dict) -> str:
    """Compute human-readable duration from start_time and end_time in job_data."""
    start = job_data.get("start_time")
    end = job_data.get("end_time")
    if not start:
        return ""
    try:
        start_dt = datetime.strptime(start, "%Y-%m-%d %H:%M:%S")
        if end:
            end_dt = datetime.strptime(end, "%Y-%m-%d %H:%M:%S")
        else:
            end_dt = datetime.utcnow()
        delta = end_dt - start_dt
        total_secs = int(delta.total_seconds())
        if total_secs < 0:
            return ""
        if total_secs < 60:
            return f"{total_secs}s"
        if total_secs < 3600:
            return f"{total_secs // 60}m {total_secs % 60}s"
        hours = total_secs // 3600
        mins = (total_secs % 3600) // 60
        return f"{hours}h {mins}m"
    except (ValueError, TypeError):
        return ""


def _format_score(score: dict) -> str:
    """Format a score dict into a compact string for the table view."""
    if not score or not isinstance(score, dict):
        return ""
    parts = [f"{k}={v}" for k, v in score.items() if v is not None]
    text = ", ".join(parts)
    if len(text) > 30:
        text = text[:27] + "…"
    return text


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
    table.add_column("Description", style="dim", max_width=40)
    table.add_column("Score", style="dim", max_width=32)
    table.add_column("Duration", justify="right", style="dim", no_wrap=True)

    for job in jobs:
        job_data = job.get("job_data", {})
        description = job_data.get("description", "")
        # Truncate long descriptions for the table view
        if description and len(description) > 40:
            description = description[:37] + "…"
        table.add_row(
            str(job.get("id", "N/A")),
            job.get("experiment_id", "N/A"),
            job_data.get("task_name", "N/A"),
            job.get("status", "N/A"),
            f"{job.get('progress', 0)}%",
            job_data.get("completion_status", "N/A"),
            description or "",
            _format_score(job_data.get("score", {})),
            _compute_duration(job_data),
        )

    return table


def _render_artifacts(artifacts: list[str]) -> str:
    """Render artifact filenames from their paths."""
    filenames = [urlparse(artifact).path.split("/")[-1] for artifact in artifacts]
    return "\n".join(filenames)


def _format_size(size_bytes: int) -> str:
    """Format bytes into human-readable size."""
    for unit in ["B", "KB", "MB", "GB"]:
        if size_bytes < 1024:
            return f"{size_bytes:.1f} {unit}"
        size_bytes //= 1024
    return f"{size_bytes:.1f} TB"


def _fetch_job_files(experiment_id: str, job_id: str) -> list[dict]:
    """Fetch the list of files in a job's directory."""
    try:
        response = api.get(f"/experiment/{experiment_id}/jobs/{job_id}/files")
        if response.status_code == 200:
            return response.json().get("files", [])
    except Exception:
        pass
    return []


def _render_job(job) -> None:
    """Render all details of a job."""
    job_data = job.get("job_data", {})
    run_command = job_data.get("run") or job_data.get("command", "N/A")

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
        "Description": job_data.get("description", "N/A"),
        "Command": run_command,
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
        "Start Time": job_data.get("start_time", "N/A"),
        "End Time": job_data.get("end_time", "N/A"),
        "Duration": _compute_duration(job_data) or "N/A",
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


def list_jobs(experiment_id: str, running_only: bool = False, sort_by: str | None = None):
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

    if sort_by:
        # Sort by a score key (e.g. "eval/loss"). Jobs without the key go to the end.
        def _sort_key(job):
            score = job.get("job_data", {}).get("score", {})
            val = score.get(sort_by) if isinstance(score, dict) else None
            if val is None:
                return (1, 0.0)  # push to end
            try:
                return (0, float(val))
            except (ValueError, TypeError):
                return (1, 0.0)

        jobs = sorted(jobs, key=_sort_key)

    if output_format == "json":
        print(json.dumps(jobs))
    else:
        table = _render_jobs(jobs)
        console.print(table)


def info_job(job_id: str, experiment_id: str):
    """Get details of a specific job."""
    output_format = cli_state.output_format
    if output_format == "json":
        jobs = _fetch_all_jobs(experiment_id)
    else:
        with console.status("[bold success]Fetching jobs[/bold success]", spinner="dots"):
            jobs = _fetch_all_jobs(experiment_id)

    # filter the job with the given job_id
    job = next((job for job in jobs if str(job.get("id")) == job_id), None)
    if not job:
        if output_format == "json":
            print(json.dumps({"error": f"Job with ID {job_id} not found."}))
            return
        console.print(f"[error]Error:[/error] Job with ID {job_id} not found.")
        return

    if output_format == "json":
        files = _fetch_job_files(experiment_id, job_id)
        print(json.dumps({**job, "files": files}))
        return

    console.print(f"[bold success]Job Details for ID {job_id}:[/bold success]")
    _render_job(job)

    # Fetch and display job files
    with console.status("[bold success]Fetching job files[/bold success]", spinner="dots"):
        files = _fetch_job_files(experiment_id, job_id)
    if files:
        file_table = Table(title="Files", show_header=True, header_style="bold")
        file_table.add_column("Name")
        file_table.add_column("Type", width=6)
        file_table.add_column("Size", justify="right")
        for f in files:
            name = f.get("name", "")
            is_dir = f.get("is_dir", False)
            size = f.get("size", 0)
            file_table.add_row(
                name,
                "dir" if is_dir else "file",
                "" if is_dir else _format_size(size),
            )
        console.print(file_table)
    else:
        console.print("[dim]No files found in job directory.[/dim]")


def list_artifacts(job_id: str, experiment_id: str, output_format: str = "pretty") -> list[dict]:
    """List artifacts for a job by ID. Returns list of artifact dicts."""
    artifacts_url = f"/experiment/{experiment_id}/jobs/{job_id}/artifacts"
    if output_format != "json":
        with console.status(f"[bold success]Fetching artifacts for job {job_id}...[/bold success]", spinner="dots"):
            response = api.get(artifacts_url)
    else:
        response = api.get(artifacts_url)

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


def download_artifacts(job_id: str, experiment_id: str, output_dir: str | None = None) -> None:
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

    download_all_url = f"/experiment/{experiment_id}/jobs/{job_id}/artifacts/download_all"
    try:
        with console.status(f"[bold success]Downloading artifacts for job {job_id}...[/bold success]", spinner="dots"):
            response = api.get(download_all_url, timeout=300.0)

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
    check_configs(output_format=cli_state.output_format)
    current_experiment = require_current_experiment()
    list_artifacts(job_id, current_experiment, output_format=cli_state.output_format)


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
    check_configs(output_format=cli_state.output_format)
    current_experiment = require_current_experiment()
    out = os.path.abspath(output_dir) if output_dir else os.getcwd()
    output_format = cli_state.output_format

    if not file:
        download_artifacts(job_id, current_experiment, output_dir)
        return

    raw_resp = api.get(f"/experiment/{current_experiment}/jobs/{job_id}/artifacts")
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
        path = download_single_artifact(job_id, current_experiment, filename, out)
        if path:
            downloaded.append({"filename": filename, "path": path})
        elif output_format != "json":
            console.print(f"[red]Failed to download {filename}[/red]")

    if output_format == "json":
        print(json.dumps(downloaded))
    else:
        console.print(f"[green]✓[/green] Downloaded {len(downloaded)}/{len(matched)} file(s) to {out}")


def download_single_artifact(job_id: str, experiment_id: str, filename: str, output_dir: str) -> str | None:
    """Download a single artifact by filename. Returns local path or None on failure."""
    output_path = os.path.join(output_dir, filename)
    base_url = f"/experiment/{experiment_id}/jobs/{job_id}"
    try:
        response = api.get(f"{base_url}/artifact/{filename}?task=download", timeout=300.0)
        if response.status_code == 200:
            with open(output_path, "wb") as f:
                f.write(response.content)
            return output_path
        if response.status_code in (404, 405):
            zip_response = api.get(f"{base_url}/artifacts/download_all", timeout=300.0)
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
    """Fetch current provider/machine logs for a job."""
    return api.get(f"/experiment/{experiment_id}/jobs/{job_id}/provider_logs", timeout=15.0)


def fetch_task_logs(experiment_id: str, job_id: str):
    """Fetch task (Lab SDK) output for a job."""
    return api.get(f"/experiment/{experiment_id}/jobs/{job_id}/task_logs", timeout=15.0)


def fetch_request_logs(experiment_id: str, job_id: str):
    """Fetch provider request/launch logs for a job."""
    return api.get(f"/experiment/{experiment_id}/jobs/{job_id}/request_logs", timeout=15.0)


def _stream_logs_generic(experiment_id: str, job_id: str, output_format: str, fetch_fn) -> None:
    """Poll and stream new log lines until job ends or Ctrl-C."""
    import time

    seen_lines = 0
    start = time.time()

    try:
        while True:
            elapsed = int(time.time() - start)
            try:
                response = fetch_fn(experiment_id, job_id)
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
                                        "job_id": job_id,
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


def stream_logs(experiment_id: str, job_id: str, output_format: str) -> None:
    """Poll and stream machine log lines until job ends or Ctrl-C."""
    _stream_logs_generic(experiment_id, job_id, output_format, fetch_logs)


def _print_logs(experiment_id: str, job_id: str, output_format: str, fetch_fn, label: str) -> None:
    """Shared logic for one-shot log fetching and display."""
    if output_format != "json":
        with console.status(f"[bold green]Fetching {label}...[/bold green]", spinner="dots"):
            response = fetch_fn(experiment_id, job_id)
    else:
        response = fetch_fn(experiment_id, job_id)

    if response.status_code != 200:
        detail = ""
        try:
            payload = response.json()
            if isinstance(payload, dict):
                detail = str(payload.get("detail") or payload.get("message") or "")
        except Exception:
            detail = ""

        if output_format == "json":
            body = {"error": f"Failed to fetch {label}. Status code: {response.status_code}"}
            if detail:
                body["detail"] = detail
            print(json.dumps(body))
        else:
            console.print(f"[red]Error:[/red] Failed to fetch {label}. Status code: {response.status_code}")
            if detail:
                console.print(f"[red]Detail:[/red] {detail}")
        raise typer.Exit(1)

    data = response.json()
    logs_text = data.get("logs", "") if isinstance(data, dict) else ""
    wait_message = data.get("message", "") if isinstance(data, dict) else ""
    retryable = bool(data.get("retryable")) if isinstance(data, dict) else False

    if not logs_text or "No log files found" in logs_text:
        if wait_message and retryable:
            if output_format == "json":
                print(
                    json.dumps(
                        {
                            "job_id": job_id,
                            "logs": logs_text,
                            "line_count": 0,
                            "message": wait_message,
                            "retryable": True,
                            "retry_after_seconds": data.get("retry_after_seconds"),
                        }
                    )
                )
            else:
                console.print(f"[yellow]{wait_message}[/yellow]")
            return
        exit_with_no_results(output_format, f"No {label} found for this job")

    if output_format == "json":
        lines = [line for line in logs_text.splitlines() if line]
        print(json.dumps({"job_id": job_id, "logs": logs_text, "line_count": len(lines)}))
    else:
        console.print(logs_text)


@app.command("machine-logs")
def command_job_machine_logs(
    job_id: str = typer.Argument(..., help="Job ID to fetch logs for"),
    follow: bool = typer.Option(False, "--follow", "-f", help="Stream new lines continuously"),
):
    """Fetch machine/provider logs for a job. Use --follow to stream continuously."""
    experiment_id = require_current_experiment()
    output_format = cli_state.output_format

    if follow:
        _stream_logs_generic(experiment_id, job_id, output_format, fetch_logs)
        return

    _print_logs(experiment_id, job_id, output_format, fetch_logs, "machine logs")


@app.command("task-logs")
def command_job_task_logs(
    job_id: str = typer.Argument(..., help="Job ID to fetch logs for"),
    follow: bool = typer.Option(False, "--follow", "-f", help="Stream new lines continuously"),
):
    """Fetch task (Lab SDK) output for a job. Use --follow to stream continuously."""
    experiment_id = require_current_experiment()
    output_format = cli_state.output_format

    if follow:
        _stream_logs_generic(experiment_id, job_id, output_format, fetch_task_logs)
        return

    _print_logs(experiment_id, job_id, output_format, fetch_task_logs, "task logs")


@app.command("request-logs")
def command_job_request_logs(
    job_id: str = typer.Argument(..., help="Job ID to fetch logs for"),
):
    """Fetch provider request/launch logs for a job (e.g. SkyPilot launch logs)."""
    experiment_id = require_current_experiment()
    output_format = cli_state.output_format

    _print_logs(experiment_id, job_id, output_format, fetch_request_logs, "request logs")


@app.command("logs", deprecated=True, hidden=True)
def command_job_logs(
    job_id: str = typer.Argument(..., help="Job ID to fetch logs for"),
    follow: bool = typer.Option(False, "--follow", "-f", help="Stream new lines continuously"),
):
    """Deprecated: use 'machine-logs' instead."""
    command_job_machine_logs(job_id, follow)


@app.command("list")
def command_job_list(
    running: bool = typer.Option(
        False, "--running", help="Show only active jobs (WAITING, LAUNCHING, RUNNING, INTERACTIVE)"
    ),
    sort_by: str = typer.Option(
        None, "--sort-by", help="Sort jobs by a score metric key (e.g. 'eval/loss'). Ascending order."
    ),
):
    """List all jobs."""
    current_experiment = require_current_experiment()
    list_jobs(current_experiment, running_only=running, sort_by=sort_by)


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
        _stop_provider_cluster(current_experiment, job_id)
        console.print(f"[success]✓[/success] Job [bold]{job_id}[/bold] stopped.")
    else:
        console.print(f"[error]Error:[/error] Failed to stop job. Status code: {response.status_code}")
        try:
            detail = response.json().get("detail", response.text)
            console.print(f"[error]Detail:[/error] {detail}")
        except (ValueError, KeyError):
            console.print(f"[error]Response:[/error] {response.text}")
        raise typer.Exit(1)


def _extract_error_detail(response) -> str:
    try:
        payload = response.json()
        if isinstance(payload, dict):
            return str(payload.get("detail") or payload.get("message") or response.text or "")
    except Exception:
        pass
    return response.text or ""


@app.command("delete")
def command_job_delete(
    job_id: str = typer.Argument(..., help="Job ID to delete"),
    no_interactive: bool = typer.Option(False, "--no-interactive", help="Skip confirmation prompt"),
):
    """Delete a job."""
    check_configs(output_format=cli_state.output_format)
    current_experiment = require_current_experiment()
    output_format = cli_state.output_format

    if not no_interactive:
        typer.confirm(f"Delete job {job_id}?", abort=True)

    if output_format != "json":
        with console.status(f"[bold success]Deleting job {job_id}...[/bold success]", spinner="dots"):
            response = api.delete(f"/experiment/{current_experiment}/jobs/{job_id}")
    else:
        response = api.delete(f"/experiment/{current_experiment}/jobs/{job_id}")

    if response.status_code == 200:
        if output_format == "json":
            print(json.dumps({"deleted": job_id}))
        else:
            console.print(f"[success]✓[/success] Job [bold]{job_id}[/bold] deleted.")
        return

    detail = _extract_error_detail(response)

    if response.status_code == 404:
        if output_format == "json":
            print(json.dumps({"error": f"Job {job_id} not found", "status_code": 404}))
        else:
            console.print(f"[error]Error:[/error] Job {job_id} not found.")
        raise typer.Exit(1)

    if output_format == "json":
        print(json.dumps({"error": detail or "Failed to delete job", "status_code": response.status_code}))
    else:
        console.print(f"[error]Error:[/error] Failed to delete job. Status code: {response.status_code}")
        if detail:
            console.print(f"[error]Detail:[/error] {detail}")
    raise typer.Exit(1)


@app.command("delete-all")
def command_job_delete_all(
    no_interactive: bool = typer.Option(False, "--no-interactive", help="Skip confirmation prompt"),
):
    """Delete all jobs in the current experiment."""
    check_configs(output_format=cli_state.output_format)
    current_experiment = require_current_experiment()
    output_format = cli_state.output_format

    list_response = api.get(f"/experiment/{current_experiment}/jobs/list")
    existing_count = len(list_response.json()) if list_response.status_code == 200 else 0

    if not no_interactive:
        typer.confirm(
            f"Delete all jobs in experiment '{current_experiment}' ({existing_count} jobs)?",
            abort=True,
        )

    if output_format != "json":
        with console.status(
            f"[bold success]Deleting all jobs in experiment {current_experiment}...[/bold success]",
            spinner="dots",
        ):
            response = api.delete(f"/experiment/{current_experiment}/jobs/delete_all")
    else:
        response = api.delete(f"/experiment/{current_experiment}/jobs/delete_all")

    if response.status_code == 200:
        try:
            payload = response.json()
        except Exception:
            payload = {}
        deleted_count = existing_count
        if isinstance(payload, dict) and isinstance(payload.get("deleted"), int):
            deleted_count = payload["deleted"]
        if output_format == "json":
            print(json.dumps({"deleted": deleted_count}))
        else:
            console.print(f"[success]✓[/success] Deleted [bold]{deleted_count}[/bold] job(s).")
        return

    detail = _extract_error_detail(response)
    if output_format == "json":
        print(json.dumps({"error": detail or "Failed to delete jobs", "status_code": response.status_code}))
    else:
        console.print(f"[error]Error:[/error] Failed to delete jobs. Status code: {response.status_code}")
        if detail:
            console.print(f"[error]Detail:[/error] {detail}")
    raise typer.Exit(1)


@app.command("monitor")
def command_job_monitor():
    """Launch interactive job monitor TUI."""
    from transformerlab_cli.commands.job_monitor.job_monitor import run_monitor

    run_monitor()


@publish_app.command("dataset")
def command_job_publish_dataset(
    job_id: str = typer.Argument(..., help="Job ID that contains the dataset"),
    dataset_name: str | None = typer.Argument(None, help="Dataset name in the job's datasets output"),
    group: str | None = typer.Option(None, "--group", "-g", help="Registry group name (target_name)"),
    mode: str = typer.Option("new", "--mode", help="Publish mode: new or existing"),
    tag: str = typer.Option("latest", "--tag", help="Version tag"),
    description: str | None = typer.Option(None, "--description", "-d", help="Version description"),
):
    """Publish a dataset from a job to the registry. Version label is auto-generated (v1, v2, …)."""
    current_experiment = require_current_experiment()
    if not dataset_name:
        if cli_state.output_format == "json":
            print(json.dumps({"error": "dataset_name is required in --format json mode", "status_code": 1}))
            raise typer.Exit(1)
        dataset_name = _prompt_asset_from_job(
            asset_type="dataset",
            endpoint_collection="datasets",
            experiment_id=current_experiment,
            job_id=job_id,
        )
    if cli_state.output_format != "json":
        mode, group, tag, description = _prompt_publish_options(
            asset_type="dataset",
            job_id=job_id,
            mode=mode,
            group=group,
            tag=tag,
            description=description,
        )
    _publish_job_asset(
        asset_type="dataset",
        endpoint_collection="datasets",
        job_id=job_id,
        asset_name=dataset_name,
        experiment_id=current_experiment,
        group=group,
        mode=mode,
        tag=tag,
        description=description,
    )


@publish_app.command("model")
def command_job_publish_model(
    job_id: str = typer.Argument(..., help="Job ID that contains the model"),
    model_name: str | None = typer.Argument(None, help="Model name in the job's models output"),
    group: str | None = typer.Option(None, "--group", "-g", help="Registry group name (target_name)"),
    mode: str = typer.Option("new", "--mode", help="Publish mode: new or existing"),
    tag: str = typer.Option("latest", "--tag", help="Version tag"),
    description: str | None = typer.Option(None, "--description", "-d", help="Version description"),
):
    """Publish a model from a job to the registry. Version label is auto-generated (v1, v2, …)."""
    current_experiment = require_current_experiment()
    if not model_name:
        if cli_state.output_format == "json":
            print(json.dumps({"error": "model_name is required in --format json mode", "status_code": 1}))
            raise typer.Exit(1)
        model_name = _prompt_asset_from_job(
            asset_type="model",
            endpoint_collection="models",
            experiment_id=current_experiment,
            job_id=job_id,
        )
    if cli_state.output_format != "json":
        mode, group, tag, description = _prompt_publish_options(
            asset_type="model",
            job_id=job_id,
            mode=mode,
            group=group,
            tag=tag,
            description=description,
        )
    _publish_job_asset(
        asset_type="model",
        endpoint_collection="models",
        job_id=job_id,
        asset_name=model_name,
        experiment_id=current_experiment,
        group=group,
        mode=mode,
        tag=tag,
        description=description,
    )


app.add_typer(publish_app, name="publish", help="Publish job outputs to model/dataset registry", no_args_is_help=True)
