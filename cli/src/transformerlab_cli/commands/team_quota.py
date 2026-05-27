"""Team quota management commands (`lab team quota`)."""

import json

import typer

import transformerlab_cli.util.api as api
from transformerlab_cli.commands.team_members import _extract_error_detail, _resolve_user
from transformerlab_cli.state import cli_state
from transformerlab_cli.util.config import check_configs, get_config
from transformerlab_cli.util.ui import console, exit_with_no_results, render_table

app = typer.Typer()


def _fmt_minutes(minutes) -> str:
    """Render a minute count as 'N min (Hh Mm)' for pretty output."""
    try:
        total = int(round(float(minutes)))
    except (ValueError, TypeError):
        return str(minutes)
    hours, mins = divmod(total, 60)
    return f"{total} min ({hours}h {mins}m)"


@app.command("show")
def command_quota_show():
    """Show the current team's quota configuration."""
    check_configs(output_format=cli_state.output_format)
    team_id = get_config("team_id")

    with console.status("[bold success]Fetching team quota...[/bold success]", spinner="dots"):
        response = api.get(f"/quota/team/{team_id}")

    if response.status_code != 200:
        console.print(f"[error]Error:[/error] Failed to fetch team quota. {_extract_error_detail(response)}")
        raise typer.Exit(1)

    data = response.json()
    if cli_state.output_format == "json":
        print(json.dumps(data))
        return

    console.print("\n[bold label]Team Quota[/bold label]")
    console.print(f"  Team:          [bold]{data.get('team_id')}[/bold]")
    console.print(f"  Monthly quota: {_fmt_minutes(data.get('monthly_quota_minutes', 0))}")
    console.print(f"  Period start:  {data.get('current_period_start', 'N/A')}")


@app.command("set")
def command_quota_set(
    minutes: int = typer.Argument(..., help="Monthly quota in minutes (>= 0)"),
):
    """Set the current team's monthly quota (minutes). Team owners only."""
    check_configs(output_format=cli_state.output_format)
    if minutes < 0:
        console.print("[error]Error:[/error] minutes must be >= 0")
        raise typer.Exit(1)
    team_id = get_config("team_id")

    with console.status("[bold success]Updating team quota...[/bold success]", spinner="dots"):
        response = api.patch(f"/quota/team/{team_id}", json_data={"monthly_quota_minutes": minutes})

    if response.status_code != 200:
        console.print(f"[error]Error:[/error] Failed to update team quota. {_extract_error_detail(response)}")
        raise typer.Exit(1)

    if cli_state.output_format == "json":
        print(json.dumps(response.json()))
    else:
        console.print(f"[success]✓[/success] Team monthly quota set to {_fmt_minutes(minutes)}.")


@app.command("usage")
def command_quota_usage():
    """Show per-user quota usage for the current team. Team owners only."""
    check_configs(output_format=cli_state.output_format)
    format_type = cli_state.output_format
    team_id = get_config("team_id")

    with console.status("[bold success]Fetching quota usage...[/bold success]", spinner="dots"):
        response = api.get(f"/quota/team/{team_id}/users")

    if response.status_code != 200:
        console.print(f"[error]Error:[/error] Failed to fetch quota usage. {_extract_error_detail(response)}")
        raise typer.Exit(1)

    users = response.json()
    if not users:
        exit_with_no_results(format_type, "No quota usage found")

    if format_type == "json":
        print(json.dumps(users))
        return

    render_table(
        data=users,
        format_type=format_type,
        table_columns=["email", "total_quota", "used_quota", "available_quota", "overused_quota"],
        title="Quota Usage (minutes)",
    )


@app.command("set-user")
def command_quota_set_user(
    user: str = typer.Argument(..., help="Email or user UUID to override"),
    minutes: int = typer.Argument(..., help="Additional minutes beyond the team quota (>= 0)"),
):
    """Set a per-user quota override (extra minutes beyond team quota). Team owners only."""
    check_configs(output_format=cli_state.output_format)
    if minutes < 0:
        console.print("[error]Error:[/error] minutes must be >= 0")
        raise typer.Exit(1)
    team_id = get_config("team_id")
    user_id = _resolve_user(team_id, user)

    with console.status("[bold success]Updating user quota override...[/bold success]", spinner="dots"):
        response = api.patch(f"/quota/user/{user_id}/team/{team_id}", json_data={"monthly_quota_minutes": minutes})

    if response.status_code != 200:
        console.print(f"[error]Error:[/error] Failed to update user quota. {_extract_error_detail(response)}")
        raise typer.Exit(1)

    if cli_state.output_format == "json":
        print(json.dumps(response.json()))
    else:
        console.print(f"[success]✓[/success] Set override for [bold]{user}[/bold] to {_fmt_minutes(minutes)}.")


@app.command("me")
def command_quota_me():
    """Show your own quota status in the current team."""
    check_configs(output_format=cli_state.output_format)

    with console.status("[bold success]Fetching your quota...[/bold success]", spinner="dots"):
        response = api.get("/quota/me")

    if response.status_code != 200:
        console.print(f"[error]Error:[/error] Failed to fetch quota. {_extract_error_detail(response)}")
        raise typer.Exit(1)

    data = response.json()
    if cli_state.output_format == "json":
        print(json.dumps(data))
        return

    console.print("\n[bold label]My Quota[/bold label]")
    for key in ("total_quota", "team_quota", "user_override", "used_quota", "held_quota", "available_quota"):
        if key in data:
            console.print(f"  {key.replace('_', ' ').title():16} {_fmt_minutes(data[key])}")
