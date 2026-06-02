import json

import typer

import transformerlab_cli.util.api as api
from transformerlab_cli.commands.provider import (
    _extract_error_detail,
    _extract_provider_check_reason,
    create_provider_interactively,
)
from transformerlab_cli.commands.secret import (
    SPECIAL_SECRET_KEYS,
    _get_secrets_path,
    _get_special_secrets_path,
    _prompt_special_secret_key,
    app as secret_app,
)
from transformerlab_cli.commands.team_members import (
    _extract_error_detail as _member_error_detail,
    invitations_app,
    members_app,
)
from transformerlab_cli.commands.team_quota import app as quota_app
from transformerlab_cli.state import cli_state
from transformerlab_cli.util.auth import fetch_user_teams, get_api_key
from transformerlab_cli.util.config import check_configs, get_config
from transformerlab_cli.util.ui import console

app = typer.Typer()


def _save_secret(name: str, value: str) -> None:
    """Save one secret (team-level), routing special keys to the special_secrets endpoint."""
    if name in SPECIAL_SECRET_KEYS:
        response = api.put_json(_get_special_secrets_path(False), json_data={"secret_type": name, "value": value})
    else:
        path = _get_secrets_path(False)
        get_response = api.get(f"{path}?include_values=true")
        if get_response.status_code != 200:
            console.print(
                f"[error]Error:[/error] Failed to fetch current secrets. {_extract_error_detail(get_response)}"
            )
            raise typer.Exit(1)
        # Exclude special secrets: they share this file but are rejected by the
        # regular secrets endpoint and are managed via the special secrets path.
        secrets = {k: v for k, v in get_response.json().get("secrets", {}).items() if k not in SPECIAL_SECRET_KEYS}
        secrets[name] = value
        response = api.put_json(path, json_data={"secrets": secrets})
    if response.status_code != 200:
        console.print(f"[error]Error:[/error] Failed to save secret {name}. {_extract_error_detail(response)}")
        raise typer.Exit(1)


def _run_check(provider_id: str) -> dict:
    """Run the provider health check and return {"ok": bool, "reason": str | None}."""
    response = api.get(f"/compute_provider/providers/{provider_id}/check", timeout=60.0)
    if response.status_code == 200 and response.json().get("status") is True:
        return {"ok": True, "reason": None}
    if response.status_code == 200:
        return {"ok": False, "reason": _extract_provider_check_reason(response.json())}
    return {"ok": False, "reason": _extract_error_detail(response)}


setup_app = typer.Typer(invoke_without_command=True)


@setup_app.callback()
def command_team_setup(
    ctx: typer.Context,
    name: str = typer.Option(None, "--name", help="Provider name"),
    provider_type: str = typer.Option(None, "--type", help="Provider type"),
    config: str = typer.Option(None, "--config", help="Provider config as JSON string"),
    credentials_file: str = typer.Option(None, "--credentials-file", help="Path to provider credentials JSON file"),
    set_default: bool = typer.Option(
        None, "--set-default/--no-set-default", help="Mark the new provider as the team default"
    ),
    secret: list[str] = typer.Option(
        None, "--secret", help="Secret as KEY=VALUE (repeatable). Used in non-interactive mode."
    ),
    check: bool = typer.Option(None, "--check/--no-check", help="Run the provider health check at the end"),
):
    """Onboarding wizard: add a provider, set defaults and secrets, and verify connectivity.

    Run with no flags for the interactive wizard. In non-interactive mode (--no-interactive or
    --format json) all input comes from flags.
    """
    if ctx.invoked_subcommand is not None:
        return

    check_configs(output_format=cli_state.output_format)
    interactive = not cli_state.no_interactive

    # Step 1: create the provider.
    provider_id = create_provider_interactively(
        name=name,
        provider_type=provider_type,
        config=config,
        interactive=interactive,
        credentials_file=credentials_file,
    )

    # Step 2: set as team default.
    if set_default is None:
        default_set = typer.confirm("Set this provider as the team default?", default=True) if interactive else False
    else:
        default_set = set_default
    if default_set:
        response = api.patch(f"/compute_provider/providers/{provider_id}", json_data={"is_default": True})
        if response.status_code != 200:
            console.print(f"[error]Error:[/error] Failed to set provider as default. {_extract_error_detail(response)}")
            raise typer.Exit(1)

    # Step 3: set platform secrets.
    secrets_set: list[str] = []
    if interactive:
        while typer.confirm(
            "Set another platform secret?" if secrets_set else "Set a platform secret now?",
            default=False,
        ):
            key = _prompt_special_secret_key()
            value = typer.prompt("Value", hide_input=True)
            _save_secret(key, value)
            secrets_set.append(key)
    else:
        for item in secret or []:
            if "=" not in item:
                console.print(f"[error]Error:[/error] --secret must be KEY=VALUE, got '{item}'")
                raise typer.Exit(1)
            key, value = item.split("=", 1)
            _save_secret(key, value)
            secrets_set.append(key)

    # Step 4: run the health check.
    if check is None:
        run = typer.confirm("Run a provider health check now?", default=True) if interactive else False
    else:
        run = check
    check_result = _run_check(provider_id) if run else None

    summary = {
        "provider_id": provider_id,
        "default_set": default_set,
        "secrets_set": secrets_set,
        "check": check_result,
    }

    if cli_state.output_format == "json":
        print(json.dumps(summary))
        return

    console.print("\n[bold success]Team setup complete.[/bold success]")
    console.print(f"  Provider: [bold]{provider_id}[/bold]")
    console.print(f"  Default:  {'yes' if default_set else 'no'}")
    console.print(f"  Secrets:  {', '.join(secrets_set) if secrets_set else 'none'}")
    if check_result is not None:
        status = (
            "[success]passed[/success]" if check_result["ok"] else f"[error]failed[/error] ({check_result['reason']})"
        )
        console.print(f"  Check:    {status}")


@app.command("info")
def command_team_info():
    """Show the current team: name, your role, member count, and quota."""
    check_configs(output_format=cli_state.output_format)
    team_id = get_config("team_id")

    teams_info = fetch_user_teams(get_api_key()) or {}
    teams = teams_info.get("teams", [])
    current = next((t for t in teams if t.get("id") == team_id), None)

    member_count = None
    members_response = api.get(f"/teams/{team_id}/members")
    if members_response.status_code == 200:
        member_count = len(members_response.json().get("members", []))

    monthly_quota = None
    quota_response = api.get(f"/quota/team/{team_id}")
    if quota_response.status_code == 200:
        monthly_quota = quota_response.json().get("monthly_quota_minutes")

    info = {
        "team_id": team_id,
        "name": current.get("name") if current else None,
        "role": current.get("role") if current else None,
        "member_count": member_count,
        "monthly_quota_minutes": monthly_quota,
    }

    if cli_state.output_format == "json":
        print(json.dumps(info))
        return

    console.print("\n[bold label]Team Info[/bold label]")
    console.print(f"  Name:    [bold]{info['name'] or 'N/A'}[/bold]")
    console.print(f"  Team ID: {info['team_id']}")
    console.print(f"  Role:    {info['role'] or 'N/A'}")
    console.print(f"  Members: {info['member_count'] if info['member_count'] is not None else 'N/A'}")
    if monthly_quota is not None:
        hours, mins = divmod(int(monthly_quota), 60)
        console.print(f"  Quota:   {monthly_quota} min ({hours}h {mins}m)")


@app.command("rename")
def command_team_rename(
    name: str = typer.Argument(..., help="New team name"),
):
    """Rename the current team. Team owners only."""
    check_configs(output_format=cli_state.output_format)
    team_id = get_config("team_id")

    with console.status("[bold success]Renaming team...[/bold success]", spinner="dots"):
        response = api.put_json(f"/teams/{team_id}", json_data={"name": name})

    if response.status_code != 200:
        console.print(f"[error]Error:[/error] Failed to rename team. {_member_error_detail(response)}")
        raise typer.Exit(1)

    if cli_state.output_format == "json":
        print(json.dumps(response.json()))
    else:
        console.print(f"[success]✓[/success] Team renamed to [bold]{name}[/bold].")


app.add_typer(setup_app, name="setup", help="Onboarding wizard for a new team")
app.add_typer(secret_app, name="secret", help="Secret management commands", no_args_is_help=True)
app.add_typer(quota_app, name="quota", help="Team quota management", no_args_is_help=True)
app.add_typer(members_app, name="members", help="Team member management", no_args_is_help=True)
app.add_typer(invitations_app, name="invitations", help="Team invitation management", no_args_is_help=True)
