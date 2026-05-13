import json

import typer

import transformerlab_cli.util.api as api
from transformerlab_cli.util.config import check_configs
from transformerlab_cli.util.ui import console, render_object, render_table
from transformerlab_cli.state import cli_state

app = typer.Typer()

PROVIDER_TYPES = ["slurm", "skypilot", "runpod", "vastai", "dstack", "aws", "gcp", "azure", "local"]

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
    "dstack": [
        ("server_url", "dstack server URL (e.g. http://0.0.0.0:3000)"),
        ("api_token", "dstack API token"),
        ("dstack_project", "dstack project name (e.g. main)"),
    ],
    "aws": [
        ("region", "AWS region (e.g. us-east-1)"),
    ],
    "gcp": [
        ("region", "GCP region (e.g. us-central1)"),
        ("zone", "GCP zone (optional, e.g. us-central1-a)"),
    ],
    "azure": [
        ("azure_subscription_id", "Azure subscription ID"),
        ("azure_tenant_id", "Azure tenant ID"),
        ("azure_client_id", "Azure client ID (Service Principal)"),
        ("azure_client_secret", "Azure client secret (Service Principal)"),
        ("azure_location", "Azure location (e.g. eastus)"),
    ],
    "vastai": [
        ("api_key", "Vast.ai API key"),
    ],
    "local": [],
}


def _prompt_provider_type() -> str:
    """Prompt user to select a provider type from a numbered list."""
    console.print("\n[bold label]Provider Types:[/bold label]")
    for i, pt in enumerate(PROVIDER_TYPES, 1):
        console.print(f"  [bold]{i}[/bold]. {pt}")

    while True:
        choice = typer.prompt("\nSelect a provider type", default="1")
        try:
            idx = int(choice) - 1
            if 0 <= idx < len(PROVIDER_TYPES):
                return PROVIDER_TYPES[idx]
            console.print(f"[error]Please enter a number between 1 and {len(PROVIDER_TYPES)}[/error]")
        except ValueError:
            console.print("[error]Please enter a valid number[/error]")


def _prompt_config_fields(provider_type: str) -> dict:
    """Prompt user for type-specific config fields. Empty responses are skipped."""
    fields = PROVIDER_CONFIG_FIELDS.get(provider_type, [])
    if not fields:
        return {}

    console.print(f"\n[bold label]Configuration for {provider_type}:[/bold label]")
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
    except (ValueError, KeyError):
        return response.text


def _extract_provider_check_reason(result: dict) -> str:
    """Extract a human-readable provider check failure reason."""
    reason = result.get("reason")
    if reason:
        return str(reason)
    return "Provider check returned unhealthy status without details."


def _prompt_aws_credentials() -> tuple[str, str]:
    """Prompt for AWS access key ID and secret access key. Returns ("", "") if both are skipped."""
    console.print(
        "\n[bold label]AWS Credentials[/bold label] "
        "[muted](optional - written to the API host's ~/.aws/credentials; leave blank to skip)[/muted]"
    )
    access_key_id = typer.prompt("  AWS Access Key ID", default="", show_default=False, hide_input=False).strip()
    if not access_key_id:
        return "", ""
    secret_access_key = typer.prompt("  AWS Secret Access Key", default="", show_default=False, hide_input=True).strip()
    if not secret_access_key:
        console.print("[warning]Secret access key not provided; skipping AWS credentials upload.[/warning]")
        return "", ""
    return access_key_id, secret_access_key


def _prompt_gcp_service_account_json() -> str:
    """Prompt for the path to a GCP service account JSON key file and return its contents."""
    console.print(
        "\n[bold label]GCP Service Account[/bold label] "
        "[muted](required - provide the path to your service account JSON key file)[/muted]"
    )
    while True:
        path = typer.prompt("  Service account JSON file path", default="", show_default=False).strip()
        if not path:
            console.print("[error]A service account JSON file is required for GCP providers.[/error]")
            continue
        try:
            return _read_service_account_file(path)
        except typer.Exit:
            continue


def _read_credentials_file(path: str) -> dict:
    """Read a JSON credentials file and return its parsed contents.

    The file is expected to be a flat JSON object. Used by `--credentials-file`
    on `provider add` / `provider update` to keep secrets out of argv (and
    therefore out of shell history and `ps` listings).
    """
    try:
        with open(path, "r", encoding="utf-8") as f:
            contents = f.read()
    except OSError as e:
        console.print(f"[error]Error:[/error] Could not read credentials file '{path}': {e}")
        raise typer.Exit(1)
    try:
        data = json.loads(contents)
    except json.JSONDecodeError as e:
        console.print(f"[error]Error:[/error] Credentials file '{path}' is not valid JSON: {e}")
        raise typer.Exit(1)
    if not isinstance(data, dict):
        console.print(f"[error]Error:[/error] Credentials file '{path}' must contain a JSON object.")
        raise typer.Exit(1)
    return data


def _read_service_account_file(path: str) -> str:
    """Read a GCP service account JSON key file and validate it parses as JSON."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            contents = f.read()
    except OSError as e:
        console.print(f"[error]Error:[/error] Could not read service account file '{path}': {e}")
        raise typer.Exit(1)
    try:
        json.loads(contents)
    except json.JSONDecodeError as e:
        console.print(f"[error]Error:[/error] Service account file '{path}' is not valid JSON: {e}")
        raise typer.Exit(1)
    return contents


def _upload_aws_credentials(provider_id: str, access_key_id: str, secret_access_key: str) -> None:
    """POST AWS access keys to the dedicated credentials endpoint."""
    with console.status(f"[bold success]Uploading AWS credentials for {provider_id}...[/bold success]", spinner="dots"):
        response = api.post_json(
            f"/compute_provider/providers/{provider_id}/aws/credentials",
            json_data={"access_key_id": access_key_id, "secret_access_key": secret_access_key},
        )
    if response.status_code == 200:
        console.print("[success]✓[/success] AWS credentials saved to API host.")
    else:
        console.print(f"[error]Error:[/error] Failed to upload AWS credentials. {_extract_error_detail(response)}")
        raise typer.Exit(1)


def _upload_gcp_service_account(provider_id: str, service_account_json: str) -> None:
    """POST the GCP service account JSON to the dedicated credentials endpoint."""
    with console.status(
        f"[bold success]Uploading GCP service account for {provider_id}...[/bold success]", spinner="dots"
    ):
        response = api.post_json(
            f"/compute_provider/providers/{provider_id}/gcp/credentials",
            json_data={"service_account_json": service_account_json},
        )
    if response.status_code == 200:
        console.print("[success]✓[/success] GCP service account saved.")
    else:
        console.print(f"[error]Error:[/error] Failed to upload GCP service account. {_extract_error_detail(response)}")
        raise typer.Exit(1)


## COMMANDS ##


@app.command("list")
def command_provider_list(
    include_disabled: bool = typer.Option(False, "--include-disabled", help="Include disabled providers"),
):
    """List all compute providers."""
    check_configs(output_format=cli_state.output_format)

    with console.status("[bold success]Fetching providers...[/bold success]", spinner="dots"):
        response = api.get(f"/compute_provider/providers/?include_disabled={str(include_disabled).lower()}")

    if response.status_code == 200:
        providers = response.json()
        table_columns = ["id", "name", "type", "disabled", "is_default", "created_at", "updated_at"]
        render_table(
            data=providers,
            format_type=cli_state.output_format,
            table_columns=table_columns,
            title="Providers",
            column_options={
                # Keep provider names as a single token (no wrapping to "Skypilot / New").
                "name": {"no_wrap": True, "overflow": "crop"},
            },
        )
    else:
        console.print(f"[error]Error:[/error] Failed to fetch providers. {_extract_error_detail(response)}")
        raise typer.Exit(1)


@app.command("add")
def command_provider_add(
    name: str = typer.Option(None, "--name", help="Provider name"),
    provider_type: str = typer.Option(
        None,
        "--type",
        help=f"Provider type ({', '.join(PROVIDER_TYPES)})",
    ),
    config: str = typer.Option(None, "--config", help="Provider config as JSON string"),
    interactive: bool = typer.Option(True, "--interactive/--no-interactive", help="Use interactive prompts"),
    credentials_file: str = typer.Option(
        None,
        "--credentials-file",
        help=(
            "Path to a JSON file containing provider secrets. Keeps secrets out of argv "
            "(shell history, ps listings). Shape depends on --type: for aws, "
            '{"aws_access_key_id": "...", "aws_secret_access_key": "..."}; for gcp, the '
            "raw service account JSON key file; for everything else, a flat object whose "
            "fields are merged on top of --config (file values take precedence)."
        ),
    ),
):
    """Add a new compute provider."""
    check_configs(output_format=cli_state.output_format)

    if not interactive:
        if not name or not provider_type or config is None:
            console.print("[error]Error:[/error] --name, --type, and --config are required with --no-interactive")
            raise typer.Exit(1)
        if provider_type not in PROVIDER_TYPES:
            console.print(
                f"[error]Error:[/error] Invalid type '{provider_type}'. Must be one of: {', '.join(PROVIDER_TYPES)}"
            )
            raise typer.Exit(1)
        try:
            config_dict = json.loads(config)
        except json.JSONDecodeError as e:
            console.print(f"[error]Error:[/error] Invalid JSON in --config: {e}")
            raise typer.Exit(1)
    else:
        if not name:
            name = typer.prompt("Provider name")
        if not provider_type:
            provider_type = _prompt_provider_type()
        elif provider_type not in PROVIDER_TYPES:
            console.print(
                f"[error]Error:[/error] Invalid type '{provider_type}'. Must be one of: {', '.join(PROVIDER_TYPES)}"
            )
            raise typer.Exit(1)
        if config is not None:
            try:
                config_dict = json.loads(config)
            except json.JSONDecodeError as e:
                console.print(f"[error]Error:[/error] Invalid JSON in --config: {e}")
                raise typer.Exit(1)
        else:
            config_dict = _prompt_config_fields(provider_type)

    # --credentials-file: shape depends on provider type.
    #   aws: JSON object with aws_access_key_id / aws_secret_access_key (uploaded via /aws/credentials).
    #        Any remaining keys merge into config.
    #   gcp: the raw service account JSON key file (uploaded via /gcp/credentials).
    #   other: a flat JSON object merged on top of --config (file values win).
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    gcp_service_account_json: str | None = None
    if credentials_file:
        if provider_type == "gcp":
            gcp_service_account_json = _read_service_account_file(credentials_file)
        else:
            creds = _read_credentials_file(credentials_file)
            if provider_type == "aws":
                aws_access_key_id = str(creds.pop("aws_access_key_id", "") or "")
                aws_secret_access_key = str(creds.pop("aws_secret_access_key", "") or "")
            config_dict.update(creds)

    # AWS access key pair: must be both-or-neither.
    if provider_type == "aws":
        if bool(aws_access_key_id) != bool(aws_secret_access_key):
            console.print(
                "[error]Error:[/error] --credentials-file for --type aws must contain both "
                "'aws_access_key_id' and 'aws_secret_access_key' (or neither)."
            )
            raise typer.Exit(1)
        if interactive and not aws_access_key_id and not aws_secret_access_key:
            aws_access_key_id, aws_secret_access_key = _prompt_aws_credentials()

    # GCP service account JSON: required at create time (provider will be unhealthy without it).
    if provider_type == "gcp":
        if not gcp_service_account_json and interactive:
            gcp_service_account_json = _prompt_gcp_service_account_json()
        if not gcp_service_account_json:
            console.print(
                "[error]Error:[/error] GCP providers require a service account JSON key. "
                "Pass --credentials-file PATH pointing at your service account JSON "
                "(or run interactively)."
            )
            raise typer.Exit(1)

    payload = {"name": name, "type": provider_type, "config": config_dict}

    with console.status("[bold success]Creating provider...[/bold success]", spinner="dots"):
        response = api.post_json("/compute_provider/providers/", json_data=payload)

    if response.status_code != 200:
        console.print(f"[error]Error:[/error] Failed to create provider. {_extract_error_detail(response)}")
        raise typer.Exit(1)

    result = response.json()
    provider_id = result.get("id", "unknown")
    console.print(f"[success]✓[/success] Provider created with ID: [bold]{provider_id}[/bold]")

    # Submit AWS credentials and GCP service account JSON via their dedicated endpoints,
    # before the health check (the check will fail without credentials).
    if provider_type == "aws" and aws_access_key_id and aws_secret_access_key:
        _upload_aws_credentials(provider_id, aws_access_key_id, aws_secret_access_key)
    if provider_type == "gcp" and gcp_service_account_json:
        _upload_gcp_service_account(provider_id, gcp_service_account_json)

    with console.status(f"[bold success]Checking provider {provider_id}...[/bold success]", spinner="dots"):
        check_response = api.get(f"/compute_provider/providers/{provider_id}/check", timeout=60.0)

    if check_response.status_code == 200:
        check_result = check_response.json()
        if check_result.get("status"):
            console.print("[success]✓[/success] Provider health check passed.")
        else:
            reason = _extract_provider_check_reason(check_result)
            console.print(f"[error]Error:[/error] Provider health check failed. {reason}")
            raise typer.Exit(1)
    else:
        console.print(
            "[error]Error:[/error] Provider was created, but health check failed. "
            f"{_extract_error_detail(check_response)}"
        )
        raise typer.Exit(1)


@app.command("info")
def command_provider_info(
    provider_id: str = typer.Argument(..., help="Provider ID"),
):
    """Show details for a compute provider."""
    check_configs(output_format=cli_state.output_format)

    with console.status(f"[bold success]Fetching provider {provider_id}...[/bold success]", spinner="dots"):
        response = api.get(f"/compute_provider/providers/{provider_id}")

    if response.status_code == 200:
        render_object(response.json(), format_type=cli_state.output_format)
    elif response.status_code == 404:
        console.print(f"[error]Error:[/error] Provider {provider_id} not found.")
        raise typer.Exit(1)
    else:
        console.print(f"[error]Error:[/error] Failed to fetch provider. {_extract_error_detail(response)}")
        raise typer.Exit(1)


@app.command("update")
def command_provider_update(
    provider_id: str = typer.Argument(..., help="Provider ID"),
    name: str = typer.Option(None, "--name", help="New provider name"),
    config: str = typer.Option(None, "--config", help="Config fields as JSON string (merged with existing)"),
    credentials_file: str = typer.Option(
        None,
        "--credentials-file",
        help=(
            "Path to a JSON file containing provider secrets. Keeps secrets out of argv. "
            "Shape depends on the provider's type: for aws, "
            '{"aws_access_key_id": "...", "aws_secret_access_key": "..."} (uploaded via the '
            "dedicated credentials endpoint; any remaining keys merge into the config patch); "
            "for gcp, the raw service account JSON key file (uploaded via the dedicated "
            "credentials endpoint); for everything else, a flat object merged into the config "
            "patch (file values take precedence over --config)."
        ),
    ),
    disabled: bool = typer.Option(None, "--disabled/--enabled", help="Disable or enable the provider"),
    is_default: bool = typer.Option(
        None,
        "--default/--no-default",
        help="Mark this provider as the team default (used when a task does not specify one)",
    ),
):
    """Update a compute provider."""
    check_configs(output_format=cli_state.output_format)

    payload: dict = {}
    if name is not None:
        payload["name"] = name
    config_patch: dict | None = None
    if config is not None:
        try:
            config_patch = json.loads(config)
        except json.JSONDecodeError as e:
            console.print(f"[error]Error:[/error] Invalid JSON in --config: {e}")
            raise typer.Exit(1)

    # For aws/gcp, --credentials-file routes to dedicated endpoints rather than into config.
    # We need the provider's type to branch correctly, so fetch it up front when credentials
    # are supplied.
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    gcp_service_account_json: str | None = None
    provider_type: str | None = None
    if credentials_file is not None:
        with console.status(f"[bold success]Fetching provider {provider_id}...[/bold success]", spinner="dots"):
            get_response = api.get(f"/compute_provider/providers/{provider_id}")
        if get_response.status_code == 404:
            console.print(f"[error]Error:[/error] Provider {provider_id} not found.")
            raise typer.Exit(1)
        if get_response.status_code != 200:
            console.print(f"[error]Error:[/error] Failed to fetch provider. {_extract_error_detail(get_response)}")
            raise typer.Exit(1)
        provider_type = get_response.json().get("type")

        if provider_type == "gcp":
            gcp_service_account_json = _read_service_account_file(credentials_file)
        else:
            creds = _read_credentials_file(credentials_file)
            if provider_type == "aws":
                aws_access_key_id = str(creds.pop("aws_access_key_id", "") or "")
                aws_secret_access_key = str(creds.pop("aws_secret_access_key", "") or "")
                if bool(aws_access_key_id) != bool(aws_secret_access_key):
                    console.print(
                        "[error]Error:[/error] --credentials-file for an aws provider must contain both "
                        "'aws_access_key_id' and 'aws_secret_access_key' (or neither)."
                    )
                    raise typer.Exit(1)
            if creds:
                if config_patch is None:
                    config_patch = {}
                config_patch.update(creds)

    if config_patch is not None:
        payload["config"] = config_patch
    if disabled is not None:
        payload["disabled"] = disabled
    if is_default is not None:
        payload["is_default"] = is_default

    has_dedicated_credentials = bool(aws_access_key_id and aws_secret_access_key) or bool(gcp_service_account_json)
    if not payload and not has_dedicated_credentials:
        console.print(
            "[warning]Nothing to update.[/warning] "
            "Provide at least one of --name, --config, --credentials-file, "
            "--disabled/--enabled, --default/--no-default."
        )
        raise typer.Exit(0)

    if payload:
        with console.status(f"[bold success]Updating provider {provider_id}...[/bold success]", spinner="dots"):
            response = api.patch(f"/compute_provider/providers/{provider_id}", json_data=payload)

        if response.status_code == 404:
            console.print(f"[error]Error:[/error] Provider {provider_id} not found.")
            raise typer.Exit(1)
        elif response.status_code != 200:
            console.print(f"[error]Error:[/error] Failed to update provider. {_extract_error_detail(response)}")
            raise typer.Exit(1)

    if provider_type == "aws" and aws_access_key_id and aws_secret_access_key:
        _upload_aws_credentials(provider_id, aws_access_key_id, aws_secret_access_key)
    if provider_type == "gcp" and gcp_service_account_json:
        _upload_gcp_service_account(provider_id, gcp_service_account_json)

    console.print(f"[success]✓[/success] Provider [bold]{provider_id}[/bold] updated.")


@app.command("delete")
def command_provider_delete(
    provider_id: str = typer.Argument(..., help="Provider ID to delete"),
    no_interactive: bool = typer.Option(False, "--no-interactive", help="Skip confirmation prompt"),
):
    """Delete a compute provider."""
    check_configs(output_format=cli_state.output_format)

    if not no_interactive:
        typer.confirm(f"Delete provider {provider_id}?", abort=True)

    with console.status(f"[bold success]Deleting provider {provider_id}...[/bold success]", spinner="dots"):
        response = api.delete(f"/compute_provider/providers/{provider_id}")

    if response.status_code == 200:
        console.print(f"[success]✓[/success] Provider [bold]{provider_id}[/bold] deleted.")
    elif response.status_code == 404:
        console.print(f"[error]Error:[/error] Provider {provider_id} not found.")
        raise typer.Exit(1)
    else:
        console.print(f"[error]Error:[/error] Failed to delete provider. {_extract_error_detail(response)}")
        raise typer.Exit(1)


@app.command("check")
def command_provider_check(
    provider_id: str = typer.Argument(..., help="Provider ID to check"),
):
    """Check connectivity and health of a compute provider."""
    check_configs(output_format=cli_state.output_format)

    with console.status(f"[bold success]Checking provider {provider_id}...[/bold success]", spinner="dots"):
        response = api.get(f"/compute_provider/providers/{provider_id}/check", timeout=60.0)

    if response.status_code == 200:
        result = response.json()
        if result.get("status") is True:
            render_object(result, format_type=cli_state.output_format)
            return

        reason = _extract_provider_check_reason(result)
        if cli_state.output_format == "json":
            print(json.dumps({"status": False, "reason": reason}))
        else:
            console.print(f"[error]Error:[/error] Provider check failed. {reason}")
        raise typer.Exit(1)
    elif response.status_code == 404:
        console.print(f"[error]Error:[/error] Provider {provider_id} not found.")
        raise typer.Exit(1)
    else:
        console.print(f"[error]Error:[/error] Health check failed. {_extract_error_detail(response)}")
        raise typer.Exit(1)


@app.command("enable")
def command_provider_enable(
    provider_id: str = typer.Argument(..., help="Provider ID to enable"),
):
    """Enable a compute provider."""
    check_configs(output_format=cli_state.output_format)

    with console.status(f"[bold success]Enabling provider {provider_id}...[/bold success]", spinner="dots"):
        response = api.patch(f"/compute_provider/providers/{provider_id}", json_data={"disabled": False})

    if response.status_code == 200:
        console.print(f"[success]✓[/success] Provider [bold]{provider_id}[/bold] enabled.")
    elif response.status_code == 404:
        console.print(f"[error]Error:[/error] Provider {provider_id} not found.")
        raise typer.Exit(1)
    else:
        console.print(f"[error]Error:[/error] Failed to enable provider. {_extract_error_detail(response)}")
        raise typer.Exit(1)


@app.command("disable")
def command_provider_disable(
    provider_id: str = typer.Argument(..., help="Provider ID to disable"),
):
    """Disable a compute provider."""
    check_configs(output_format=cli_state.output_format)

    with console.status(f"[bold success]Disabling provider {provider_id}...[/bold success]", spinner="dots"):
        response = api.patch(f"/compute_provider/providers/{provider_id}", json_data={"disabled": True})

    if response.status_code == 200:
        console.print(f"[success]✓[/success] Provider [bold]{provider_id}[/bold] disabled.")
    elif response.status_code == 404:
        console.print(f"[error]Error:[/error] Provider {provider_id} not found.")
        raise typer.Exit(1)
    else:
        console.print(f"[error]Error:[/error] Failed to disable provider. {_extract_error_detail(response)}")
        raise typer.Exit(1)


@app.command("set-default")
def command_provider_set_default(
    provider_id: str = typer.Argument(..., help="Provider ID to mark as the team's default"),
):
    """Mark a compute provider as the team default.

    The default provider is used when a task is dispatched without specifying one.
    Marking a provider as default automatically clears the flag from any other
    provider in the team.
    """
    check_configs(output_format=cli_state.output_format)

    with console.status(f"[bold success]Setting provider {provider_id} as default...[/bold success]", spinner="dots"):
        response = api.patch(f"/compute_provider/providers/{provider_id}", json_data={"is_default": True})

    if response.status_code == 200:
        console.print(f"[success]✓[/success] Provider [bold]{provider_id}[/bold] is now the team default.")
    elif response.status_code == 404:
        console.print(f"[error]Error:[/error] Provider {provider_id} not found.")
        raise typer.Exit(1)
    else:
        console.print(f"[error]Error:[/error] Failed to set default provider. {_extract_error_detail(response)}")
        raise typer.Exit(1)


@app.command("clear-default")
def command_provider_clear_default(
    provider_id: str = typer.Argument(..., help="Provider ID to clear default flag from"),
):
    """Clear the default flag on a compute provider.

    With no default set, dispatch falls back to the first available provider.
    """
    check_configs(output_format=cli_state.output_format)

    with console.status(
        f"[bold success]Clearing default flag on provider {provider_id}...[/bold success]", spinner="dots"
    ):
        response = api.patch(f"/compute_provider/providers/{provider_id}", json_data={"is_default": False})

    if response.status_code == 200:
        console.print(f"[success]✓[/success] Provider [bold]{provider_id}[/bold] is no longer the default.")
    elif response.status_code == 404:
        console.print(f"[error]Error:[/error] Provider {provider_id} not found.")
        raise typer.Exit(1)
    else:
        console.print(f"[error]Error:[/error] Failed to clear default provider. {_extract_error_detail(response)}")
        raise typer.Exit(1)
