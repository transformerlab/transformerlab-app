import json

import typer
from rich.console import Console

import transformerlab_cli.util.api as api
from transformerlab_cli.util.config import check_configs
from transformerlab_cli.util.ui import render_object, render_table
from transformerlab_cli.state import cli_state

app = typer.Typer()

console = Console()

PROVIDER_TYPES = ["slurm", "skypilot", "runpod", "local"]

PROVIDER_CONFIG_FIELDS: dict[str, list[tuple[str, str]]] = {
    "skypilot": [
        ("server_url", "SkyPilot server URL"),
        ("api_token", "API token"),
    ],
    "slurm": [
        ("mode", "Connection mode (ssh or rest)"),
        ("rest_url", "REST API URL (if mode=rest)"),
        ("ssh_host", "SSH hostname (if mode=ssh)"),
        ("ssh_user", "SSH username"),
        ("ssh_key_path", "Path to SSH key"),
        ("ssh_port", "SSH port"),
        ("api_token", "API token (if mode=rest)"),
    ],
    "runpod": [
        ("api_key", "RunPod API key"),
        ("api_base_url", "RunPod API base URL"),
        ("default_gpu_type", "Default GPU type"),
        ("default_region", "Default region"),
        ("default_template_id", "Default template ID"),
        ("default_network_volume_id", "Default network volume ID"),
    ],
    "local": [],
}


def _prompt_provider_type() -> str:
    """Prompt user to select a provider type from a numbered list."""
    console.print("\n[bold cyan]Provider Types:[/bold cyan]")
    for i, pt in enumerate(PROVIDER_TYPES, 1):
        console.print(f"  [bold]{i}[/bold]. {pt}")

    while True:
        choice = typer.prompt("\nSelect a provider type", default="1")
        try:
            idx = int(choice) - 1
            if 0 <= idx < len(PROVIDER_TYPES):
                return PROVIDER_TYPES[idx]
            console.print(f"[red]Please enter a number between 1 and {len(PROVIDER_TYPES)}[/red]")
        except ValueError:
            console.print("[red]Please enter a valid number[/red]")


def _prompt_config_fields(provider_type: str) -> dict:
    """Prompt user for type-specific config fields. Empty responses are skipped."""
    fields = PROVIDER_CONFIG_FIELDS.get(provider_type, [])
    if not fields:
        return {}

    console.print(f"\n[bold cyan]Configuration for {provider_type}:[/bold cyan]")
    config: dict = {}
    for field_name, description in fields:
        value = typer.prompt(f"  {description} ({field_name})", default="", show_default=False)
        value = value.strip()
        if value:
            config[field_name] = value
    return config


def _extract_error_detail(response) -> str:
    """Extract error detail from an API response."""
    try:
        return response.json().get("detail", response.text)
    except Exception:
        return response.text


## COMMANDS ##


@app.command("list")
def command_provider_list(
    include_disabled: bool = typer.Option(False, "--include-disabled", help="Include disabled providers"),
):
    """List all compute providers."""
    check_configs()

    with console.status("[bold green]Fetching providers...[/bold green]", spinner="dots"):
        response = api.get(f"/compute_provider/?include_disabled={str(include_disabled).lower()}")

    if response.status_code == 200:
        providers = response.json()
        table_columns = ["id", "name", "type", "disabled", "created_at", "updated_at"]
        render_table(
            data=providers, format_type=cli_state.output_format, table_columns=table_columns, title="Providers"
        )
    else:
        console.print(f"[red]Error:[/red] Failed to fetch providers. {_extract_error_detail(response)}")
        raise typer.Exit(1)


@app.command("add")
def command_provider_add(
    name: str = typer.Option(None, "--name", help="Provider name"),
    provider_type: str = typer.Option(None, "--type", help="Provider type (slurm, skypilot, runpod, local)"),
    config: str = typer.Option(None, "--config", help="Provider config as JSON string"),
    interactive: bool = typer.Option(True, "--interactive/--no-interactive", help="Use interactive prompts"),
):
    """Add a new compute provider."""
    check_configs()

    if not interactive:
        if not name or not provider_type or config is None:
            console.print("[red]Error:[/red] --name, --type, and --config are required with --no-interactive")
            raise typer.Exit(1)
        if provider_type not in PROVIDER_TYPES:
            console.print(
                f"[red]Error:[/red] Invalid type '{provider_type}'. Must be one of: {', '.join(PROVIDER_TYPES)}"
            )
            raise typer.Exit(1)
        try:
            config_dict = json.loads(config)
        except json.JSONDecodeError as e:
            console.print(f"[red]Error:[/red] Invalid JSON in --config: {e}")
            raise typer.Exit(1)
    else:
        if not name:
            name = typer.prompt("Provider name")
        if not provider_type:
            provider_type = _prompt_provider_type()
        elif provider_type not in PROVIDER_TYPES:
            console.print(
                f"[red]Error:[/red] Invalid type '{provider_type}'. Must be one of: {', '.join(PROVIDER_TYPES)}"
            )
            raise typer.Exit(1)
        if config is not None:
            try:
                config_dict = json.loads(config)
            except json.JSONDecodeError as e:
                console.print(f"[red]Error:[/red] Invalid JSON in --config: {e}")
                raise typer.Exit(1)
        else:
            config_dict = _prompt_config_fields(provider_type)

    payload = {"name": name, "type": provider_type, "config": config_dict}

    with console.status("[bold green]Creating provider...[/bold green]", spinner="dots"):
        response = api.post_json("/compute_provider/", json_data=payload)

    if response.status_code == 200:
        result = response.json()
        provider_id = result.get("id", "unknown")
        console.print(f"[green]✓[/green] Provider created with ID: [bold]{provider_id}[/bold]")
    else:
        console.print(f"[red]Error:[/red] Failed to create provider. {_extract_error_detail(response)}")
        raise typer.Exit(1)


@app.command("info")
def command_provider_info(
    provider_id: str = typer.Argument(..., help="Provider ID"),
):
    """Show details for a compute provider."""
    check_configs()

    with console.status(f"[bold green]Fetching provider {provider_id}...[/bold green]", spinner="dots"):
        response = api.get(f"/compute_provider/{provider_id}")

    if response.status_code == 200:
        render_object(response.json(), format_type=cli_state.output_format)
    elif response.status_code == 404:
        console.print(f"[red]Error:[/red] Provider {provider_id} not found.")
        raise typer.Exit(1)
    else:
        console.print(f"[red]Error:[/red] Failed to fetch provider. {_extract_error_detail(response)}")
        raise typer.Exit(1)


@app.command("update")
def command_provider_update(
    provider_id: str = typer.Argument(..., help="Provider ID"),
    name: str = typer.Option(None, "--name", help="New provider name"),
    config: str = typer.Option(None, "--config", help="Config fields as JSON string (merged with existing)"),
    disabled: bool = typer.Option(None, "--disabled/--enabled", help="Disable or enable the provider"),
):
    """Update a compute provider."""
    check_configs()

    payload: dict = {}
    if name is not None:
        payload["name"] = name
    if config is not None:
        try:
            payload["config"] = json.loads(config)
        except json.JSONDecodeError as e:
            console.print(f"[red]Error:[/red] Invalid JSON in --config: {e}")
            raise typer.Exit(1)
    if disabled is not None:
        payload["disabled"] = disabled

    if not payload:
        console.print(
            "[yellow]Nothing to update.[/yellow] Provide at least one of --name, --config, --disabled/--enabled."
        )
        raise typer.Exit(0)

    with console.status(f"[bold green]Updating provider {provider_id}...[/bold green]", spinner="dots"):
        response = api.patch(f"/compute_provider/{provider_id}", json_data=payload)

    if response.status_code == 200:
        console.print(f"[green]✓[/green] Provider [bold]{provider_id}[/bold] updated.")
    elif response.status_code == 404:
        console.print(f"[red]Error:[/red] Provider {provider_id} not found.")
        raise typer.Exit(1)
    else:
        console.print(f"[red]Error:[/red] Failed to update provider. {_extract_error_detail(response)}")
        raise typer.Exit(1)


@app.command("delete")
def command_provider_delete(
    provider_id: str = typer.Argument(..., help="Provider ID to delete"),
    yes: bool = typer.Option(False, "--yes", "-y", help="Skip confirmation prompt"),
):
    """Delete a compute provider."""
    check_configs()

    if not yes:
        typer.confirm(f"Delete provider {provider_id}?", abort=True)

    with console.status(f"[bold green]Deleting provider {provider_id}...[/bold green]", spinner="dots"):
        response = api.delete(f"/compute_provider/{provider_id}")

    if response.status_code == 200:
        console.print(f"[green]✓[/green] Provider [bold]{provider_id}[/bold] deleted.")
    elif response.status_code == 404:
        console.print(f"[red]Error:[/red] Provider {provider_id} not found.")
        raise typer.Exit(1)
    else:
        console.print(f"[red]Error:[/red] Failed to delete provider. {_extract_error_detail(response)}")
        raise typer.Exit(1)


@app.command("check")
def command_provider_check(
    provider_id: str = typer.Argument(..., help="Provider ID to check"),
):
    """Check connectivity and health of a compute provider."""
    check_configs()

    with console.status(f"[bold green]Checking provider {provider_id}...[/bold green]", spinner="dots"):
        response = api.get(f"/compute_provider/{provider_id}/check", timeout=60.0)

    if response.status_code == 200:
        result = response.json()
        render_object(result, format_type=cli_state.output_format)
    elif response.status_code == 404:
        console.print(f"[red]Error:[/red] Provider {provider_id} not found.")
        raise typer.Exit(1)
    else:
        console.print(f"[red]Error:[/red] Health check failed. {_extract_error_detail(response)}")
        raise typer.Exit(1)


@app.command("enable")
def command_provider_enable(
    provider_id: str = typer.Argument(..., help="Provider ID to enable"),
):
    """Enable a compute provider."""
    check_configs()

    with console.status(f"[bold green]Enabling provider {provider_id}...[/bold green]", spinner="dots"):
        response = api.patch(f"/compute_provider/{provider_id}", json_data={"disabled": False})

    if response.status_code == 200:
        console.print(f"[green]✓[/green] Provider [bold]{provider_id}[/bold] enabled.")
    elif response.status_code == 404:
        console.print(f"[red]Error:[/red] Provider {provider_id} not found.")
        raise typer.Exit(1)
    else:
        console.print(f"[red]Error:[/red] Failed to enable provider. {_extract_error_detail(response)}")
        raise typer.Exit(1)


@app.command("disable")
def command_provider_disable(
    provider_id: str = typer.Argument(..., help="Provider ID to disable"),
):
    """Disable a compute provider."""
    check_configs()

    with console.status(f"[bold green]Disabling provider {provider_id}...[/bold green]", spinner="dots"):
        response = api.patch(f"/compute_provider/{provider_id}", json_data={"disabled": True})

    if response.status_code == 200:
        console.print(f"[green]✓[/green] Provider [bold]{provider_id}[/bold] disabled.")
    elif response.status_code == 404:
        console.print(f"[red]Error:[/red] Provider {provider_id} not found.")
        raise typer.Exit(1)
    else:
        console.print(f"[red]Error:[/red] Failed to disable provider. {_extract_error_detail(response)}")
        raise typer.Exit(1)
