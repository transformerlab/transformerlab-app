import io
import os
import zipfile
from pathlib import Path

import typer
import yaml
from rich.console import Console
from rich.panel import Panel
from rich.syntax import Syntax

import transformerlab_cli.util.api as api
from transformerlab_cli.util.config import check_configs, get_config
from transformerlab_cli.util.ui import render_object, render_table

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


def add_task_from_directory(task_directory_path: str, experiment_id: str, dry_run: bool = False) -> None:
    """Add a task from a local directory containing task.yaml."""
    task_dir = Path(task_directory_path).resolve()

    if not task_dir.is_dir():
        console.print(f"[red]Error:[/red] Directory not found: {task_dir}")
        raise typer.Exit(1)

    task_yaml_path = task_dir / "task.yaml"
    if not task_yaml_path.exists():
        console.print(f"[red]Error:[/red] task.yaml not found in {task_dir}")
        console.print("The directory must contain a task.yaml file.")
        raise typer.Exit(1)

    with open(task_yaml_path, "r", encoding="utf-8") as f:
        task_yaml_content = f.read()

    try:
        yaml.safe_load(task_yaml_content)
    except yaml.YAMLError as e:
        console.print(f"[red]Error:[/red] Invalid YAML in task.yaml: {e}")
        raise typer.Exit(1)

    console.print("\n[bold cyan]Task Configuration (task.yaml):[/bold cyan]")
    syntax = Syntax(task_yaml_content, "yaml", theme="monokai", line_numbers=True)
    console.print(Panel(syntax, border_style="cyan"))

    all_files = []
    total_size = 0
    for root, _dirs, files in os.walk(task_dir):
        for name in files:
            file_path = Path(root) / name
            rel_path = file_path.relative_to(task_dir)
            file_size = file_path.stat().st_size
            all_files.append((str(rel_path), file_size))
            total_size += file_size

    if len(all_files) > 1:
        console.print(f"\n[bold cyan]Files to upload ({len(all_files)} files, {_format_size(total_size)}):[/bold cyan]")
        for rel_path, size in sorted(all_files):
            console.print(f"  • {rel_path} ({_format_size(size)})")
    else:
        console.print(f"\n[bold cyan]Files to upload:[/bold cyan] task.yaml ({_format_size(total_size)})")

    if dry_run:
        console.print("\n[yellow]Dry run mode:[/yellow] Task would be created but was not submitted.")
        return

    if not typer.confirm("\nProceed with task creation?"):
        console.print("[yellow]Cancelled.[/yellow]")
        raise typer.Exit(0)

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, _dirs, files in os.walk(task_dir):
            for name in files:
                file_path = Path(root) / name
                arcname = file_path.relative_to(task_dir)
                zf.write(file_path, arcname)
    zip_buffer.seek(0)

    with console.status("[bold green]Creating task...[/bold green]", spinner="dots"):
        response = api.post(
            f"/experiment/{experiment_id}/task2/from_directory",
            files={"directory_zip": ("task.zip", zip_buffer, "application/zip")},
        )

    if response.status_code == 200:
        result = response.json()
        task_id = result.get("id")
        console.print(f"[green]✓[/green] Task created with ID: [bold]{task_id}[/bold]")
    else:
        console.print(f"[red]Error:[/red] Failed to create task. Status code: {response.status_code}")
        try:
            detail = response.json().get("detail", response.text)
            console.print(f"[red]Detail:[/red] {detail}")
        except Exception:
            console.print(f"[red]Response:[/red] {response.text}")
        raise typer.Exit(1)


def add_task_from_github(repo_url: str, experiment_id: str) -> None:
    """Add a task from a GitHub repository URL."""
    with console.status("[bold green]Creating task from GitHub...[/bold green]", spinner="dots"):
        response = api.post_json(
            f"/experiment/{experiment_id}/task2/from_directory",
            json_data={"git_url": repo_url},
        )

    if response.status_code == 200:
        result = response.json()
        task_id = result.get("id")
        console.print(f"[green]✓[/green] Task created with ID: [bold]{task_id}[/bold]")
    else:
        console.print(f"[red]Error:[/red] Failed to create task. Status code: {response.status_code}")
        try:
            detail = response.json().get("detail", response.text)
            console.print(f"[red]Detail:[/red] {detail}")
        except Exception:
            console.print(f"[red]Response:[/red] {response.text}")
        raise typer.Exit(1)


def _format_size(size_bytes: int) -> str:
    """Format bytes into human-readable size."""
    for unit in ["B", "KB", "MB", "GB"]:
        if size_bytes < 1024:
            return f"{size_bytes:.1f} {unit}"
        size_bytes //= 1024
    return f"{size_bytes:.1f} TB"


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
    task_directory: str = typer.Argument(None, help="Path to the task directory containing task.yaml"),
    from_git: str = typer.Option(None, "--from-git", help="Git URL to fetch the task from"),
    dry_run: bool = typer.Option(False, "--dry-run", help="Preview the task without creating it"),
):
    """Add a new task. Provide a directory path directly, or use --from-git to fetch from a Git repository."""
    check_configs()
    current_experiment = get_config("current_experiment")
    if not current_experiment or not str(current_experiment).strip():
        console.print("[yellow]current_experiment is not set in config.[/yellow]")
        console.print("Set it first with: [bold]lab config current_experiment <experiment_name>[/bold]")
        raise typer.Exit(1)

    if from_git:
        add_task_from_github(from_git, experiment_id=current_experiment)
    elif task_directory:
        add_task_from_directory(task_directory, experiment_id=current_experiment, dry_run=dry_run)
    else:
        console.print("[red]Error:[/red] Provide a task directory path or use --from-git <url>")
        raise typer.Exit(1)


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


def fetch_providers() -> list[dict]:
    """Fetch available compute providers."""
    try:
        response = api.get("/compute_provider/")
        if response.status_code == 200:
            return response.json()
    except Exception:
        pass
    return []


def build_launch_payload(task: dict, provider_name: str, param_values: dict | None = None) -> dict:
    """Build the payload for launching a task on a provider."""
    return {
        "experiment_id": task.get("experiment_id"),
        "task_id": task.get("id"),
        "task_name": task.get("name"),
        "command": task.get("command"),
        "setup": task.get("setup"),
        "accelerators": task.get("accelerators"),
        "env_vars": task.get("env_vars", {}),
        "parameters": task.get("parameters", {}),
        "config": param_values if param_values else None,
        "provider_name": provider_name,
        "github_repo_url": task.get("github_repo_url"),
        "github_directory": task.get("github_directory"),
    }


def launch_task_on_provider(provider_id: str, payload: dict) -> dict:
    """Launch a task on a provider. Returns the response JSON or raises."""
    response = api.post_json(f"/compute_provider/{provider_id}/task/launch", payload)
    if response.status_code == 200:
        return response.json()
    try:
        detail = response.json().get("detail", response.text)
    except Exception:
        detail = response.text
    raise RuntimeError(f"Failed to queue task: {detail}")


def _prompt_provider(providers: list[dict]) -> dict:
    """Prompt user to select a provider from the list."""
    console.print("\n[bold cyan]Available Providers:[/bold cyan]")
    for i, provider in enumerate(providers, 1):
        console.print(f"  [bold]{i}[/bold]. {provider.get('name', provider.get('id'))}")

    while True:
        choice = typer.prompt("\nSelect a provider", default="1")
        try:
            idx = int(choice) - 1
            if 0 <= idx < len(providers):
                return providers[idx]
            console.print(f"[red]Please enter a number between 1 and {len(providers)}[/red]")
        except ValueError:
            console.print("[red]Please enter a valid number[/red]")


def _prompt_parameters(parameters: dict) -> dict:
    """Prompt user for each parameter value, showing defaults."""
    if not parameters:
        return {}

    console.print("\n[bold cyan]Task Parameters:[/bold cyan]")
    values = {}

    for key, raw_value in parameters.items():
        if isinstance(raw_value, dict) and "type" in raw_value:
            schema = raw_value
            title = schema.get("title", key)
            default = schema.get("default", "")
            param_type = schema.get("type", "string")
            options = schema.get("options", schema.get("enum", []))

            hint_parts = [f"type: {param_type}"]
            if schema.get("min") is not None:
                hint_parts.append(f"min: {schema['min']}")
            if schema.get("max") is not None:
                hint_parts.append(f"max: {schema['max']}")
            if options:
                hint_parts.append(f"options: {', '.join(str(o) for o in options)}")

            hint = f" ({', '.join(hint_parts)})" if hint_parts else ""
            result = typer.prompt(f"  {title}{hint}", default=str(default) if default != "" else "", show_default=True)
        else:
            default = raw_value
            result = typer.prompt(f"  {key}", default=str(default) if default != "" else "", show_default=True)

        values[key] = result

    return values


def queue_task(task_id: str, experiment_id: str, interactive: bool = True) -> None:
    """Queue a task on a compute provider."""
    with console.status("[bold green]Fetching task...[/bold green]", spinner="dots"):
        response = api.get(f"/experiment/{experiment_id}/task/{task_id}/get")

    if response.status_code != 200:
        console.print(f"[red]Error:[/red] Failed to fetch task. Status code: {response.status_code}")
        raise typer.Exit(1)

    task = response.json()
    console.print(f"\n[bold]Task:[/bold] {task.get('name', 'Unknown')}")

    with console.status("[bold green]Fetching providers...[/bold green]", spinner="dots"):
        providers = fetch_providers()

    if not providers:
        console.print("[red]Error:[/red] No compute providers available. Add one in team settings first.")
        raise typer.Exit(1)

    if interactive:
        provider = _prompt_provider(providers)
    else:
        task_provider_id = task.get("provider_id")
        provider = next((p for p in providers if p.get("id") == task_provider_id), None)
        if not provider:
            provider = providers[0]
        console.print(f"[dim]Using provider: {provider.get('name')}[/dim]")

    parameters = task.get("parameters", {})
    if interactive and parameters:
        param_values = _prompt_parameters(parameters)
    else:
        param_values = {k: (v.get("default", "") if isinstance(v, dict) else v) for k, v in parameters.items()}

    payload = build_launch_payload(task, provider.get("name"), param_values)
    provider_id = provider.get("id")

    with console.status("[bold green]Queuing task...[/bold green]", spinner="dots"):
        try:
            data = launch_task_on_provider(provider_id, payload)
            job_id = data.get("job_id", "unknown")
            console.print(f"[green]✓[/green] Task queued successfully. Job ID: [bold]{job_id}[/bold]")
        except RuntimeError as e:
            console.print(f"[red]Error:[/red] {e}")
            raise typer.Exit(1)


@app.command("queue")
def command_task_queue(
    task_id: str = typer.Argument(..., help="Task ID to queue"),
    no_interactive: bool = typer.Option(False, "--no-interactive", help="Skip interactive prompts, use defaults"),
):
    """Queue a task on a compute provider."""
    check_configs()
    current_experiment = get_config("current_experiment")
    if not current_experiment or not str(current_experiment).strip():
        console.print("[yellow]current_experiment is not set in config.[/yellow]")
        console.print("Set it first with: [bold]lab config current_experiment <experiment_name>[/bold]")
        raise typer.Exit(1)
    queue_task(task_id, experiment_id=current_experiment, interactive=not no_interactive)
