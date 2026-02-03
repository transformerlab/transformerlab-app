from rich.console import Console

import typer
from transformerlab_cli.util.ui import render_table, render_object
from transformerlab_cli.util.config import check_configs, get_config

import transformerlab_cli.util.api as api
import yaml
from shutil import which
import requests

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


def _check_if_zip_command_exists():
    """Check if the 'zip' command is available on the system."""
    if which("zip") is None:
        console.print(
            "[red]Error:[/red] The 'zip' command is not available on this system. Please install it to proceed."
        )
        raise typer.Exit(1)


def add_task(task_yaml_path: str, from_url: str):
    """Add a new task."""
    if task_yaml_path and from_url:
        console.print("[red]Error:[/red] Please provide either a file path or a URL, not both.")
        return {"status_code": 400, "message": "Provide either a file path or a URL, not both."}

    if not task_yaml_path and not from_url:
        console.print("[red]Error:[/red] You must provide either a file path or a URL. Type --help for more info.")
        return {"status_code": 400, "message": "Provide either a file path or a URL."}

    if from_url:
        console.print(f"[yellow]Fetching Task YAML from URL: {from_url}[/yellow]")
        try:
            response = requests.get(from_url)
            if response.status_code == 200:
                try:
                    task_data = yaml.safe_load(response.text)
                except yaml.YAMLError:
                    console.print("[red]Error:[/red] Failed to parse YAML from URL. Are you sure the URL is correct?")
                    return {"status_code": 422, "message": "Failed to parse YAML from URL."}
            else:
                console.print(
                    f"[red]Error:[/red] Failed to fetch Task YAML from URL. Status code: {response.status_code}"
                )
                return {"status_code": response.status_code, "message": "Failed to fetch Task YAML from URL."}
        except requests.ConnectionError as e:
            console.print(f"[red]Error:[/red] Failed to connect to the URL: {from_url}. Details: {e}")
            return {"status_code": 503, "message": "Failed to connect to the URL."}
        except requests.RequestException as e:
            console.print(f"[red]Error:[/red] An error occurred while fetching the URL: {from_url}. Details: {e}")
            return {"status_code": 500, "message": "An error occurred while fetching the URL."}
    else:
        console.print(f"[yellow]Task add from file: '{task_yaml_path}'[/yellow]")
        try:
            with open(task_yaml_path, "r") as f:
                task_data = yaml.safe_load(f)
        except FileNotFoundError:
            console.print("[red]Error:[/red] File not found.")
            return {"status_code": 404, "message": "File not found."}
        except yaml.YAMLError:
            console.print("[red]Error:[/red] Failed to parse YAML from file.")
            return {"status_code": 422, "message": "Failed to parse YAML from file."}

    console.print("[bold]Task YAML to be uploaded:[/bold]")
    console.print(yaml.dump(task_data))
    # Validate required fields
    # Don't validate fields yet
    # missing_fields = [field for field in REQUIRED_TASK_FIELDS if field not in task_data]
    # if missing_fields:
    #     console.print(f"[red]Error:[/red] Missing required fields in task YAML: {', '.join(missing_fields)}")
    #     raise typer.Exit(1)

    # Now if directory is not None, then we would package files from there
    # Don't support files yet
    # files = {}
    # if directory:
    #     console.print(f"[yellow]Including files from directory '{directory}'[/yellow]")
    #     zip_path = os.path.join(directory, "files.zip")
    #     _check_if_zip_command_exists()
    #     subprocess.run(["zip", "-r", zip_path, "."], cwd=directory, check=True)
    #     with open(zip_path, "rb") as zip_file:
    #         files["files"] = ("files.zip", zip_file.read(), "application/zip")

    # Now send the YAML and the zip (if any) to the server
    # with console.status("[bold green]Uploading task...[/bold green]", spinner="dots"):
    #     data = {"task_yaml": yaml.dump(task_data)}
    #     response = api.post("/task/new_task", data=data)
    # if response.status_code == 201:
    #     console.print(f"[green]✓[/green] Task added successfully with ID: {response.json().get('task_id')}")
    # else:
    #     console.print(f"[red]Error:[/red] Failed to add task. Status code: {response.status_code}")


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
    task_yaml_path: str = typer.Argument(None, help="Path to the Task YAML file", metavar="<Task File>"),
    from_url: str = typer.Option(None, "--from-url", help="URL to fetch the Task YAML from"),
):
    """Add a new task. Provide a file path directly, or use --from-url to fetch the YAML from a URL."""
    check_configs()
    response = add_task(task_yaml_path, from_url)
    if response and response.get("status_code") != 200:
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
