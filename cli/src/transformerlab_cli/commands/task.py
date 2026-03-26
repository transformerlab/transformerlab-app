import io
import json
import os
import zipfile

import httpx
import typer
import yaml
from rich.panel import Panel
from rich.syntax import Syntax

import transformerlab_cli.util.api as api
from transformerlab_cli.state import cli_state
from transformerlab_cli.util.config import require_current_experiment
from transformerlab_cli.util.ui import console, render_object, render_table

app = typer.Typer()

REQUIRED_TASK_FIELDS = ["name", "type"]


def list_tasks(output_format: str = "pretty", experiment_id: str = "alpha") -> None:
    """List all REMOTE tasks."""
    if output_format != "json":
        with console.status("[bold success]Fetching tasks...[/bold success]", spinner="dots"):
            response = api.get(f"/experiment/{experiment_id}/task/list_by_type_in_experiment?type=REMOTE")
    else:
        response = api.get(f"/experiment/{experiment_id}/task/list_by_type_in_experiment?type=REMOTE")

    if response.status_code == 200:
        tasks = response.json()
        table_columns = ["id", "name", "type", "created_at", "updated_at"]
        render_table(data=tasks, format_type=output_format, table_columns=table_columns, title="Tasks")
    else:
        if output_format == "json":
            print(json.dumps({"error": f"Failed to fetch tasks. Status code: {response.status_code}"}))
            raise typer.Exit(1)
        console.print(f"[error]Error:[/error] Failed to fetch tasks. Status code: {response.status_code}")


def delete_task(task_id: str, experiment_id: str) -> None:
    """Delete a task by ID."""
    with console.status(f"[bold success]Deleting task {task_id}...[/bold success]", spinner="dots"):
        response = api.get(f"/experiment/{experiment_id}/task/{task_id}/delete")
    if response.status_code == 200:
        body = response.json()
        if body.get("message") == "OK":
            console.print(f"[success]✓[/success] Task [bold]{task_id}[/bold] deleted.")
        else:
            console.print(f"[error]Error:[/error] Task not found. {body.get('message', '')}")
            raise typer.Exit(1)
    else:
        console.print(f"[error]Error:[/error] Failed to delete task. Status code: {response.status_code}")
        raise typer.Exit(1)


def info_task(task_id: str, experiment_id: str) -> None:
    """Get info for a task by ID."""
    with console.status(f"[bold success]Fetching info for task {task_id}...[/bold success]", spinner="dots"):
        response = api.get(f"/experiment/{experiment_id}/task/{task_id}/get")

    if response.status_code == 200:
        task_info = response.json()
        # console.print(f"[bold success]Task Info for ID {task_id}:[/bold success]")
        render_object(task_info)
    else:
        console.print(f"[error]Error:[/error] Failed to fetch task info. Status code: {response.status_code}")


def add_task_from_directory(task_directory_path: str, experiment_id: str, dry_run: bool = False) -> None:
    """Add a task from a local directory containing task.yaml."""
    task_dir = os.path.realpath(task_directory_path)

    if not os.path.isdir(task_dir):
        console.print(f"[error]Error:[/error] Directory not found: {task_dir}")
        raise typer.Exit(1)

    task_yaml_path = os.path.join(task_dir, "task.yaml")
    if not os.path.exists(task_yaml_path):
        console.print(f"[error]Error:[/error] task.yaml not found in {task_dir}")
        console.print("The directory must contain a task.yaml file.")
        raise typer.Exit(1)

    with open(task_yaml_path, "r", encoding="utf-8") as f:
        task_yaml_content = f.read()

    try:
        yaml.safe_load(task_yaml_content)
    except yaml.YAMLError as e:
        console.print(f"[error]Error:[/error] Invalid YAML in task.yaml: {e}")
        raise typer.Exit(1)

    # Validate against server-side task.yaml schema (run, resources, etc.)
    with console.status("[bold success]Validating task.yaml...[/bold success]", spinner="dots"):
        response = api.post_text(
            f"/experiment/{experiment_id}/task2/validate",
            text=task_yaml_content,
        )
    if response.status_code != 200:
        try:
            detail = response.json().get("detail", response.text)
        except (ValueError, KeyError):
            detail = response.text
        console.print("[error]Error:[/error] task.yaml failed validation.")
        console.print(f"[error]Detail:[/error] {detail}")
        raise typer.Exit(1)

    console.print("\n[bold label]Task Configuration (task.yaml):[/bold label]")
    syntax = Syntax(task_yaml_content, "yaml", theme="monokai", line_numbers=True)
    console.print(Panel(syntax, border_style="label"))

    all_files = []
    total_size = 0
    for root, _dirs, files in os.walk(task_dir):
        for name in files:
            file_path = os.path.join(root, name)
            rel_path = os.path.relpath(file_path, task_dir)
            file_size = os.path.getsize(file_path)
            all_files.append((rel_path, file_size))
            total_size += file_size

    if len(all_files) > 1:
        console.print(
            f"\n[bold label]Files to upload ({len(all_files)} files, {_format_size(total_size)}):[/bold label]"
        )
        for rel_path, size in sorted(all_files):
            console.print(f"  • {rel_path} ({_format_size(size)})")
    else:
        console.print(f"\n[bold label]Files to upload:[/bold label] task.yaml ({_format_size(total_size)})")

    if dry_run:
        console.print("\n[warning]Dry run mode:[/warning] Task would be created but was not submitted.")
        return

    if cli_state.output_format != "json" and not typer.confirm("\nProceed with task creation?"):
        console.print("[warning]Cancelled.[/warning]")
        raise typer.Exit(0)

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, _dirs, files in os.walk(task_dir):
            for name in files:
                file_path = os.path.join(root, name)
                arcname = os.path.relpath(file_path, task_dir)
                zf.write(file_path, arcname)
    zip_buffer.seek(0)

    with console.status("[bold success]Creating task...[/bold success]", spinner="dots"):
        response = api.post(
            f"/experiment/{experiment_id}/task2/from_directory",
            files={"directory_zip": ("task.zip", zip_buffer, "application/zip")},
        )

    if response.status_code == 200:
        result = response.json()
        task_id = result.get("id")
        console.print(f"[success]✓[/success] Task created with ID: [bold]{task_id}[/bold]")
    else:
        console.print(f"[error]Error:[/error] Failed to create task. Status code: {response.status_code}")
        try:
            detail = response.json().get("detail", response.text)
            console.print(f"[error]Detail:[/error] {detail}")
        except Exception:
            console.print(f"[error]Response:[/error] {response.text}")
        raise typer.Exit(1)


def add_task_from_github(repo_url: str, experiment_id: str) -> None:
    """Add a task from a GitHub repository URL."""
    with console.status("[bold success]Creating task from GitHub...[/bold success]", spinner="dots"):
        response = api.post_json(
            f"/experiment/{experiment_id}/task2/from_directory",
            json_data={"git_url": repo_url},
        )

    if response.status_code == 200:
        result = response.json()
        task_id = result.get("id")
        console.print(f"[success]✓[/success] Task created with ID: [bold]{task_id}[/bold]")
    else:
        console.print(f"[error]Error:[/error] Failed to create task. Status code: {response.status_code}")
        try:
            detail = response.json().get("detail", response.text)
            console.print(f"[error]Detail:[/error] {detail}")
        except Exception:
            console.print(f"[error]Response:[/error] {response.text}")
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
    current_experiment = require_current_experiment()
    list_tasks(output_format=cli_state.output_format, experiment_id=current_experiment)


@app.command("add")
def command_task_add(
    task_directory: str = typer.Argument(None, help="Path to the task directory containing task.yaml"),
    from_git: str = typer.Option(None, "--from-git", help="Git URL to fetch the task from"),
    dry_run: bool = typer.Option(False, "--dry-run", help="Preview the task without creating it"),
):
    """Add a new task. Provide a directory path directly, or use --from-git to fetch from a Git repository."""
    current_experiment = require_current_experiment()

    if from_git:
        add_task_from_github(from_git, experiment_id=current_experiment)
    elif task_directory:
        add_task_from_directory(task_directory, experiment_id=current_experiment, dry_run=dry_run)
    else:
        console.print("[error]Error:[/error] Provide a task directory path or use --from-git <url>")
        raise typer.Exit(1)


@app.command("delete")
def command_task_delete(
    task_id: str = typer.Argument(..., help="Task ID to delete"),
):
    """Delete a task."""
    current_experiment = require_current_experiment()
    delete_task(task_id, experiment_id=current_experiment)


@app.command("info")
def command_task_info(
    task_id: str = typer.Argument(..., help="Task ID to get info for"),
):
    """Get task details."""
    current_experiment = require_current_experiment()
    info_task(task_id, current_experiment)


def fetch_providers() -> list[dict]:
    """Fetch available compute providers."""
    try:
        response = api.get("/compute_provider/")
        if response.status_code == 200:
            return response.json()
    except httpx.HTTPError:
        pass
    return []


def build_launch_payload(
    task: dict,
    provider_name: str,
    param_values: dict | None = None,
    resource_overrides: dict | None = None,
) -> dict:
    """Build the payload for launching a task on a provider."""
    cfg = task.get("config") or {}
    overrides = resource_overrides or {}

    def pick(field: str):
        if field in overrides and overrides[field] not in (None, ""):
            return overrides[field]
        if field in task and task[field] not in (None, ""):
            return task[field]
        if isinstance(cfg, dict) and field in cfg and cfg[field] not in (None, ""):
            return cfg[field]
        return None

    return {
        "experiment_id": task.get("experiment_id"),
        "task_id": task.get("id"),
        "task_name": task.get("name"),
        "run": task.get("run"),
        "setup": task.get("setup"),
        "cpus": pick("cpus"),
        "memory": pick("memory"),
        "disk_space": pick("disk_space"),
        "accelerators": pick("accelerators"),
        "num_nodes": pick("num_nodes"),
        "minutes_requested": pick("minutes_requested"),
        "env_vars": task.get("env_vars", {}),
        "parameters": task.get("parameters", {}),
        "config": param_values if param_values else None,
        "provider_name": provider_name,
        "github_repo_url": task.get("github_repo_url"),
        "github_repo_dir": task.get("github_repo_dir") or task.get("github_directory"),
        "github_repo_branch": task.get("github_repo_branch") or task.get("github_branch"),
    }


def _print_resources(task: dict) -> dict:
    """Print current resource requirements and return them."""
    cfg = task.get("config") or {}

    def get(field: str):
        if field in task and task[field] not in (None, ""):
            return task[field]
        if isinstance(cfg, dict) and field in cfg and cfg[field] not in (None, ""):
            return cfg[field]
        return None

    current = {
        "cpus": get("cpus"),
        "memory": get("memory"),
        "disk_space": get("disk_space"),
        "accelerators": get("accelerators"),
        "num_nodes": get("num_nodes"),
        "minutes_requested": get("minutes_requested"),
    }

    console.print("\n[bold label]Resource requirements:[/bold label]")
    console.print(f"  CPUs: {current['cpus'] or '[not set]'}")
    console.print(f"  Memory: {current['memory'] or '[not set]'}")
    console.print(f"  Disk space: {current['disk_space'] or '[not set]'}")
    console.print(f"  Accelerators: {current['accelerators'] or '[not set]'}")
    console.print(f"  Num nodes: {current['num_nodes'] or '[not set]'}")
    console.print(f"  Minutes requested: {current['minutes_requested'] or '[not set]'}")

    return current


def _prompt_resource_overrides(current: dict) -> dict:
    """Prompt the user to override resource requirements."""
    overrides: dict = {}

    def ask(label: str, key: str, parse_int: bool = False):
        default = current.get(key)
        default_str = str(default) if default not in (None, "") else ""
        result = typer.prompt(label, default=default_str, show_default=bool(default_str))
        result = result.strip()
        if not result:
            return
        if parse_int:
            try:
                overrides[key] = int(result)
            except ValueError:
                # Skip invalid int; keep default behavior
                return
        else:
            overrides[key] = result

    ask("CPUs", "cpus")
    ask("Memory", "memory")
    ask("Disk space", "disk_space")
    ask("Accelerators", "accelerators")
    ask("Num nodes", "num_nodes")
    ask("Minutes requested", "minutes_requested", parse_int=True)

    return overrides


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
    console.print("\n[bold label]Available Providers:[/bold label]")
    for i, provider in enumerate(providers, 1):
        console.print(f"  [bold]{i}[/bold]. {provider.get('name', provider.get('id'))}")

    while True:
        choice = typer.prompt("\nSelect a provider", default="1")
        try:
            idx = int(choice) - 1
            if 0 <= idx < len(providers):
                return providers[idx]
            console.print(f"[error]Please enter a number between 1 and {len(providers)}[/error]")
        except ValueError:
            console.print("[error]Please enter a valid number[/error]")


def _prompt_parameters(parameters: dict) -> dict:
    """Prompt user for each parameter value, showing defaults."""
    if not parameters:
        return {}

    console.print("\n[bold label]Task Parameters:[/bold label]")
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
    with console.status("[bold success]Fetching task...[/bold success]", spinner="dots"):
        response = api.get(f"/experiment/{experiment_id}/task/{task_id}/get")

    if response.status_code != 200:
        console.print(f"[error]Error:[/error] Failed to fetch task. Status code: {response.status_code}")
        raise typer.Exit(1)

    task = response.json()
    console.print(f"\n[bold]Task:[/bold] {task.get('name', 'Unknown')}")

    resource_overrides: dict | None = None
    if interactive:
        current_resources = _print_resources(task)
        if not typer.confirm("\nUse these resource requirements?", default=True):
            resource_overrides = _prompt_resource_overrides(current_resources)

    with console.status("[bold success]Fetching providers...[/bold success]", spinner="dots"):
        providers = fetch_providers()

    if not providers:
        console.print("[error]Error:[/error] No compute providers available. Add one in team settings first.")
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

    payload = build_launch_payload(task, provider.get("name"), param_values, resource_overrides)
    provider_id = provider.get("id")

    with console.status("[bold success]Queuing task...[/bold success]", spinner="dots"):
        try:
            data = launch_task_on_provider(provider_id, payload)
            job_id = data.get("job_id", "unknown")
            console.print(f"[success]✓[/success] Task queued successfully. Job ID: [bold]{job_id}[/bold]")
        except RuntimeError as e:
            console.print(f"[error]Error:[/error] {e}")
            raise typer.Exit(1)


@app.command("queue")
def command_task_queue(
    task_id: str = typer.Argument(..., help="Task ID to queue"),
    no_interactive: bool = typer.Option(False, "--no-interactive", help="Skip interactive prompts, use defaults"),
):
    """Queue a task on a compute provider."""
    current_experiment = require_current_experiment()
    queue_task(task_id, experiment_id=current_experiment, interactive=not no_interactive)


def gallery_tasks(output_format: str = "pretty", gallery_type: str = "all", experiment_id: str = "alpha") -> list[dict]:
    """Fetch and display the task gallery."""
    if gallery_type == "interactive":
        endpoint = f"/experiment/{experiment_id}/task/gallery/interactive"
        table_columns = ["id", "name", "interactive_type", "description"]
    else:
        endpoint = f"/experiment/{experiment_id}/task/gallery"
        # Tasks gallery entries use "title" and "metadata" (category/modality/framework),
        # so we normalize them into flat fields for display.
        table_columns = ["index", "title", "category", "modality", "framework", "description"]

    if output_format != "json":
        with console.status("[bold green]Fetching gallery...[/bold green]", spinner="dots"):
            response = api.get(endpoint)
    else:
        response = api.get(endpoint)

    if response.status_code != 200:
        if output_format == "json":
            print(json.dumps({"error": f"Failed to fetch gallery. Status code: {response.status_code}"}))
            raise typer.Exit(1)
        console.print(f"[red]Error:[/red] Failed to fetch gallery. Status code: {response.status_code}")
        raise typer.Exit(1)

    data = response.json()
    items = data.get("data", data) if isinstance(data, dict) else data

    # For the main tasks gallery ("all"), entries are simple gallery records with
    # fields like title/description/metadata, not task objects. Normalize them for display.
    if gallery_type != "interactive" and output_format != "json":
        normalized: list[dict] = []
        for idx, item in enumerate(items):
            metadata = item.get("metadata") or {}
            frameworks = metadata.get("framework")
            if isinstance(frameworks, list):
                frameworks_str = ", ".join(str(f) for f in frameworks)
            else:
                frameworks_str = str(frameworks) if frameworks is not None else ""

            normalized.append(
                {
                    "index": idx,
                    "title": item.get("title", item.get("name", "")),
                    "description": item.get("description", ""),
                    "category": metadata.get("category", ""),
                    "modality": metadata.get("modality", ""),
                    "framework": frameworks_str,
                }
            )
        render_table(data=normalized, format_type=output_format, table_columns=table_columns, title="Task Gallery")
        return normalized

    # Interactive gallery (or JSON output) – pass through as-is
    render_table(data=items, format_type=output_format, table_columns=table_columns, title="Task Gallery")
    return items


def import_from_gallery(
    gallery_id: str, experiment_id: str, is_interactive: bool, output_format: str = "pretty"
) -> None:
    """Import a task from the gallery."""
    payload = {
        "gallery_id": gallery_id,
        "experiment_id": experiment_id,
        "is_interactive": is_interactive,
    }

    if output_format != "json":
        with console.status("[bold green]Importing task...[/bold green]", spinner="dots"):
            response = api.post_json(f"/experiment/{experiment_id}/task/gallery/import", payload)
    else:
        response = api.post_json(f"/experiment/{experiment_id}/task/gallery/import", payload)

    if response.status_code == 200:
        result = response.json()
        task_id = result.get("id")
        if output_format == "json":
            print(json.dumps({"task_id": task_id}))
        else:
            console.print(f"[green]✓[/green] Task imported with ID: [bold]{task_id}[/bold]")
    else:
        if output_format == "json":
            print(json.dumps({"error": f"Failed to import task. Status code: {response.status_code}"}))
            raise typer.Exit(1)
        console.print(f"[red]Error:[/red] Failed to import task. Status code: {response.status_code}")
        raise typer.Exit(1)


@app.command("gallery")
def command_task_gallery(
    gallery_type: str = typer.Option("all", "--type", help="Gallery type: 'all' or 'interactive'"),
    import_id: str | None = typer.Option(None, "--import", help="Gallery ID to import as a task"),
):
    """Browse the task gallery. Use --import <id> to add a task to the current experiment."""
    current_experiment = require_current_experiment()
    output_format = cli_state.output_format
    is_interactive = gallery_type == "interactive"

    if import_id:
        import_from_gallery(import_id, current_experiment, is_interactive, output_format)
        return

    gallery_tasks(output_format=output_format, gallery_type=gallery_type, experiment_id=current_experiment)

    if output_format == "json":
        return

    choice = typer.prompt("\nImport a task? Enter gallery ID or press Enter to skip", default="")
    if choice.strip():
        import_from_gallery(choice.strip(), current_experiment, is_interactive, output_format)


@app.command("interactive")
def command_task_interactive(
    timeout: int = typer.Option(300, "--timeout", "-t", help="Timeout in seconds waiting for service readiness"),
):
    """Launch an interactive task (Jupyter, vLLM, Ollama, etc.)."""
    from transformerlab_cli.commands.interactive import interactive

    interactive(timeout=timeout)
