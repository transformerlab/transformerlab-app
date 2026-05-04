import json
import math
import os
import tempfile
import sys
import zipfile
from pathlib import Path

import httpx
import typer
import yaml
from rich.panel import Panel
from rich.progress import BarColumn, MofNCompleteColumn, Progress, TextColumn
from rich.syntax import Syntax

import transformerlab_cli.util.api as api
from transformerlab_cli.util import chunked_upload
from transformerlab_cli.state import cli_state
from transformerlab_cli.util.config import require_current_experiment
from transformerlab_cli.util.ui import console, render_object, render_table

app = typer.Typer()

REQUIRED_TASK_FIELDS = ["name", "type"]


def _extract_error_detail(response: httpx.Response) -> str:
    """Extract a human-readable error detail from API responses."""
    try:
        payload = response.json()
    except Exception:
        return response.text

    detail = payload.get("detail", payload)
    if isinstance(detail, dict):
        message = detail.get("message") or detail.get("error") or str(detail)
        hint = detail.get("hint")
        return f"{message} ({hint})" if hint else message
    if isinstance(detail, list):
        return "; ".join(str(item) for item in detail)
    return str(detail)


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


def _submit_task_directory(
    task_directory_path: str,
    experiment_id: str,
    endpoint_path: str,
    success_verb: str,
    dry_run: bool = False,
    interactive: bool = True,
    confirm_prompt: str = "Proceed?",
) -> None:
    """Upload task directory and submit it to a task endpoint."""
    task_dir = os.path.realpath(task_directory_path)

    if not os.path.isdir(task_dir):
        console.print(f"[error]Error:[/error] Directory not found: {task_dir}")
        raise typer.Exit(1)

    task_yaml_path = os.path.join(task_dir, "task.yaml")
    if not os.path.exists(task_yaml_path):
        console.print(f"[error]Error:[/error] task.yaml not found in {task_dir}")
        console.print("The directory must contain a task.yaml file.")
        raise typer.Exit(1)

    task_yaml_content = _validate_task_yaml_file(task_yaml_path, experiment_id=experiment_id)

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
        console.print(f"\n[warning]Dry run mode:[/warning] Task would be {success_verb} but was not submitted.")
        return

    if interactive and cli_state.output_format != "json" and not typer.confirm(f"\n{confirm_prompt}"):
        console.print("[warning]Cancelled.[/warning]")
        raise typer.Exit(0)

    tmp_zip = tempfile.NamedTemporaryFile(suffix=".zip", delete=False)
    tmp_zip_path = tmp_zip.name
    tmp_zip.close()

    try:
        with zipfile.ZipFile(tmp_zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for root, _dirs, files in os.walk(task_dir):
                for name in files:
                    file_path = os.path.join(root, name)
                    arcname = os.path.relpath(file_path, task_dir)
                    zf.write(file_path, arcname)

        zip_size = os.path.getsize(tmp_zip_path)

        with Progress(
            TextColumn("[bold success]{task.description}"),
            BarColumn(),
            MofNCompleteColumn(),
            console=console,
        ) as progress:
            CHUNK_SIZE = 64 * 1024 * 1024  # mirrors api/transformerlab/services/upload_service.py
            total_chunks = math.ceil(zip_size / CHUNK_SIZE) or 1
            progress_task = progress.add_task("Uploading", total=total_chunks)
            try:
                upload_id = chunked_upload.upload_one_file(
                    tmp_zip_path,
                    server_filename="task.zip",
                    progress=progress,
                    progress_task=progress_task,
                )
            except RuntimeError as exc:
                console.print(f"[error]Error:[/error] {exc}")
                raise typer.Exit(1)

        with console.status("[bold success]Submitting task...[/bold success]", spinner="dots"):
            response = api.post_json(
                f"/experiment/{experiment_id}/task/{endpoint_path}?upload_id={upload_id}",
                json_data={},
                timeout=None,
            )
    finally:
        os.unlink(tmp_zip_path)

    if response.status_code == 200:
        result = response.json()
        response_task_id = result.get("id")
        console.print(f"[success]✓[/success] Task {success_verb} with ID: [bold]{response_task_id}[/bold]")
    else:
        console.print(f"[error]Error:[/error] Failed to {success_verb} task. Status code: {response.status_code}")
        try:
            detail = response.json().get("detail", response.text)
            console.print(f"[error]Detail:[/error] {detail}")
        except Exception:
            console.print(f"[error]Response:[/error] {response.text}")
        raise typer.Exit(1)


def _upload_path_to_server(path_to_upload: str) -> str:
    """Create zip upload for a file or directory and return upload_id."""
    source_path = os.path.realpath(path_to_upload)
    if not os.path.exists(source_path):
        console.print(f"[error]Error:[/error] Path not found: {source_path}")
        raise typer.Exit(1)

    CHUNK_SIZE = 64 * 1024 * 1024  # 64 MB
    tmp_zip = tempfile.NamedTemporaryFile(suffix=".zip", delete=False)
    tmp_zip_path = tmp_zip.name
    tmp_zip.close()

    try:
        with zipfile.ZipFile(tmp_zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            if os.path.isdir(source_path):
                for root, _dirs, files in os.walk(source_path):
                    for name in files:
                        file_path = os.path.join(root, name)
                        arcname = os.path.relpath(file_path, source_path)
                        zf.write(file_path, arcname)
            else:
                zf.write(source_path, os.path.basename(source_path))

        zip_size = os.path.getsize(tmp_zip_path)
        total_chunks = math.ceil(zip_size / CHUNK_SIZE)

        with console.status("[bold success]Initialising upload...[/bold success]", spinner="dots"):
            init_resp = api.post_json(
                "/upload/init",
                json_data={"filename": "task-upload.zip", "total_size": zip_size},
            )
        if init_resp.status_code != 200:
            console.print(f"[error]Error:[/error] Upload init failed ({init_resp.status_code})")
            raise typer.Exit(1)

        upload_id = init_resp.json()["upload_id"]
        status_resp = api.get(f"/upload/{upload_id}/status")
        already_received: set[int] = set(
            status_resp.json().get("received", []) if status_resp.status_code == 200 else []
        )

        with open(tmp_zip_path, "rb") as zip_fh:
            with Progress(
                TextColumn("[bold success]{task.description}"),
                BarColumn(),
                MofNCompleteColumn(),
                console=console,
            ) as progress:
                upload_task = progress.add_task("Uploading", total=total_chunks)
                progress.advance(upload_task, len(already_received))
                for i in range(total_chunks):
                    if i in already_received:
                        continue
                    start = i * CHUNK_SIZE
                    zip_fh.seek(start)
                    chunk_data = zip_fh.read(CHUNK_SIZE)
                    chunk_resp = api.put(
                        f"/upload/{upload_id}/chunk?chunk_index={i}",
                        content=chunk_data,
                        headers={"Content-Type": "application/octet-stream"},
                    )
                    if chunk_resp.status_code != 200:
                        console.print(f"[error]Error:[/error] Chunk {i} failed ({chunk_resp.status_code})")
                        raise typer.Exit(1)
                    progress.advance(upload_task)

        with console.status("[bold success]Assembling upload...[/bold success]", spinner="dots"):
            complete_resp = api.post_json(
                f"/upload/{upload_id}/complete",
                json_data={"total_chunks": total_chunks},
                timeout=None,
            )
        if complete_resp.status_code != 200:
            console.print(f"[error]Error:[/error] Upload complete failed ({complete_resp.status_code})")
            raise typer.Exit(1)

        return upload_id
    finally:
        os.unlink(tmp_zip_path)


def add_task_from_directory(
    task_directory_path: str, experiment_id: str, dry_run: bool = False, interactive: bool = True
) -> None:
    """Add a task from a local directory containing task.yaml."""
    _submit_task_directory(
        task_directory_path=task_directory_path,
        experiment_id=experiment_id,
        endpoint_path="create",
        success_verb="created",
        dry_run=dry_run,
        interactive=interactive,
        confirm_prompt="Proceed with task creation?",
    )


def edit_task_from_directory(
    task_id: str, task_directory_path: str, experiment_id: str, dry_run: bool = False, interactive: bool = True
) -> None:
    """Edit an existing task from a local directory containing task.yaml."""
    _submit_task_directory(
        task_directory_path=task_directory_path,
        experiment_id=experiment_id,
        endpoint_path=f"{task_id}/edit",
        success_verb="updated",
        dry_run=dry_run,
        interactive=interactive,
        confirm_prompt=f"Proceed with task update for {task_id}?",
    )


def edit_task_yaml(
    task_id: str,
    experiment_id: str,
    yaml_file: str | None = None,
    interactive: bool = True,
    timeout_seconds: int = 300,
) -> None:
    """Edit an existing task's task.yaml."""
    if yaml_file:
        yaml_path = os.path.realpath(yaml_file)
        if not os.path.isfile(yaml_path):
            console.print(f"[error]Error:[/error] YAML file not found: {yaml_path}")
            raise typer.Exit(1)
        with open(yaml_path, "r", encoding="utf-8") as f:
            edited_yaml = f.read()
    else:
        with console.status("[bold success]Fetching current task.yaml...[/bold success]", spinner="dots"):
            response = api.get(f"/experiment/{experiment_id}/task/{task_id}/yaml", timeout=float(timeout_seconds))
        if response.status_code != 200:
            console.print(f"[error]Error:[/error] Failed to fetch task.yaml. Status code: {response.status_code}")
            raise typer.Exit(1)
        current_yaml = response.text

        if interactive and cli_state.output_format != "json":
            edited = typer.edit(current_yaml)
            if edited is None:
                console.print("[warning]Cancelled.[/warning]")
                raise typer.Exit(0)
            edited_yaml = edited
        else:
            console.print("[error]Error:[/error] Non-interactive mode requires --from-file <path-to-task.yaml>")
            raise typer.Exit(1)

    _validate_task_yaml_content(edited_yaml, experiment_id=experiment_id, timeout_seconds=timeout_seconds)

    with console.status("[bold success]Saving task.yaml...[/bold success]", spinner="dots"):
        save_response = api.put(
            f"/experiment/{experiment_id}/task/{task_id}/yaml",
            content=edited_yaml.encode("utf-8"),
            headers={"Content-Type": "text/plain"},
            timeout=float(timeout_seconds),
        )
    if save_response.status_code == 200:
        console.print(f"[success]✓[/success] Task [bold]{task_id}[/bold] updated.")
        return

    console.print(f"[error]Error:[/error] Failed to update task. Status code: {save_response.status_code}")
    try:
        detail = save_response.json().get("detail", save_response.text)
        console.print(f"[error]Detail:[/error] {detail}")
    except Exception:
        console.print(f"[error]Response:[/error] {save_response.text}")
    raise typer.Exit(1)


def upload_files_to_task(task_id: str, path_to_upload: str, experiment_id: str, interactive: bool = True) -> None:
    """Upload additional files to an existing task from a file or directory."""
    source_path = os.path.realpath(path_to_upload)
    if interactive and cli_state.output_format != "json":
        if not typer.confirm(f"Upload files from {source_path} to task {task_id}?"):
            console.print("[warning]Cancelled.[/warning]")
            raise typer.Exit(0)

    upload_id = _upload_path_to_server(source_path)
    with console.status("[bold success]Uploading files to task...[/bold success]", spinner="dots"):
        response = api.post_json(
            f"/experiment/{experiment_id}/task/{task_id}/upload?upload_id={upload_id}",
            json_data={},
            timeout=None,
        )
    if response.status_code == 200:
        console.print(f"[success]✓[/success] Files uploaded to task [bold]{task_id}[/bold].")
        return
    console.print(f"[error]Error:[/error] Failed to upload files. Status code: {response.status_code}")
    try:
        detail = response.json().get("detail", response.text)
        console.print(f"[error]Detail:[/error] {detail}")
    except Exception:
        console.print(f"[error]Response:[/error] {response.text}")
    raise typer.Exit(1)


def add_task_from_github(repo_url: str, experiment_id: str, interactive: bool = True) -> None:
    """Add a task from a GitHub repository URL."""
    with console.status("[bold success]Creating task from GitHub...[/bold success]", spinner="dots"):
        response = api.post_json(
            f"/experiment/{experiment_id}/task/create",
            json_data={"github_repo_url": repo_url},
        )

    if response.status_code == 404:
        # Unified backend returns 404 when task.yaml is missing in the repo/path.
        # Mirror the UI behavior by offering to create a default task.yaml.
        try:
            detail = response.json().get("detail", "")
        except Exception:
            detail = response.text
        if "task.yaml" in str(detail).lower():
            if interactive and cli_state.output_format != "json":
                console.print(
                    "[warning]task.yaml was not found in the repository.[/warning]\n"
                    "You can create a task using a default task.yaml template."
                )
                should_retry = typer.confirm("Create task with default task.yaml?", default=True)
            else:
                should_retry = True
            if should_retry:
                with console.status(
                    "[bold success]Creating task with default task.yaml...[/bold success]",
                    spinner="dots",
                ):
                    response = api.post_json(
                        f"/experiment/{experiment_id}/task/create",
                        json_data={"github_repo_url": repo_url, "create_if_missing": True},
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


def _validate_task_yaml_content(
    task_yaml_content: str,
    experiment_id: str,
    timeout_seconds: int | None = None,
    output_format: str = "pretty",
) -> None:
    try:
        yaml.safe_load(task_yaml_content)
    except yaml.YAMLError as e:
        if output_format == "json":
            print(json.dumps({"error": f"Invalid YAML in task.yaml: {e}"}))
        else:
            console.print(f"[error]Error:[/error] Invalid YAML in task.yaml: {e}")
        raise typer.Exit(1)

    post_kwargs: dict = {"text": task_yaml_content}
    if timeout_seconds is not None:
        post_kwargs["timeout"] = float(timeout_seconds)

    if output_format != "json":
        with console.status("[bold success]Validating task.yaml...[/bold success]", spinner="dots"):
            response = api.post_text(f"/experiment/{experiment_id}/task/validate", **post_kwargs)
    else:
        response = api.post_text(f"/experiment/{experiment_id}/task/validate", **post_kwargs)
    if response.status_code != 200:
        try:
            detail = response.json().get("detail", response.text)
        except (ValueError, KeyError):
            detail = response.text
        if output_format == "json":
            print(json.dumps({"error": "task.yaml failed validation", "detail": detail}))
        else:
            console.print("[error]Error:[/error] task.yaml failed validation.")
            console.print(f"[error]Detail:[/error] {detail}")
        raise typer.Exit(1)


def _validate_task_yaml_file(
    task_yaml_path: str,
    experiment_id: str,
    timeout_seconds: int | None = None,
    output_format: str = "pretty",
) -> str:
    if not os.path.isfile(task_yaml_path):
        if output_format == "json":
            print(json.dumps({"error": f"task.yaml not found: {task_yaml_path}"}))
        else:
            console.print(f"[error]Error:[/error] task.yaml not found: {task_yaml_path}")
        raise typer.Exit(1)

    with open(task_yaml_path, "r", encoding="utf-8") as f:
        task_yaml_content = f.read()

    _validate_task_yaml_content(
        task_yaml_content,
        experiment_id=experiment_id,
        timeout_seconds=timeout_seconds,
        output_format=output_format,
    )
    return task_yaml_content


## COMMANDS ##


@app.command("list")
def command_task_list():
    """List all tasks."""
    current_experiment = require_current_experiment()
    list_tasks(output_format=cli_state.output_format, experiment_id=current_experiment)


TASK_INIT_TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates" / "task_init"


def _render_task_yaml_template(task_name: str) -> str:
    template = (TASK_INIT_TEMPLATES_DIR / "task.yaml").read_text(encoding="utf-8")
    return template.replace("{{TASK_NAME}}", task_name)


def _main_py_template() -> str:
    return (TASK_INIT_TEMPLATES_DIR / "main.py").read_text(encoding="utf-8")


def _write_task_yaml(path: str, data: dict) -> None:
    yaml_text = yaml.safe_dump(data, sort_keys=False, default_flow_style=False)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(yaml_text)


def _print_next_steps(include_main_py: bool) -> None:
    console.print("\nNext steps:")
    if include_main_py:
        console.print("- Edit [bold]main.py[/bold] with your task code")
    console.print("- Customize [bold]task.yaml[/bold] (resources, setup, parameters)")
    console.print("- Run: [bold]lab task add .[/bold]")
    console.print("- Docs: https://lab.cloud/for-teams/running-a-task/task-yaml-structure")


def _task_init_default(task_yaml_path: str, main_py_path: str, folder_name: str, force: bool = False) -> None:
    if os.path.exists(task_yaml_path) and not force:
        if cli_state.output_format == "json":
            print(json.dumps({"error": "task.yaml already exists"}))
        else:
            console.print(
                f"[error]Error:[/error] [bold]{task_yaml_path}[/bold] already exists. "
                "Refusing to overwrite. Remove it first or run `lab task init` in an empty directory."
            )
        raise typer.Exit(1)

    with open(task_yaml_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(_render_task_yaml_template(folder_name))

    main_py_existed = os.path.exists(main_py_path)
    if not main_py_existed:
        with open(main_py_path, "w", encoding="utf-8", newline="\n") as f:
            f.write(_main_py_template())

    if cli_state.output_format == "json":
        created = ["task.yaml"] if main_py_existed else ["task.yaml", "main.py"]
        skipped = ["main.py"] if main_py_existed else []
        print(json.dumps({"created": created, "skipped": skipped, "path": os.path.dirname(task_yaml_path)}))
        return

    console.print("[success]✓[/success] Created [bold]task.yaml[/bold]")
    if main_py_existed:
        console.print("[warning]•[/warning] Skipped [bold]main.py[/bold] (already exists)")
    else:
        console.print("[success]✓[/success] Created [bold]main.py[/bold]")

    console.print(f"\nLocation: [bold]{os.path.dirname(task_yaml_path)}[/bold]")
    _print_next_steps(include_main_py=not main_py_existed)


def _task_init_interactive(task_yaml_path: str, folder_name: str, force: bool = False) -> None:
    if os.path.exists(task_yaml_path) and not force:
        if cli_state.output_format == "json":
            print(json.dumps({"error": "task.yaml already exists"}))
            raise typer.Exit(1)
        should_overwrite = typer.confirm("task.yaml already exists. Overwrite?", default=False)
        if not should_overwrite:
            console.print("[warning]Cancelled.[/warning]")
            raise typer.Exit(0)

    task_name = typer.prompt("Task name", default=folder_name).strip() or folder_name

    cpus = typer.prompt("CPUs", default="2").strip()
    memory = typer.prompt("Memory (GB)", default="4").strip()
    accelerators = typer.prompt("Accelerators (optional)", default="", show_default=False).strip()

    setup = ""
    run = ""

    if cli_state.output_format != "json" and os.isatty(0) and os.isatty(1):
        edited = typer.edit(
            "\n".join(
                [
                    "# Define the commands for your task below.",
                    "# This YAML snippet will be parsed and merged into task.yaml.",
                    "",
                    "setup: |",
                    "  # Optional: install deps, download data, etc.",
                    "  ",
                    "run: |",
                    "  # Required: the main command to execute",
                    "  ",
                    "",
                ]
            )
        )
        if edited:
            try:
                edited_obj = yaml.safe_load(edited)
                if isinstance(edited_obj, dict):
                    setup_val = edited_obj.get("setup")
                    run_val = edited_obj.get("run")
                    if isinstance(setup_val, str):
                        setup = setup_val.rstrip()
                    if isinstance(run_val, str):
                        run = run_val.rstrip()
            except yaml.YAMLError:
                pass

    if not setup.strip():
        setup = typer.prompt("Setup command (optional)", default="", show_default=False).rstrip()

    while not run.strip():
        run = typer.prompt("Run command", default="", show_default=False).rstrip()

    task_yaml: dict = {
        "name": task_name,
        "resources": {"cpus": cpus, "memory": memory},
        "run": run,
    }
    if accelerators:
        task_yaml["resources"]["accelerators"] = accelerators
    if setup.strip():
        task_yaml["setup"] = setup

    _write_task_yaml(task_yaml_path, task_yaml)

    if cli_state.output_format == "json":
        print(json.dumps({"path": task_yaml_path}))
        return

    console.print(f"[success]✓[/success] Wrote [bold]{task_yaml_path}[/bold]")
    _print_next_steps(include_main_py=False)


@app.command("init")
def command_task_init(
    interactive: bool = typer.Option(False, "--interactive", help="Prompt for task settings instead of using defaults"),
    force: bool = typer.Option(False, "--force", help="Overwrite existing task.yaml without prompting"),
):
    """Initialize a task.yaml and main.py in the current directory."""
    cwd = os.getcwd()
    task_yaml_path = os.path.join(cwd, "task.yaml")
    main_py_path = os.path.join(cwd, "main.py")
    folder_name = os.path.basename(cwd).strip() or "my-task"

    if interactive:
        _task_init_interactive(task_yaml_path, folder_name, force=force)
    else:
        _task_init_default(task_yaml_path, main_py_path, folder_name, force=force)


@app.command("add")
def command_task_add(
    task_directory: str = typer.Argument(None, help="Path to the task directory containing task.yaml"),
    from_git: str = typer.Option(None, "--from-git", help="Git URL to fetch the task from"),
    dry_run: bool = typer.Option(False, "--dry-run", help="Preview the task without creating it"),
    no_interactive: bool = typer.Option(False, "--no-interactive", help="Skip confirmation prompt"),
):
    """Add a new task. Provide a directory path directly, or use --from-git to fetch from a Git repository."""
    current_experiment = require_current_experiment()

    if from_git:
        add_task_from_github(from_git, experiment_id=current_experiment, interactive=not no_interactive)
    elif task_directory:
        add_task_from_directory(
            task_directory, experiment_id=current_experiment, dry_run=dry_run, interactive=not no_interactive
        )
    else:
        console.print("[error]Error:[/error] Provide a task directory path or use --from-git <url>")
        raise typer.Exit(1)


@app.command("validate")
def command_task_validate(
    task_yaml_path: str = typer.Argument("./task.yaml", help="Path to task.yaml (defaults to ./task.yaml)"),
    timeout: int = typer.Option(300, "--timeout", help="Request timeout in seconds for validation"),
):
    """Validate a task.yaml file against the server schema."""
    current_experiment = require_current_experiment()
    resolved_path = os.path.realpath(task_yaml_path)
    output_format = cli_state.output_format
    _validate_task_yaml_file(
        resolved_path,
        experiment_id=current_experiment,
        timeout_seconds=timeout,
        output_format=output_format,
    )
    if output_format == "json":
        print(json.dumps({"ok": True, "path": resolved_path}))
    else:
        console.print(f"[success]✓[/success] task.yaml is valid: [bold]{resolved_path}[/bold]")


@app.command("edit")
def command_task_edit(
    task_id: str = typer.Argument(..., help="Task ID to update"),
    from_file: str | None = typer.Option(None, "--from-file", help="Path to task.yaml to apply directly"),
    no_interactive: bool = typer.Option(False, "--no-interactive", help="Skip confirmation prompt"),
    timeout: int = typer.Option(300, "--timeout", help="Request timeout in seconds for fetch/validate/save"),
):
    """Edit an existing task's task.yaml (interactive by default)."""
    current_experiment = require_current_experiment()
    edit_task_yaml(
        task_id=task_id,
        experiment_id=current_experiment,
        yaml_file=from_file,
        interactive=not no_interactive,
        timeout_seconds=timeout,
    )


@app.command("upload")
def command_task_upload(
    task_id: str = typer.Argument(..., help="Task ID to upload files to"),
    path: str = typer.Argument(..., help="Path to a file or directory to upload"),
    no_interactive: bool = typer.Option(False, "--no-interactive", help="Skip confirmation prompt"),
):
    """Upload additional files into an existing task."""
    current_experiment = require_current_experiment()
    upload_files_to_task(
        task_id=task_id,
        path_to_upload=path,
        experiment_id=current_experiment,
        interactive=not no_interactive,
    )


@app.command("delete")
def command_task_delete(
    task_id: str = typer.Argument(..., help="Task ID to delete"),
    no_interactive: bool = typer.Option(False, "--no-interactive", help="Skip confirmation prompt"),
):
    """Delete a task."""
    current_experiment = require_current_experiment()

    if not no_interactive:
        typer.confirm(f"Delete task {task_id}?", abort=True)

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
        response = api.get("/compute_provider/providers/")
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
    description: str | None = None,
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
        "description": description,
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
        "file_mounts": cfg.get("file_mounts") or task.get("file_mounts"),
        "provider_name": provider_name,
        "github_repo_url": task.get("github_repo_url"),
        "github_repo_dir": task.get("github_repo_dir"),
        "github_repo_branch": task.get("github_repo_branch"),
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
    response = api.post_json(f"/compute_provider/providers/{provider_id}/launch/", payload)
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


def _parse_param_overrides(raw_params: list[str] | None) -> dict:
    """Parse `key=value` strings into a dict, with values as YAML scalars.

    Splits on the first `=` only so values may contain `=`. Raises
    typer.BadParameter on malformed input.
    """
    if not raw_params:
        return {}
    parsed: dict = {}
    for raw in raw_params:
        if "=" not in raw:
            raise typer.BadParameter(f"Expected key=value, got: {raw!r}")
        key, _, value = raw.partition("=")
        if not key:
            raise typer.BadParameter(f"Empty key in: {raw!r}")
        try:
            parsed[key] = yaml.safe_load(value)
        except yaml.YAMLError as e:
            raise typer.BadParameter(f"Failed to parse value for {key!r}: {e}") from e
    return parsed


def queue_task(
    task_id: str,
    experiment_id: str,
    interactive: bool = True,
    description: str | None = None,
    param_overrides: dict | None = None,
) -> None:
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
    overrides = param_overrides or {}
    if overrides:
        if not parameters:
            raise typer.BadParameter(
                "Task has no parameters declared, cannot use --param. Add a `parameters:` block to task.yaml first."
            )
        unknown = sorted(set(overrides) - set(parameters))
        if unknown:
            valid = ", ".join(sorted(parameters)) or "(none)"
            raise typer.BadParameter(f"Unknown parameter(s): {', '.join(unknown)}. Valid keys: {valid}")
    if interactive and parameters:
        param_values = _prompt_parameters(parameters)
    else:
        param_values = {k: (v.get("default", "") if isinstance(v, dict) else v) for k, v in parameters.items()}
    param_values.update(overrides)

    payload = build_launch_payload(
        task, provider.get("name"), param_values, resource_overrides, description=description
    )
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
    description: str | None = typer.Option(
        None,
        "--description",
        "-m",
        help=(
            "Markdown note describing what this run is trying to accomplish (like a commit description). "
            "Pass '-' to read from stdin."
        ),
    ),
    params: list[str] = typer.Option(
        None,
        "--param",
        "-p",
        metavar="KEY=VALUE",
        help=(
            "Override a task parameter for this queue (repeatable). Value is parsed as a YAML "
            "scalar (e.g. score=0.42 -> float, enabled=true -> bool). Unknown keys fail."
        ),
    ),
):
    """Queue a task on a compute provider."""
    current_experiment = require_current_experiment()
    if description == "-":
        if sys.stdin.isatty():
            raise typer.BadParameter('-m - reads the description from stdin; pipe content in or pass -m "...".')
        description = sys.stdin.read()
    param_overrides = _parse_param_overrides(params)
    queue_task(
        task_id,
        experiment_id=current_experiment,
        interactive=not no_interactive,
        description=description,
        param_overrides=param_overrides,
    )


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
        detail = _extract_error_detail(response)
        if output_format == "json":
            print(
                json.dumps(
                    {
                        "error": "Failed to import task",
                        "status_code": response.status_code,
                        "detail": detail,
                    }
                )
            )
            raise typer.Exit(1)
        console.print(f"[red]Error:[/red] Failed to import task. Status code: {response.status_code}")
        if detail:
            console.print(f"[red]Detail:[/red] {detail}")
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
