import json as json_mod
import re
import time

import httpx
import typer
from rich.panel import Panel

from transformerlab_cli.util import api
from transformerlab_cli.state import cli_state
from transformerlab_cli.util.config import require_current_experiment
from transformerlab_cli.util.ui import console

DEFAULT_TIMEOUT = 300
POLL_INTERVAL = 3


def _get_experiment_id(experiment_id: str | None = None) -> str:
    """Get current experiment ID from option override or config."""
    if experiment_id is not None and str(experiment_id).strip():
        return str(experiment_id).strip()
    return require_current_experiment()


def _fetch_providers() -> list[dict]:
    """Fetch available compute providers."""
    with console.status("[bold success]Fetching providers...[/bold success]", spinner="dots"):
        response = api.get("/compute_provider/providers/")

    if response.status_code != 200:
        console.print("[error]Error:[/error] Failed to fetch providers.")
        raise typer.Exit(1)

    providers = response.json()
    if not providers:
        console.print("[error]Error:[/error] No compute providers available. Add one in team settings first.")
        raise typer.Exit(1)

    return providers


def _resolve_provider(providers: list[dict], provider_hint: str) -> dict:
    """Find a provider by name or ID (case-insensitive)."""
    hint_lower = provider_hint.lower()
    for p in providers:
        if str(p.get("id", "")).lower() == hint_lower or str(p.get("name", "")).lower() == hint_lower:
            return p
    names = [p.get("name", p.get("id")) for p in providers]
    if cli_state.output_format == "json":
        print(json_mod.dumps({"error": f"Provider '{provider_hint}' not found", "available": names}))
    else:
        console.print(
            f"[error]Error:[/error] Provider '{provider_hint}' not found. Available: {', '.join(str(n) for n in names)}"
        )
    raise typer.Exit(1)


def _select_provider(provider_hint: str | None = None) -> dict:
    """Fetch providers and select one — by hint if given, or by interactive prompt."""
    providers = _fetch_providers()

    if provider_hint is not None:
        return _resolve_provider(providers, provider_hint)

    console.print("\n[bold label]Select a compute provider:[/bold label]")
    for i, provider in enumerate(providers, 1):
        ptype = provider.get("type", "")
        console.print(f"  [bold]{i}[/bold]. {provider.get('name', provider.get('id'))} ({ptype})")

    while True:
        choice = typer.prompt("Provider", default="1")
        try:
            idx = int(choice) - 1
            if 0 <= idx < len(providers):
                return providers[idx]
            console.print(f"[error]Please enter a number between 1 and {len(providers)}[/error]")
        except ValueError:
            console.print("[error]Please enter a valid number[/error]")


def _fetch_gallery(experiment_id: str, provider: dict) -> list[dict]:
    """Fetch interactive gallery filtered by provider compatibility."""
    with console.status("[bold success]Fetching interactive tasks...[/bold success]", spinner="dots"):
        response = api.get(f"/experiment/{experiment_id}/task/gallery/interactive")

    if response.status_code != 200:
        console.print("[error]Error:[/error] Failed to fetch interactive gallery.")
        raise typer.Exit(1)

    gallery = response.json().get("data", [])
    is_local = provider.get("type") == "local"

    provider_accelerators = set()
    acc = provider.get("supported_accelerators") or provider.get("accelerators")
    if isinstance(acc, str):
        provider_accelerators = {a.strip() for a in acc.split(",") if a.strip()}
    elif isinstance(acc, list):
        provider_accelerators = set(acc)

    compatible = []
    for entry in gallery:
        if is_local and entry.get("remoteOnly"):
            continue
        task_acc = entry.get("supported_accelerators", [])
        if isinstance(task_acc, str):
            task_acc = [a.strip() for a in task_acc.split(",") if a.strip()]
        if task_acc and provider_accelerators:
            if not set(task_acc) & provider_accelerators:
                continue
        compatible.append(entry)

    if not compatible:
        console.print("[warning]No compatible interactive tasks for this provider.[/warning]")
        if is_local:
            console.print("[dim]Some tasks are only available on remote providers.[/dim]")
        raise typer.Exit(1)

    return compatible


def _resolve_template(compatible: list[dict], template_hint: str) -> dict:
    """Find a gallery entry by ID or name (case-insensitive)."""
    hint_lower = template_hint.lower()
    for entry in compatible:
        if str(entry.get("id", "")).lower() == hint_lower or str(entry.get("name", "")).lower() == hint_lower:
            return entry
    ids = [entry.get("id", entry.get("name", "?")) for entry in compatible]
    if cli_state.output_format == "json":
        print(json_mod.dumps({"error": f"Template '{template_hint}' not found", "available": ids}))
    else:
        console.print(
            f"[error]Error:[/error] Template '{template_hint}' not found. Available: {', '.join(str(i) for i in ids)}"
        )
    raise typer.Exit(1)


def _select_template(experiment_id: str, provider: dict, template_hint: str | None = None) -> dict:
    """Fetch interactive gallery and select a template — by hint if given, or by interactive prompt."""
    compatible = _fetch_gallery(experiment_id, provider)

    if template_hint is not None:
        return _resolve_template(compatible, template_hint)

    console.print("\n[bold label]Available interactive tasks:[/bold label]")
    for i, entry in enumerate(compatible, 1):
        console.print(f"  [bold]{i}[/bold]. {entry.get('name', entry.get('id'))} - {entry.get('description', '')}")

    while True:
        choice = typer.prompt("Task", default="1")
        try:
            idx = int(choice) - 1
            if 0 <= idx < len(compatible):
                return compatible[idx]
            console.print(f"[error]Please enter a number between 1 and {len(compatible)}[/error]")
        except ValueError:
            console.print("[error]Please enter a valid number[/error]")


def _collect_env_params(
    gallery_entry: dict, provider: dict, preset_env: dict[str, str] | None = None
) -> dict[str, str]:
    """Collect environment parameters — use presets if given, otherwise prompt."""
    env_parameters = gallery_entry.get("env_parameters", [])
    is_local = provider.get("type") == "local"

    if preset_env is not None:
        env_vars: dict[str, str] = dict(preset_env)
        # Apply smart defaults for missing keys
        for param in env_parameters:
            env_var = param.get("env_var", "")
            if is_local and env_var == "NGROK_AUTH_TOKEN":
                continue
            if env_var not in env_vars:
                if not is_local and env_var == "NGROK_AUTH_TOKEN":
                    env_vars[env_var] = "{{secret._NGROK_AUTH_TOKEN}}"
                elif param.get("placeholder"):
                    env_vars[env_var] = param["placeholder"]
        return env_vars

    if not env_parameters:
        return {}

    env_vars = {}

    console.print("\n[bold label]Configuration:[/bold label]")
    for param in env_parameters:
        env_var = param.get("env_var", "")
        field_name = param.get("field_name", env_var)
        required = param.get("required", False)
        is_password = param.get("password", False)

        if is_local and env_var == "NGROK_AUTH_TOKEN":
            continue

        default = param.get("placeholder", "")
        if not is_local and env_var == "NGROK_AUTH_TOKEN":
            default = "{{secret._NGROK_AUTH_TOKEN}}"

        prompt_text = f"  {field_name}"
        if not required:
            prompt_text += " (optional)"
        help_text = param.get("help_text", "")
        if help_text:
            console.print(f"    [dim]{help_text}[/dim]")

        while True:
            value = typer.prompt(
                prompt_text,
                default=default if default else "",
                show_default=bool(default),
                hide_input=is_password,
            )
            if value or not required:
                break
            console.print(f"[error]  {field_name} is required.[/error]")

        if value:
            env_vars[env_var] = value

    return env_vars


def _collect_resources(gallery_entry: dict, preset_resources: dict | None = None) -> dict:
    """Collect resource configuration — use presets if given, otherwise prompt."""
    defaults = {
        "cpus": gallery_entry.get("cpus", "2"),
        "memory": gallery_entry.get("memory", "16"),
        "disk_space": gallery_entry.get("disk_space", "50"),
        "accelerators": gallery_entry.get("accelerators", ""),
        "num_nodes": gallery_entry.get("num_nodes", "1"),
        "minutes_requested": gallery_entry.get("minutes_requested", "60"),
    }

    if preset_resources is not None:
        merged = {k: preset_resources.get(k, defaults[k]) for k in defaults}
        try:
            merged["num_nodes"] = int(merged["num_nodes"])
        except (ValueError, TypeError):
            merged["num_nodes"] = 1
        try:
            merged["minutes_requested"] = int(merged["minutes_requested"])
        except (ValueError, TypeError):
            merged["minutes_requested"] = 60
        return merged

    console.print("\n[bold label]Resource configuration:[/bold label]")

    def ask(label: str, default_val: str = "") -> str:
        return typer.prompt(f"  {label}", default=default_val, show_default=bool(default_val))

    cpus = ask("CPUs", str(defaults["cpus"]))
    memory = ask("Memory (GB)", str(defaults["memory"]))
    disk_space = ask("Disk (GB)", str(defaults["disk_space"]))
    accelerators = ask("Accelerators", str(defaults["accelerators"]))
    num_nodes_str = ask("Num nodes", str(defaults["num_nodes"]))
    try:
        num_nodes = int(num_nodes_str)
    except ValueError:
        num_nodes = 1
    minutes_str = ask("Max minutes", str(defaults["minutes_requested"]))
    try:
        minutes_requested = int(minutes_str)
    except ValueError:
        minutes_requested = 60

    return {
        "cpus": cpus,
        "memory": memory,
        "disk_space": disk_space,
        "accelerators": accelerators,
        "num_nodes": num_nodes,
        "minutes_requested": minutes_requested,
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
        except (ValueError, KeyError):
            detail = response.text
        console.print(f"[error]Error:[/error] Failed to import task: {detail}")
        raise typer.Exit(1)

    data = response.json()
    task_id = data.get("id")
    if not task_id:
        console.print("[error]Error:[/error] No task ID returned from import.")
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
    """Build the launch payload for an interactive task.

    The backend resolves the actual run command from the task and gallery
    at launch time, so we pass the gallery's command as a hint but rely
    on the server-side fallback to the task's stored run field.
    """
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
        "minutes_requested": resources.get("minutes_requested"),
    }


def _launch(provider: dict, payload: dict) -> str:
    """Launch the task on a provider. Returns job ID."""
    provider_id = provider.get("id")
    response = api.post_json(f"/compute_provider/providers/{provider_id}/launch/", payload)

    if response.status_code != 200:
        try:
            detail = response.json().get("detail", response.text)
        except (ValueError, KeyError):
            detail = response.text
        console.print(f"[error]Error:[/error] Failed to launch task: {detail}")
        raise typer.Exit(1)

    data = response.json()
    job_id = data.get("job_id")
    if not job_id:
        console.print("[error]Error:[/error] No job ID returned from launch.")
        raise typer.Exit(1)

    return str(job_id)


ACTIVE_STATUSES = {"LAUNCHING", "INTERACTIVE", "WAITING", "RUNNING"}


def _poll_until_ready(experiment_id: str, job_id: str, timeout: int, json_mode: bool = False) -> dict:
    """Poll tunnel_info until service is ready, job fails, or timeout."""
    start = time.time()
    tunnel_url = f"/experiment/{experiment_id}/jobs/{job_id}/tunnel_info"
    jobs_url = f"/experiment/{experiment_id}/jobs/list?type=REMOTE"
    logs_url = f"/experiment/{experiment_id}/jobs/{job_id}/provider_logs?live=true"
    seen_log_lines = 0
    spinner = None
    if not json_mode:
        spinner = console.status("[bold success]Waiting for service...[/bold success]", spinner="dots")
        spinner.start()

    while True:
        elapsed = int(time.time() - start)
        if elapsed >= timeout:
            if spinner:
                spinner.stop()
            if json_mode:
                print(json_mod.dumps({"error": f"Timed out after {timeout}s", "job_id": job_id}))
            else:
                console.print(f"\n[warning]Timed out after {timeout}s waiting for service.[/warning]")
                console.print(f"Check status with: [bold]lab job info {job_id}[/bold]")
            raise typer.Exit(1)

        if spinner and seen_log_lines == 0:
            spinner.update(f"[bold success]Waiting for service... ({elapsed}s)[/bold success]")

        try:
            jobs_resp = api.get(jobs_url, timeout=10.0, reraise_transport=True)
            if jobs_resp.status_code == 200:
                job = next((j for j in jobs_resp.json() if j.get("id") == job_id), None)
                if job:
                    job_status = job.get("status")
                    if job_status not in ACTIVE_STATUSES:
                        if spinner:
                            spinner.stop()
                        error_msg = job.get("job_data", {}).get("error_msg", "")
                        if json_mode:
                            print(
                                json_mod.dumps({"error": f"Job {job_status}", "error_msg": error_msg, "job_id": job_id})
                            )
                        else:
                            console.print(f"\n[error]Job {job_id} {job_status}.[/error]")
                            if error_msg:
                                console.print(f"[error]Error: {error_msg}[/error]")
                            console.print(f"Check logs with: [bold]lab job info {job_id}[/bold]")
                        raise typer.Exit(1)
        except typer.Exit:
            raise
        except httpx.HTTPError:
            pass

        if not json_mode:
            try:
                logs_resp = api.get(logs_url, timeout=10.0, reraise_transport=True)
                if logs_resp.status_code == 200:
                    logs_data = logs_resp.json()
                    logs_text = logs_data.get("logs", "") if isinstance(logs_data, dict) else ""
                    if logs_text and "No log files found" not in logs_text:
                        lines = logs_text.splitlines()
                        if len(lines) > seen_log_lines:
                            if spinner and seen_log_lines == 0:
                                spinner.stop()
                                spinner = None
                            for line in lines[seen_log_lines:]:
                                console.print(f"[dim]{line}[/dim]")
                            seen_log_lines = len(lines)
            except httpx.HTTPError:
                pass

        try:
            response = api.get(tunnel_url, timeout=10.0, reraise_transport=True)
            if response.status_code == 200:
                data = response.json()
                if data.get("is_ready"):
                    if spinner:
                        spinner.stop()
                    return data
        except httpx.HTTPError:
            pass

        time.sleep(POLL_INTERVAL)


def _print_connection_info(tunnel_info: dict, job_id: str) -> None:
    """Render connection info from tunnel_info instructions."""
    console.print("\n[success bold]✓ Service is ready![/success bold]\n")

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


def interactive(
    timeout: int = DEFAULT_TIMEOUT,
    experiment_id: str | None = None,
    provider: str | None = None,
    template: str | None = None,
    env: list[str] | None = None,
    cpus: str | None = None,
    memory: str | None = None,
    disk_space: str | None = None,
    accelerators: str | None = None,
    num_nodes: int | None = None,
    minutes: int | None = None,
    no_poll: bool = False,
) -> None:
    """Launch an interactive task (Jupyter, vLLM, Ollama, etc.)."""
    resolved_experiment_id = _get_experiment_id(experiment_id)
    json_mode = cli_state.output_format == "json"

    # Parse --env KEY=VALUE pairs into a dict
    preset_env: dict[str, str] | None = None
    if env:
        preset_env = {}
        for item in env:
            if "=" not in item:
                if json_mode:
                    print(json_mod.dumps({"error": f"Invalid --env format: {item!r}. Expected KEY=VALUE"}))
                else:
                    console.print(f"[error]Error:[/error] Invalid --env format: {item!r}. Expected KEY=VALUE")
                raise typer.Exit(1)
            k, _, v = item.partition("=")
            preset_env[k] = v

    # Build preset resources from flags (only non-None values)
    preset_resources: dict | None = None
    resource_flags = {
        "cpus": cpus,
        "memory": memory,
        "disk_space": disk_space,
        "accelerators": accelerators,
        "num_nodes": num_nodes,
        "minutes_requested": minutes,
    }
    resource_flags_set = {k: v for k, v in resource_flags.items() if v is not None}
    if resource_flags_set:
        preset_resources = resource_flags_set

    # Non-interactive mode requires --provider and --template
    is_non_interactive = provider is not None or template is not None or json_mode
    if is_non_interactive and (provider is None or template is None):
        msg = "Non-interactive mode requires both --provider and --template"
        if json_mode:
            print(json_mod.dumps({"error": msg}))
        else:
            console.print(f"[error]Error:[/error] {msg}")
        raise typer.Exit(1)

    # 1. Select provider
    selected_provider = _select_provider(provider_hint=provider)
    is_local = selected_provider.get("type") == "local"

    # 2. Select template
    selected_template = _select_template(resolved_experiment_id, selected_provider, template_hint=template)
    if not json_mode:
        console.print(f"\n[bold]Task:[/bold] {selected_template.get('name', 'Unknown')}")

    # 3. Collect env parameters (in non-interactive mode, pass empty dict to use defaults without prompting)
    env_vars = _collect_env_params(
        selected_template,
        selected_provider,
        preset_env=preset_env if is_non_interactive and preset_env else ({} if is_non_interactive else None),
    )

    # 4. Collect resources (remote only)
    resources: dict = {}
    if not is_local:
        resources = _collect_resources(
            selected_template, preset_resources=preset_resources if is_non_interactive else preset_resources
        )

    # 5. Import task from gallery
    if not json_mode:
        with console.status("[bold success]Importing task...[/bold success]", spinner="dots"):
            task_id = _import_task(resolved_experiment_id, selected_template, env_vars)
    else:
        task_id = _import_task(resolved_experiment_id, selected_template, env_vars)

    # 6. Launch
    payload = _build_interactive_launch_payload(
        resolved_experiment_id, task_id, selected_provider, selected_template, env_vars, resources
    )

    if not json_mode:
        with console.status("[bold success]Launching...[/bold success]", spinner="dots"):
            job_id = _launch(selected_provider, payload)
        console.print(f"Job [bold]{job_id}[/bold] created.")
    else:
        job_id = _launch(selected_provider, payload)

    # 7. If --no-poll, just print the job ID and exit
    if no_poll:
        if json_mode:
            print(json_mod.dumps({"job_id": job_id, "task_id": task_id, "experiment_id": resolved_experiment_id}))
        else:
            console.print(f"Job [bold]{job_id}[/bold] created. Use [bold]lab job info {job_id}[/bold] to check status.")
        return

    # 8. Poll until ready
    tunnel_info = _poll_until_ready(resolved_experiment_id, job_id, timeout, json_mode=json_mode)

    # 9. Print connection info
    if json_mode:
        tunnel_info["job_id"] = job_id
        tunnel_info["task_id"] = task_id
        tunnel_info["experiment_id"] = resolved_experiment_id
        print(json_mod.dumps(tunnel_info))
    else:
        _print_connection_info(tunnel_info, job_id)
