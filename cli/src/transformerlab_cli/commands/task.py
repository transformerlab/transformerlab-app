from rich.console import Console
import typer
import yaml
import requests
import httpx
from shutil import which

from transformerlab_cli.util.ui import render_table, render_object
from transformerlab_cli.util.config import check_configs, get_current_experiment
from transformerlab_cli.util.auth import api_key
import transformerlab_cli.util.api as api

app = typer.Typer()
console = Console()

REQUIRED_TASK_FIELDS = ["name", "type"]


def list_tasks(output_format: str = "pretty") -> None:
    with console.status("[bold green]Fetching tasks...[/bold green]", spinner="dots"):
        response = api.get("/tasks/list")

    if response.status_code == 200:
        render_table(
            data=response.json(),
            format_type=output_format,
            table_columns=["id", "name", "type", "created_at", "updated_at"],
            title="Tasks",
        )
    else:
        console.print(f"[red]Error:[/red] Failed to fetch tasks. Status code: {response.status_code}")


def delete_task(task_id: str) -> None:
    console.print(f"[yellow]Task delete '{task_id}' - not implemented[/yellow]")


def info_task(task_id: str) -> None:
    with console.status(f"[bold green]Fetching info for task {task_id}...[/bold green]", spinner="dots"):
        response = api.get(f"/tasks/{task_id}/get")

    if response.status_code == 200:
        render_object(response.json())
    else:
        console.print(f"[red]Error:[/red] Failed to fetch task info. Status code: {response.status_code}")


def _check_if_zip_command_exists():
    if which("zip") is None:
        console.print("[red]Error:[/red] The 'zip' command is not available on this system.")
        raise typer.Exit(1)


def _load_task_yaml(task_yaml_path: str | None, from_url: str | None) -> dict:
    if task_yaml_path and from_url:
        raise typer.BadParameter("Provide either a file path or a URL, not both.")

    if not task_yaml_path and not from_url:
        raise typer.BadParameter("Provide either a file path or a URL.")

    try:
        if from_url:
            console.print(f"[yellow]Fetching Task YAML from URL:[/yellow] {from_url}")
            resp = requests.get(from_url, timeout=10)
            resp.raise_for_status()
            return yaml.safe_load(resp.text)

        console.print(f"[yellow]Task add from file:[/yellow] {task_yaml_path}")
        with open(task_yaml_path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f)

    except requests.RequestException as e:
        console.print(f"[red]Error:[/red] Failed to fetch YAML: {e}")
        raise typer.Exit(1)
    except FileNotFoundError:
        console.print("[red]Error:[/red] File not found.")
        raise typer.Exit(1)
    except yaml.YAMLError as e:
        console.print(f"[red]Error:[/red] Invalid YAML: {e}")
        raise typer.Exit(1)


def _validate_task_yaml(task_data: dict) -> dict:
    if not isinstance(task_data, dict):
        console.print("[red]Error:[/red] Task YAML must be a mapping/object.")
        raise typer.Exit(1)

    missing = [f for f in REQUIRED_TASK_FIELDS if f not in task_data]

    if "type" in missing:
        console.print("[yellow]Warning:[/yellow] 'type' missing. Defaulting to 'generic'.")
        task_data["type"] = "generic"
        missing.remove("type")

    if missing:
        console.print(f"[red]Error:[/red] Missing required fields: {', '.join(missing)}")
        raise typer.Exit(1)

    return task_data


def add_task(task_yaml_path: str | None, from_url: str | None):
    task_data = _load_task_yaml(task_yaml_path, from_url)
    task_data = _validate_task_yaml(task_data)

    console.print("[bold]Task YAML to be uploaded:[/bold]")
    console.print(yaml.dump(task_data, sort_keys=False))

    yaml_str = yaml.dump(task_data)
    exp = get_current_experiment() or ""

    endpoints: list[str] = []
    if exp:
        endpoints.extend(
            [
                f"/experiment/{exp}/task/new_task",
                f"/experiment/{exp}/tasks/new",
            ]
        )
    endpoints.extend(["/task/new_task", "/tasks/new"])

    success_response: httpx.Response | None = None
    last_error_response: httpx.Response | None = None

    with console.status("[bold green]Uploading task...[/bold green]", spinner="dots"):
        for ep in endpoints:
            try:
                resp = httpx.post(
                    f"{api.BASE_URL()}{ep}",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/x-yaml",
                    },
                    content=yaml_str,
                    timeout=10.0,
                )
            except Exception:
                continue

            # ✅ STOP immediately on success
            if resp.status_code in (200, 201):
                success_response = resp
                break

            if resp.status_code == 405:
                continue

            last_error_response = resp
            break

    response = success_response or last_error_response

    if response is None:
        console.print("[red]Error:[/red] No response from server.")
        raise typer.Exit(1)

    if response.status_code in (200, 201):
        task_id = None
        try:
            task_id = response.json().get("task_id")
        except Exception:
            pass

        console.print(f"[green]✓[/green] Task added successfully{f' with ID: {task_id}' if task_id else ''}")
        return

    console.print(f"[red]Error:[/red] Failed to add task ({response.status_code}): {response.text}")
    raise typer.Exit(1)


def queue_task(task_name: str, cpus: int | None = None, memory: int | None = None):
    """Queue a task by name with optional resource overrides."""
    with console.status(f"[bold green]Looking up task '{task_name}'...[/bold green]", spinner="dots"):
        response = api.get("/tasks/list")

    if response.status_code != 200:
        console.print(f"[red]Error:[/red] Failed to fetch tasks. Status code: {response.status_code}")
        raise typer.Exit(1)

    tasks = response.json()
    task = next((t for t in tasks if t["name"] == task_name), None)
    if not task:
        console.print(f"[red]Error:[/red] Task '{task_name}' not found.")
        raise typer.Exit(1)

    task_id = task["id"]

    # Prepare queue data
    data = {}
    if cpus is not None:
        data["cpus"] = cpus
    if memory is not None:
        data["memory"] = memory

    with console.status(f"[bold green]Queueing task '{task_name}'...[/bold green]", spinner="dots"):
        response = api.post(f"/tasks/{task_id}/queue", data=data)

    if response.status_code == 200:
        console.print(f"[green]✓[/green] Task '{task_name}' queued successfully.")
    else:
        console.print(f"[red]Error:[/red] Failed to queue task. Status code: {response.status_code}")
        raise typer.Exit(1)


@app.command("list")
def command_task_list():
    check_configs()
    list_tasks()


@app.command("add")
def command_task_add(
    task_yaml_path: str = typer.Argument(None, help="Path to the Task YAML file", metavar="<Task File>"),
    from_url: str = typer.Option(None, "--from-url", help="URL to fetch the Task YAML from"),
):
    check_configs()
    add_task(task_yaml_path, from_url)


@app.command("delete")
def command_task_delete(
    task_id: str = typer.Argument(..., help="Task ID to delete"),
):
    check_configs()
    delete_task(task_id)


@app.command("info")
def command_task_info(
    task_id: str = typer.Argument(..., help="Task ID to get info for"),
):
    check_configs()
    info_task(task_id)


@app.command("queue")
def command_task_queue(
    task_name: str = typer.Argument(..., help="Name of the task to queue"),
    cpus: int = typer.Option(None, "--cpus", help="Number of CPUs to allocate"),
    memory: int = typer.Option(None, "--memory", help="Amount of memory (in MB) to allocate"),
):
    check_configs()
    queue_task(task_name, cpus, memory)
