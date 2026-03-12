# CLI Interactive Tasks Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `lab task interactive` CLI command and TUI integration so users can launch interactive sessions (Jupyter, vLLM, Ollama, etc.) from the command line.

**Architecture:** A new `interactive.py` module implements the CLI flow (provider selection → template filtering → env param collection → launch → poll → print). The TUI gets a new `InteractiveTaskModal` modal screen and connection info display in `JobDetails`. Both paths call existing backend APIs — no new endpoints needed.

**Tech Stack:** Python, Typer, Rich (CLI prompts/rendering), Textual (TUI), httpx (API calls)

**Spec:** `docs/superpowers/specs/2026-03-12-cli-interactive-tasks-design.md`

---

## Chunk 1: `lab job stop` Command + CLI Interactive Command

### Task 1: Add `lab job stop` command

**Files:**
- Modify: `cli/src/transformerlab_cli/commands/job.py`

This is a prerequisite. The API endpoint `GET /experiment/{experimentId}/jobs/{job_id}/stop` already exists.

- [ ] **Step 1: Add `stop_job` function and command to `job.py`**

Add after the `command_job_info` function (after line 279):

```python
@app.command("stop")
def command_job_stop(
    job_id: str = typer.Argument(..., help="Job ID to stop"),
):
    """Stop a running job."""
    check_configs()
    current_experiment = get_config("current_experiment")
    if not current_experiment or not str(current_experiment).strip():
        console.print("[yellow]current_experiment is not set in config.[/yellow]")
        console.print("Set it first with: [bold]lab config current_experiment <experiment_name>[/bold]")
        raise typer.Exit(1)

    with console.status(f"[bold green]Stopping job {job_id}...[/bold green]", spinner="dots"):
        response = api.get(f"/experiment/{current_experiment}/jobs/{job_id}/stop")

    if response.status_code == 200:
        console.print(f"[green]✓[/green] Job [bold]{job_id}[/bold] stopped.")
    else:
        console.print(f"[red]Error:[/red] Failed to stop job. Status code: {response.status_code}")
        try:
            detail = response.json().get("detail", response.text)
            console.print(f"[red]Detail:[/red] {detail}")
        except Exception:
            console.print(f"[red]Response:[/red] {response.text}")
        raise typer.Exit(1)
```

- [ ] **Step 2: Verify the command registers**

Run: `cd cli && pip install -e . && lab job --help`
Expected: `stop` appears in the list of subcommands.

- [ ] **Step 3: Commit**

```bash
git add cli/src/transformerlab_cli/commands/job.py
git commit -m "feat(cli): add lab job stop command"
```

---

### Task 2: Create the interactive task CLI command

**Files:**
- Create: `cli/src/transformerlab_cli/commands/interactive.py`
- Modify: `cli/src/transformerlab_cli/commands/task.py` (register the command)

- [ ] **Step 1: Create `interactive.py` with the full command**

Create `cli/src/transformerlab_cli/commands/interactive.py`:

```python
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
```

- [ ] **Step 2: Register the command in `task.py`**

Add at the end of `cli/src/transformerlab_cli/commands/task.py` (after line 503):

```python
@app.command("interactive")
def command_task_interactive(
    timeout: int = typer.Option(300, "--timeout", "-t", help="Timeout in seconds waiting for service readiness"),
):
    """Launch an interactive task (Jupyter, vLLM, Ollama, etc.)."""
    from transformerlab_cli.commands.interactive import interactive
    interactive(timeout=timeout)
```

Note: We wrap the call so that the `interactive` function's Typer options aren't duplicated. We forward the `timeout` option.

- [ ] **Step 3: Verify the command registers**

Run: `cd cli && pip install -e . && lab task --help`
Expected: `interactive` appears in the list of subcommands.

Run: `lab task interactive --help`
Expected: Shows help with `--timeout` option.

- [ ] **Step 4: Commit**

```bash
git add cli/src/transformerlab_cli/commands/interactive.py cli/src/transformerlab_cli/commands/task.py
git commit -m "feat(cli): add lab task interactive command"
```

---

## Chunk 2: TUI Integration

### Task 3: Create InteractiveTaskModal for the TUI

**Files:**
- Create: `cli/src/transformerlab_cli/commands/job_monitor/InteractiveTaskModal.py`

This modal follows the pattern of `TaskQueueModal` in `TaskListModal.py` (lines 45-331). It fetches the interactive gallery, filters by provider, lets the user pick a template, fill in env params, and launch.

- [ ] **Step 1: Create `InteractiveTaskModal.py`**

Create `cli/src/transformerlab_cli/commands/job_monitor/InteractiveTaskModal.py`:

```python
from textual.app import ComposeResult
from textual.widgets import (
    Static,
    Label,
    LoadingIndicator,
    Button,
    OptionList,
    Input,
    Select,
)
from textual.widgets.option_list import Option
from textual.containers import Vertical, ScrollableContainer
from textual.screen import ModalScreen
from textual import work, on

from transformerlab_cli.util import api
from transformerlab_cli.util.config import get_current_experiment
from transformerlab_cli.commands.task import fetch_providers, launch_task_on_provider


class InteractiveTaskConfigModal(ModalScreen):
    """Modal for configuring and launching an interactive task."""

    DEFAULT_CSS = """
    InteractiveTaskConfigModal {
        align: center middle;
    }
    #interactive-config-modal {
        width: 60%;
        min-width: 50;
        max-height: 80%;
        padding: 2;
        border: round $primary;
        background: $panel;
    }
    #interactive-form-container {
        height: 1fr;
        max-height: 20;
    }
    .form-row {
        height: auto;
        margin-bottom: 1;
    }
    .form-label {
        width: 100%;
        height: auto;
    }
    .form-input {
        width: 100%;
    }
    #interactive-submit-btn {
        margin-top: 1;
        width: 100%;
    }
    #interactive-spinner {
        height: 3;
        display: none;
    }
    #interactive-status {
        text-align: center;
        height: auto;
    }
    """

    BINDINGS = [("escape", "dismiss", "Close")]

    def __init__(self, gallery_entry: dict, provider: dict) -> None:
        super().__init__()
        self.gallery_entry = gallery_entry
        self.provider = provider
        self.param_widgets: dict[str, str] = {}
        self.is_local = provider.get("type") == "local"

    def compose(self) -> ComposeResult:
        name = self.gallery_entry.get("name", "Unknown")
        env_parameters = self._filtered_env_params()

        with Vertical(id="interactive-config-modal"):
            yield Label(f"[b]Launch: {name}[/b]")
            yield Label(f"[dim]{self.gallery_entry.get('description', '')}[/dim]")

            with ScrollableContainer(id="interactive-form-container"):
                if not env_parameters:
                    yield Label("[dim]No configuration needed[/dim]")
                else:
                    yield Label("[b]Configuration[/b]")
                    for param in env_parameters:
                        yield from self._render_param_field(param)

            yield Button("Launch", id="interactive-submit-btn", variant="primary")
            yield LoadingIndicator(id="interactive-spinner")
            yield Label("", id="interactive-status")

    def _filtered_env_params(self) -> list[dict]:
        """Return env_parameters, filtering out NGROK for local providers."""
        params = self.gallery_entry.get("env_parameters", [])
        if self.is_local:
            params = [p for p in params if p.get("env_var") != "NGROK_AUTH_TOKEN"]
        return params

    def _render_param_field(self, param: dict) -> ComposeResult:
        env_var = param.get("env_var", "")
        field_name = param.get("field_name", env_var)
        is_password = param.get("password", False)
        widget_id = f"iparam-{env_var}"
        self.param_widgets[env_var] = widget_id

        # Smart default for NGROK on remote
        default = ""
        if not self.is_local and env_var == "NGROK_AUTH_TOKEN":
            default = "{{secret._NGROK_AUTH_TOKEN}}"

        with Vertical(classes="form-row"):
            yield Label(f"{field_name}:", classes="form-label")
            yield Input(
                value=default,
                password=is_password,
                placeholder=param.get("placeholder", ""),
                id=widget_id,
                classes="form-input",
            )

    def _collect_env_vars(self) -> dict[str, str]:
        env_vars: dict[str, str] = {}
        for env_var, widget_id in self.param_widgets.items():
            try:
                widget = self.query_one(f"#{widget_id}", Input)
                if widget.value:
                    env_vars[env_var] = widget.value
            except Exception:
                pass
        return env_vars

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "interactive-submit-btn":
            self._show_spinner(True, "Importing and launching...")
            self._do_launch()

    def _show_spinner(self, show: bool, message: str = "") -> None:
        spinner = self.query_one("#interactive-spinner", LoadingIndicator)
        status = self.query_one("#interactive-status", Label)
        button = self.query_one("#interactive-submit-btn", Button)
        spinner.display = show
        button.display = not show
        status.update(message)

    @work(thread=True)
    def _do_launch(self) -> None:
        env_vars = self._collect_env_vars()
        experiment_id = get_current_experiment() or "alpha"
        gallery_entry = self.gallery_entry
        provider = self.provider

        try:
            # Import task
            import_payload = {
                "gallery_id": gallery_entry.get("id"),
                "experiment_id": experiment_id,
                "is_interactive": True,
                "env_vars": env_vars,
            }
            resp = api.post_json(f"/experiment/{experiment_id}/task/gallery/import", import_payload)
            if resp.status_code != 200:
                raise RuntimeError(f"Import failed: {resp.text}")
            task_id = resp.json().get("id")

            # Build launch payload
            is_local = provider.get("type") == "local"
            launch_payload = {
                "experiment_id": experiment_id,
                "task_id": str(task_id),
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
            }

            data = launch_task_on_provider(provider.get("id"), launch_payload)
            job_id = data.get("job_id", "unknown")
            self.app.call_from_thread(
                self.notify, f"Interactive task launched. Job ID: {job_id}", severity="information"
            )
            self.app.call_from_thread(self._dismiss_all)
        except Exception as e:
            self.app.call_from_thread(self._show_spinner, False)
            self.app.call_from_thread(self.notify, str(e), severity="error")

    def _dismiss_all(self) -> None:
        """Dismiss this modal and the parent InteractiveTaskModal."""
        self.dismiss()
        self.app.pop_screen()


class InteractiveTaskModal(ModalScreen):
    """Modal listing interactive gallery templates for a given provider."""

    DEFAULT_CSS = """
    InteractiveTaskModal {
        align: center middle;
    }
    #interactive-list-modal {
        width: 60%;
        min-width: 50;
        height: 80%;
        padding: 2;
        border: round $primary;
        background: $panel;
    }
    #interactive-list-body {
        height: 1fr;
        margin-bottom: 1;
    }
    #interactive-option-list {
        height: 100%;
        min-height: 10;
    }
    Select {
        width: 100%;
        height: auto;
        min-height: 3;
    }
    Select > SelectCurrent {
        width: 1fr;
        height: auto;
        min-height: 1;
        padding: 0 1;
    }
    Select > SelectCurrent > Static {
        width: 1fr;
    }
    """

    BINDINGS = [("escape", "dismiss", "Close")]

    def __init__(self) -> None:
        super().__init__()
        self.providers: list[dict] = []
        self.gallery: list[dict] = []
        self.filtered: list[dict] = []
        self.selected_provider: dict = {}

    def compose(self) -> ComposeResult:
        with Vertical(id="interactive-list-modal"):
            yield Label("[b]Launch Interactive Task[/b]")
            with Vertical(classes="form-row"):
                yield Label("Provider:", classes="form-label")
                yield Select(
                    [("Loading...", "_loading")],
                    value="_loading",
                    allow_blank=False,
                    id="interactive-provider-select",
                )
            with Vertical(id="interactive-list-body"):
                yield LoadingIndicator(id="interactive-loader")
                yield OptionList(id="interactive-option-list")
            yield Static("", id="interactive-feedback")

    def on_mount(self) -> None:
        self.query_one("#interactive-option-list", OptionList).display = False
        self._fetch_data()

    @work(thread=True)
    def _fetch_data(self) -> None:
        """Fetch providers and gallery in background."""
        providers = fetch_providers()
        experiment_id = get_current_experiment() or "alpha"
        try:
            resp = api.get(f"/experiment/{experiment_id}/task/gallery/interactive")
            gallery = resp.json().get("data", []) if resp.status_code == 200 else []
        except Exception:
            gallery = []
        self.app.call_from_thread(self._populate, providers, gallery)

    def _populate(self, providers: list[dict], gallery: list[dict]) -> None:
        self.providers = providers
        self.gallery = gallery

        loader = self.query_one("#interactive-loader", LoadingIndicator)
        loader.display = False

        provider_select = self.query_one("#interactive-provider-select", Select)
        if not providers:
            provider_select.set_options([("No providers", "_none")])
            provider_select.value = "_none"
            return

        options = [(p.get("name", p.get("id")), p.get("id")) for p in providers]
        provider_select.set_options(options)
        provider_select.value = providers[0].get("id")
        self.selected_provider = providers[0]
        self._filter_gallery()

    @on(Select.Changed, "#interactive-provider-select")
    def on_provider_changed(self, event: Select.Changed) -> None:
        if event.value and event.value != Select.BLANK:
            self.selected_provider = next(
                (p for p in self.providers if p.get("id") == event.value), {}
            )
            self._filter_gallery()

    def _filter_gallery(self) -> None:
        """Filter gallery entries by provider compatibility."""
        provider = self.selected_provider
        is_local = provider.get("type") == "local"

        provider_acc = set()
        acc = provider.get("supported_accelerators") or provider.get("accelerators")
        if isinstance(acc, str):
            provider_acc = {a.strip() for a in acc.split(",") if a.strip()}
        elif isinstance(acc, list):
            provider_acc = set(acc)

        self.filtered = []
        for entry in self.gallery:
            if is_local and entry.get("remoteOnly"):
                continue
            task_acc = entry.get("supported_accelerators", [])
            if isinstance(task_acc, str):
                task_acc = [a.strip() for a in task_acc.split(",") if a.strip()]
            if task_acc and provider_acc and not set(task_acc) & provider_acc:
                continue
            self.filtered.append(entry)

        option_list = self.query_one("#interactive-option-list", OptionList)
        option_list.display = True
        option_list.clear_options()

        feedback = self.query_one("#interactive-feedback", Static)
        if not self.filtered:
            feedback.update("[yellow]No compatible interactive tasks for this provider.[/yellow]")
            return
        feedback.update("")

        for entry in self.filtered:
            option_list.add_option(
                Option(f"{entry.get('name', '?')} - {entry.get('description', '')}", id=entry.get("id"))
            )

    @on(OptionList.OptionSelected, "#interactive-option-list")
    def on_template_selected(self, event: OptionList.OptionSelected) -> None:
        if event.option_id:
            entry = next((e for e in self.filtered if e.get("id") == event.option_id), None)
            if entry:
                self.app.push_screen(InteractiveTaskConfigModal(entry, self.selected_provider))
```

- [ ] **Step 2: Verify the file is syntactically valid**

Run: `cd cli && python -c "from transformerlab_cli.commands.job_monitor.InteractiveTaskModal import InteractiveTaskModal; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add cli/src/transformerlab_cli/commands/job_monitor/InteractiveTaskModal.py
git commit -m "feat(cli): add InteractiveTaskModal for TUI job monitor"
```

---

### Task 4: Wire InteractiveTaskModal into JobMonitorApp

**Files:**
- Modify: `cli/src/transformerlab_cli/commands/job_monitor/JobMonitorApp.py`

- [ ] **Step 1: Add import and keybinding**

In `JobMonitorApp.py`, add the import (after line 11):

```python
from transformerlab_cli.commands.job_monitor.InteractiveTaskModal import InteractiveTaskModal
```

Add to the `BINDINGS` list (after line 51, the `"l"` binding):

```python
        ("i", "interactive_task", "Interactive Task"),
```

Add the action method (after `action_list_tasks`, around line 84):

```python
    def action_interactive_task(self) -> None:
        self.push_screen(InteractiveTaskModal())
```

- [ ] **Step 2: Verify keybinding appears in footer**

Run: `cd cli && pip install -e . && lab job monitor`
Expected: Footer shows `i Interactive Task` alongside other keybindings.

- [ ] **Step 3: Commit**

```bash
git add cli/src/transformerlab_cli/commands/job_monitor/JobMonitorApp.py
git commit -m "feat(cli): add 'i' keybinding for interactive tasks in TUI monitor"
```

---

### Task 5: Add connection info display to JobDetails

**Files:**
- Modify: `cli/src/transformerlab_cli/commands/job_monitor/JobDetails.py`

When an interactive job is selected and its status is `INTERACTIVE`, fetch tunnel_info and display connection URLs/commands.

- [ ] **Step 1: Add connection info section to `set_job`**

In `JobDetails.py`, add after the artifacts section update (after line 113, the `artifacts_container.add_class("visible")` line). Also add the necessary import at the top (after line 7):

```python
from transformerlab_cli.util.config import get_current_experiment
```

Add a new method and update `set_job`:

After `artifacts_container.add_class("visible")` (line 113), add:

```python
        # Show connection info for interactive jobs
        job_data = job.get("job_data", {})
        if job_data.get("subtype") == "interactive" and job.get("status") == "INTERACTIVE":
            self._fetch_connection_info(str(job.get("id", "")))
```

Add the following methods at the end of the class (before the `on_button_pressed` method at line 115):

```python
    @work(thread=True)
    def _fetch_connection_info(self, job_id: str) -> None:
        """Fetch tunnel info for an interactive job."""
        experiment_id = get_current_experiment() or "alpha"
        try:
            response = api.get(f"/experiment/{experiment_id}/jobs/{job_id}/tunnel_info", timeout=10.0)
            if response.status_code == 200:
                data = response.json()
                if data.get("is_ready"):
                    self.app.call_from_thread(self._display_connection_info, data)
        except Exception:
            pass

    def _display_connection_info(self, tunnel_info: dict) -> None:
        """Display connection info in the artifacts section."""
        instructions = tunnel_info.get("instructions", [])
        values = {k: str(v) for k, v in tunnel_info.items() if v is not None and isinstance(v, (str, int, float))}

        lines = ["[bold]Connection Info:[/bold]\n"]
        for block in instructions:
            kind = block.get("kind")
            title = block.get("title", "")
            value_key = block.get("value_key")
            value = values.get(value_key, "") if value_key else ""

            if kind in ("url", "code", "command") and value:
                lines.append(f"[$primary]{title}:[/$primary] {value}")
            elif kind == "kv":
                for item in block.get("items", []):
                    val = values.get(item.get("value_key", ""), "")
                    if val:
                        lines.append(f"  {item.get('label', '')}: {val}")

        if len(lines) > 1:
            info_text = "\n".join(lines)
            artifacts_view = self.query_one("#job-artifacts", Static)
            current = str(artifacts_view.renderable)
            artifacts_view.update(f"{current}\n\n{info_text}")
```

- [ ] **Step 2: Verify it compiles**

Run: `cd cli && python -c "from transformerlab_cli.commands.job_monitor.JobDetails import JobDetails; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add cli/src/transformerlab_cli/commands/job_monitor/JobDetails.py
git commit -m "feat(cli): show connection info for interactive jobs in TUI monitor"
```

---

### Task 6: Format and final verification

- [ ] **Step 1: Run ruff on all changed Python files**

```bash
cd cli && ruff check src/transformerlab_cli/commands/interactive.py src/transformerlab_cli/commands/job.py src/transformerlab_cli/commands/task.py src/transformerlab_cli/commands/job_monitor/InteractiveTaskModal.py src/transformerlab_cli/commands/job_monitor/JobMonitorApp.py src/transformerlab_cli/commands/job_monitor/JobDetails.py
cd cli && ruff format src/transformerlab_cli/commands/interactive.py src/transformerlab_cli/commands/job.py src/transformerlab_cli/commands/task.py src/transformerlab_cli/commands/job_monitor/InteractiveTaskModal.py src/transformerlab_cli/commands/job_monitor/JobMonitorApp.py src/transformerlab_cli/commands/job_monitor/JobDetails.py
```

Fix any issues found.

- [ ] **Step 2: Verify CLI commands register**

```bash
cd cli && pip install -e .
lab job --help       # should show 'stop'
lab task --help      # should show 'interactive'
lab task interactive --help  # should show --timeout
```

- [ ] **Step 3: Commit any formatting fixes**

```bash
git add -A cli/src/transformerlab_cli/
git commit -m "style(cli): format interactive task files"
```
