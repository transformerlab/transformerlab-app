import re
import time

import typer
from rich.console import Console
from rich.panel import Panel

from transformerlab_cli.util import api
from transformerlab_cli.util.config import check_configs, get_config

console = Console()

DEFAULT_TIMEOUT = 300
POLL_INTERVAL = 3


def _get_experiment_id() -> str:
    """Get current experiment ID from config, or exit with helpful message."""
    check_configs()
    current_experiment = get_config("current_experiment")
    if not current_experiment or not str(current_experiment).strip():
        console.print("[yellow]current_experiment is not set in config.[/yellow]")
        console.print("Set it first with: [bold]lab config current_experiment <experiment_name>[/bold]")
        raise typer.Exit(1)
    return str(current_experiment)


def _select_provider() -> dict:
    """Fetch providers and prompt user to select one."""
    with console.status("[bold green]Fetching providers...[/bold green]", spinner="dots"):
        response = api.get("/compute_provider/")

    if response.status_code != 200:
        console.print("[red]Error:[/red] Failed to fetch providers.")
        raise typer.Exit(1)

    providers = response.json()
    if not providers:
        console.print("[red]Error:[/red] No compute providers available. Add one in team settings first.")
        raise typer.Exit(1)

    console.print("\n[bold cyan]Select a compute provider:[/bold cyan]")
    for i, provider in enumerate(providers, 1):
        ptype = provider.get("type", "")
        console.print(f"  [bold]{i}[/bold]. {provider.get('name', provider.get('id'))} ({ptype})")

    while True:
        choice = typer.prompt("Provider", default="1")
        try:
            idx = int(choice) - 1
            if 0 <= idx < len(providers):
                return providers[idx]
            console.print(f"[red]Please enter a number between 1 and {len(providers)}[/red]")
        except ValueError:
            console.print("[red]Please enter a valid number[/red]")


def _select_template(experiment_id: str, provider: dict) -> dict:
    """Fetch interactive gallery and prompt user to select a template, filtered by provider."""
    with console.status("[bold green]Fetching interactive tasks...[/bold green]", spinner="dots"):
        response = api.get(f"/experiment/{experiment_id}/task/gallery/interactive")

    if response.status_code != 200:
        console.print("[red]Error:[/red] Failed to fetch interactive gallery.")
        raise typer.Exit(1)

    # Response is wrapped: {"status": "success", "data": [...]}
    gallery = response.json().get("data", [])
    is_local = provider.get("type") == "local"

    # Filter by provider compatibility
    provider_accelerators = set()
    acc = provider.get("supported_accelerators") or provider.get("accelerators")
    if isinstance(acc, str):
        provider_accelerators = {a.strip() for a in acc.split(",") if a.strip()}
    elif isinstance(acc, list):
        provider_accelerators = set(acc)

    compatible = []
    for entry in gallery:
        # Skip remote-only tasks for local providers
        if is_local and entry.get("remoteOnly"):
            continue

        # Check accelerator compatibility (if both sides specify)
        task_acc = entry.get("supported_accelerators", [])
        if isinstance(task_acc, str):
            task_acc = [a.strip() for a in task_acc.split(",") if a.strip()]
        if task_acc and provider_accelerators:
            if not set(task_acc) & provider_accelerators:
                continue

        compatible.append(entry)

    if not compatible:
        console.print("[yellow]No compatible interactive tasks for this provider.[/yellow]")
        if is_local:
            console.print("[dim]Some tasks are only available on remote providers.[/dim]")
        raise typer.Exit(1)

    console.print("\n[bold cyan]Available interactive tasks:[/bold cyan]")
    for i, entry in enumerate(compatible, 1):
        console.print(f"  [bold]{i}[/bold]. {entry.get('name', entry.get('id'))} - {entry.get('description', '')}")

    while True:
        choice = typer.prompt("Task", default="1")
        try:
            idx = int(choice) - 1
            if 0 <= idx < len(compatible):
                return compatible[idx]
            console.print(f"[red]Please enter a number between 1 and {len(compatible)}[/red]")
        except ValueError:
            console.print("[red]Please enter a valid number[/red]")


def _collect_env_params(gallery_entry: dict, provider: dict) -> dict[str, str]:
    """Collect environment parameters with smart defaults."""
    env_parameters = gallery_entry.get("env_parameters", [])
    if not env_parameters:
        return {}

    is_local = provider.get("type") == "local"
    env_vars: dict[str, str] = {}

    console.print("\n[bold cyan]Configuration:[/bold cyan]")
    for param in env_parameters:
        env_var = param.get("env_var", "")
        field_name = param.get("field_name", env_var)
        required = param.get("required", False)
        is_password = param.get("password", False)

        # Skip NGROK_AUTH_TOKEN for local providers (no tunnel needed)
        if is_local and env_var == "NGROK_AUTH_TOKEN":
            continue

        # Smart default: use secret placeholder for remote providers
        default = ""
        if not is_local and env_var == "NGROK_AUTH_TOKEN":
            default = "{{secret._NGROK_AUTH_TOKEN}}"

        # Show prompt
        prompt_text = f"  {field_name}"
        if not required:
            prompt_text += " (optional)"

        value = typer.prompt(
            prompt_text,
            default=default if default else "",
            show_default=bool(default),
            hide_input=is_password,
        )

        if value:
            env_vars[env_var] = value

    return env_vars


def _collect_resources(gallery_entry: dict) -> dict:
    """Collect resource configuration for remote providers."""
    console.print("\n[bold cyan]Resource configuration:[/bold cyan]")

    def ask(label: str, default_val: str = "") -> str:
        return typer.prompt(f"  {label}", default=default_val, show_default=bool(default_val))

    cpus = ask("CPUs", gallery_entry.get("cpus", "2"))
    memory = ask("Memory (GB)", gallery_entry.get("memory", "16"))
    disk_space = ask("Disk (GB)", gallery_entry.get("disk_space", "50"))
    accelerators = ask("Accelerators", gallery_entry.get("accelerators", ""))
    num_nodes_str = ask("Num nodes", gallery_entry.get("num_nodes", "1"))
    try:
        num_nodes = int(num_nodes_str)
    except ValueError:
        num_nodes = 1

    return {
        "cpus": cpus,
        "memory": memory,
        "disk_space": disk_space,
        "accelerators": accelerators,
        "num_nodes": num_nodes,
    }


def _import_task(experiment_id: str, gallery_entry: dict, env_vars: dict) -> str:
    """Import an interactive task from the gallery. Returns the task ID."""
    payload = {
        "gallery_id": gallery_entry.get("id"),
        "experiment_id": experiment_id,
        "is_interactive": True,
        "env_vars": env_vars,
    }

    response = api.post_json(f"/experiment/{experiment_id}/task/gallery/import", payload)
    if response.status_code != 200:
        try:
            detail = response.json().get("detail", response.text)
        except Exception:
            detail = response.text
        console.print(f"[red]Error:[/red] Failed to import task: {detail}")
        raise typer.Exit(1)

    data = response.json()
    task_id = data.get("id")
    if not task_id:
        console.print("[red]Error:[/red] No task ID returned from import.")
        raise typer.Exit(1)

    return str(task_id)


def _build_interactive_launch_payload(
    experiment_id: str,
    task_id: str,
    provider: dict,
    gallery_entry: dict,
    env_vars: dict,
    resources: dict,
) -> dict:
    """Build the launch payload for an interactive task."""
    is_local = provider.get("type") == "local"

    return {
        "experiment_id": experiment_id,
        "task_id": task_id,
        "task_name": gallery_entry.get("name", "Interactive Task"),
        "cluster_name": gallery_entry.get("name", "Interactive Task"),
        "run": gallery_entry.get("command", ""),
        "setup": gallery_entry.get("setup", ""),
        "subtype": "interactive",
        "interactive_type": gallery_entry.get("interactive_type", "custom"),
        "interactive_gallery_id": gallery_entry.get("id"),
        "local": is_local,
        "env_vars": env_vars,
        "provider_name": provider.get("name"),
        "cpus": resources.get("cpus"),
        "memory": resources.get("memory"),
        "disk_space": resources.get("disk_space"),
        "accelerators": resources.get("accelerators"),
        "num_nodes": resources.get("num_nodes"),
    }


def _launch(provider: dict, payload: dict) -> int:
    """Launch the task on a provider. Returns job ID."""
    provider_id = provider.get("id")
    response = api.post_json(f"/compute_provider/{provider_id}/task/launch", payload)

    if response.status_code != 200:
        try:
            detail = response.json().get("detail", response.text)
        except Exception:
            detail = response.text
        console.print(f"[red]Error:[/red] Failed to launch task: {detail}")
        raise typer.Exit(1)

    data = response.json()
    job_id = data.get("job_id")
    if not job_id:
        console.print("[red]Error:[/red] No job ID returned from launch.")
        raise typer.Exit(1)

    return int(job_id)


def _poll_until_ready(experiment_id: str, job_id: int, timeout: int) -> dict:
    """Poll tunnel_info until service is ready or timeout."""
    start = time.time()
    url = f"/experiment/{experiment_id}/jobs/{job_id}/tunnel_info"

    with console.status("[bold green]Waiting for service...[/bold green]", spinner="dots") as status:
        while True:
            elapsed = int(time.time() - start)
            if elapsed >= timeout:
                console.print(f"\n[yellow]Timed out after {timeout}s waiting for service.[/yellow]")
                console.print(f"Check status with: [bold]lab job info {job_id}[/bold]")
                raise typer.Exit(1)

            status.update(f"[bold green]Waiting for service... ({elapsed}s)[/bold green]")

            try:
                response = api.get(url, timeout=10.0)
                if response.status_code == 200:
                    data = response.json()
                    if data.get("is_ready"):
                        return data
            except Exception:
                pass  # Server unreachable, keep polling

            time.sleep(POLL_INTERVAL)


def _print_connection_info(tunnel_info: dict, job_id: int) -> None:
    """Render connection info from tunnel_info instructions."""
    console.print("\n[green bold]✓ Service is ready![/green bold]\n")

    instructions = tunnel_info.get("instructions", [])
    values = {k: str(v) for k, v in tunnel_info.items() if v is not None and isinstance(v, (str, int, float))}

    for block in instructions:
        kind = block.get("kind")
        title = block.get("title", "")
        value_key = block.get("value_key")
        value = values.get(value_key, "") if value_key else ""

        if kind == "url" and value:
            console.print(Panel(f"[link={value}]{value}[/link]", title=title, border_style="green"))
        elif kind == "code" and value:
            console.print(Panel(f"[bold]{value}[/bold]", title=title, border_style="cyan"))
        elif kind == "command" and value:
            console.print(Panel(f"[bold]{value}[/bold]", title=title, border_style="blue"))
        elif kind == "kv":
            items = block.get("items", [])
            lines = []
            for item in items:
                val = values.get(item.get("value_key", ""), "")
                if val:
                    lines.append(f"  {item.get('label', '')}: {val}")
            if lines:
                console.print(Panel("\n".join(lines), title=title, border_style="dim"))
        elif kind == "text":
            template = block.get("template", "")
            if template:
                resolved = re.sub(r"\{\{(\w+)\}\}", lambda m: values.get(m.group(1), m.group(1)), template)
                console.print(Panel(resolved, title=title, border_style="dim"))

    # Print ports if available
    ports = tunnel_info.get("ports", [])
    if ports:
        console.print("\n[bold]Exposed Ports:[/bold]")
        for p in ports:
            console.print(f"  {p.get('label', '')}: port {p.get('port', '')} ({p.get('protocol', '')})")

    console.print(f"\nTo stop this session: [bold]lab job stop {job_id}[/bold]")
    console.print(f"To check status:      [bold]lab job info {job_id}[/bold]")


def interactive(timeout: int = DEFAULT_TIMEOUT) -> None:
    """Launch an interactive task (Jupyter, vLLM, Ollama, etc.)."""
    experiment_id = _get_experiment_id()

    # 1. Select provider
    provider = _select_provider()
    is_local = provider.get("type") == "local"

    # 2. Select template
    template = _select_template(experiment_id, provider)
    console.print(f"\n[bold]Task:[/bold] {template.get('name', 'Unknown')}")

    # 3. Collect env parameters
    env_vars = _collect_env_params(template, provider)

    # 4. Collect resources (remote only)
    resources: dict = {}
    if not is_local:
        resources = _collect_resources(template)

    # 5. Import task from gallery
    with console.status("[bold green]Importing task...[/bold green]", spinner="dots"):
        task_id = _import_task(experiment_id, template, env_vars)

    # 6. Launch
    payload = _build_interactive_launch_payload(experiment_id, task_id, provider, template, env_vars, resources)

    with console.status("[bold green]Launching...[/bold green]", spinner="dots"):
        job_id = _launch(provider, payload)

    console.print(f"Job [bold]{job_id}[/bold] created. Waiting for service to be ready...")

    # 7. Poll until ready
    tunnel_info = _poll_until_ready(experiment_id, job_id, timeout)

    # 8. Print connection info
    _print_connection_info(tunnel_info, job_id)
