import json

import typer

import transformerlab_cli.util.api as api
from transformerlab_cli.state import cli_state
from transformerlab_cli.util.config import check_configs, get_config
from transformerlab_cli.util.ui import console, exit_with_no_results, render_table

app = typer.Typer()

SPECIAL_SECRET_KEYS = {
    "_GITHUB_PAT_TOKEN": "GitHub Personal Access Token",
    "_HF_TOKEN": "HuggingFace Token",
    "_WANDB_API_KEY": "Weights & Biases API Key",
    "_NGROK_AUTH_TOKEN": "ngrok Auth Token",
}


def _extract_error_detail(response) -> str:
    """Extract error detail from an API response."""
    try:
        return response.json().get("detail", response.text)
    except (ValueError, KeyError):
        return response.text


def _get_secrets_path(user: bool) -> str:
    if user:
        return "/users/me/secrets"
    team_id = get_config("team_id")
    return f"/teams/{team_id}/secrets"


def _get_special_secrets_path(user: bool) -> str:
    if user:
        return "/users/me/special_secrets"
    team_id = get_config("team_id")
    return f"/teams/{team_id}/special_secrets"


def _prompt_special_secret_key() -> str:
    """Show a menu of platform secret keys by friendly description and return the chosen raw key.

    The last option is a custom key, which prompts for an arbitrary key name.
    """
    items = list(SPECIAL_SECRET_KEYS.items())  # [(raw_key, description), ...]
    console.print("\n[bold label]Select a secret to set:[/bold label]")
    for i, (raw_key, description) in enumerate(items, 1):
        console.print(f"  [bold]{i}[/bold]. {description} [muted]({raw_key})[/muted]")
    custom_idx = len(items) + 1
    console.print(f"  [bold]{custom_idx}[/bold]. Custom key…")

    while True:
        choice = typer.prompt("\nSelect a key", default="1")
        try:
            idx = int(choice)
        except ValueError:
            console.print("[error]Please enter a valid number[/error]")
            continue
        if 1 <= idx <= len(items):
            return items[idx - 1][0]
        if idx == custom_idx:
            while True:
                custom = typer.prompt("Custom key name").strip()
                if custom:
                    return custom
                console.print("[error]A key name is required[/error]")
        console.print(f"[error]Please enter a number between 1 and {custom_idx}[/error]")


@app.command("list")
def command_secret_list(
    user: bool = typer.Option(False, "--user", "-u", help="List user-level secrets instead of team secrets"),
    show_values: bool = typer.Option(False, "--show-values", help="Show actual secret values (owner only for team)"),
):
    """List secrets."""
    check_configs(output_format=cli_state.output_format)
    format_type = cli_state.output_format

    path = _get_secrets_path(user)
    params = f"?include_values={'true' if show_values else 'false'}"

    with console.status("[bold success]Fetching secrets...[/bold success]", spinner="dots"):
        response = api.get(f"{path}{params}")

    if response.status_code != 200:
        console.print(f"[error]Error:[/error] Failed to fetch secrets. {_extract_error_detail(response)}")
        raise typer.Exit(1)

    data = response.json()
    secrets = data.get("secrets", {})

    if not secrets:
        exit_with_no_results(format_type, "No secrets found")

    rows = [{"name": k, "value": v} for k, v in secrets.items()]
    columns = ["name", "value"] if show_values else ["name"]

    render_table(data=rows, format_type=format_type, table_columns=columns, title="Secrets")


@app.command("keys")
def command_secret_keys():
    """Show platform-recognized secret key names."""
    format_type = cli_state.output_format

    rows = [{"key": k, "description": v} for k, v in SPECIAL_SECRET_KEYS.items()]

    if format_type == "json":
        print(json.dumps(rows))
    else:
        render_table(data=rows, format_type=format_type, table_columns=["key", "description"], title="Platform Keys")


@app.command("set")
def command_secret_set(
    name: str = typer.Argument(None, help="Secret name (omit to choose from a menu interactively)"),
    value: str = typer.Argument(None, help="Secret value (omit to be prompted with hidden input)"),
    user: bool = typer.Option(False, "--user", "-u", help="Set as a user-level secret instead of team secret"),
):
    """Set a secret. Overwrites if the name already exists."""
    if name is None:
        if cli_state.no_interactive:
            console.print("[error]Error:[/error] A secret name is required with --no-interactive/--format json")
            raise typer.Exit(1)

    check_configs(output_format=cli_state.output_format)

    if name is None:
        name = _prompt_special_secret_key()

    if value is None:
        if cli_state.no_interactive:
            console.print("[error]Error:[/error] A secret value is required with --no-interactive/--format json")
            raise typer.Exit(1)
        value = typer.prompt("Value", hide_input=True)

    if name in SPECIAL_SECRET_KEYS:
        path = _get_special_secrets_path(user)
        payload = {"secret_type": name, "value": value}
        with console.status("[bold success]Saving secret...[/bold success]", spinner="dots"):
            response = api.put_json(path, json_data=payload)
    else:
        path = _get_secrets_path(user)
        with console.status("[bold success]Fetching current secrets...[/bold success]", spinner="dots"):
            get_response = api.get(f"{path}?include_values=true")
        if get_response.status_code != 200:
            console.print(f"[error]Error:[/error] Failed to fetch secrets. {_extract_error_detail(get_response)}")
            raise typer.Exit(1)

        secrets = get_response.json().get("secrets", {})
        secrets[name] = value

        with console.status("[bold success]Saving secret...[/bold success]", spinner="dots"):
            response = api.put_json(path, json_data={"secrets": secrets})

    if response.status_code == 200:
        if cli_state.output_format == "json":
            print(json.dumps(response.json()))
        else:
            console.print(f"[success]✓[/success] Secret [bold]{name}[/bold] saved.")
    else:
        console.print(f"[error]Error:[/error] Failed to save secret. {_extract_error_detail(response)}")
        raise typer.Exit(1)


@app.command("delete")
def command_secret_delete(
    name: str = typer.Argument(..., help="Secret name to delete"),
    user: bool = typer.Option(False, "--user", "-u", help="Delete a user-level secret instead of team secret"),
    no_interactive: bool = typer.Option(False, "--no-interactive", help="Skip confirmation prompt"),
):
    """Delete a secret."""
    check_configs(output_format=cli_state.output_format)
    skip_confirm = no_interactive or cli_state.no_interactive

    if name in SPECIAL_SECRET_KEYS:
        if not skip_confirm:
            typer.confirm(f"Delete special secret {name}?", abort=True)
        path = _get_special_secrets_path(user)
        payload = {"secret_type": name, "value": ""}
        with console.status("[bold success]Deleting secret...[/bold success]", spinner="dots"):
            response = api.put_json(path, json_data=payload)
    else:
        path = _get_secrets_path(user)
        with console.status("[bold success]Fetching current secrets...[/bold success]", spinner="dots"):
            get_response = api.get(f"{path}?include_values=true")
        if get_response.status_code != 200:
            console.print(f"[error]Error:[/error] Failed to fetch secrets. {_extract_error_detail(get_response)}")
            raise typer.Exit(1)

        secrets = get_response.json().get("secrets", {})
        if name not in secrets:
            console.print(f"[error]Error:[/error] Secret [bold]{name}[/bold] not found.")
            raise typer.Exit(1)

        if not skip_confirm:
            typer.confirm(f"Delete secret {name}?", abort=True)

        del secrets[name]

        with console.status("[bold success]Saving secrets...[/bold success]", spinner="dots"):
            response = api.put_json(path, json_data={"secrets": secrets})

    if response.status_code == 200:
        if cli_state.output_format == "json":
            print(json.dumps(response.json()))
        else:
            console.print(f"[success]✓[/success] Secret [bold]{name}[/bold] deleted.")
    else:
        console.print(f"[error]Error:[/error] Failed to delete secret. {_extract_error_detail(response)}")
        raise typer.Exit(1)
