"""Team member and invitation management commands (`lab team members`, `lab team invitations`)."""

import json
import uuid

import typer

import transformerlab_cli.util.api as api
from transformerlab_cli.state import cli_state
from transformerlab_cli.util.config import check_configs, get_config
from transformerlab_cli.util.ui import console, exit_with_no_results, render_table

VALID_ROLES = {"member", "owner"}


def _extract_error_detail(response) -> str:
    """Extract error detail from an API response."""
    try:
        return response.json().get("detail", response.text)
    except (ValueError, KeyError):
        return response.text


def _is_uuid(value: str) -> bool:
    try:
        uuid.UUID(str(value))
        return True
    except (ValueError, AttributeError, TypeError):
        return False


def _fetch_members(team_id: str) -> list[dict]:
    """Return the list of member dicts ({user_id, email, role}) for a team."""
    response = api.get(f"/teams/{team_id}/members")
    if response.status_code != 200:
        console.print(f"[error]Error:[/error] Failed to fetch members. {_extract_error_detail(response)}")
        raise typer.Exit(1)
    return response.json().get("members", [])


def _resolve_user(team_id: str, ref: str) -> str:
    """Resolve an email or UUID to a user UUID. UUIDs pass through; emails are looked up."""
    if _is_uuid(ref):
        return ref
    members = _fetch_members(team_id)
    for member in members:
        if member.get("email", "").lower() == ref.lower():
            return member["user_id"]
    console.print(f"[error]Error:[/error] No member found with email [bold]{ref}[/bold] in this team.")
    raise typer.Exit(1)


members_app = typer.Typer()
invitations_app = typer.Typer()


@members_app.command("list")
def command_members_list():
    """List members of the current team."""
    check_configs(output_format=cli_state.output_format)
    format_type = cli_state.output_format
    team_id = get_config("team_id")

    with console.status("[bold success]Fetching members...[/bold success]", spinner="dots"):
        members = _fetch_members(team_id)

    if not members:
        exit_with_no_results(format_type, "No members found")

    render_table(
        data=members,
        format_type=format_type,
        table_columns=["email", "role", "user_id"],
        title="Team Members",
    )


@members_app.command("invite")
def command_members_invite(
    email: str = typer.Argument(..., help="Email address to invite"),
    role: str = typer.Option("member", "--role", help="Role for the invited member: member or owner"),
):
    """Invite a new member to the current team by email."""
    check_configs(output_format=cli_state.output_format)
    if role not in VALID_ROLES:
        console.print(f"[error]Error:[/error] --role must be one of {sorted(VALID_ROLES)}, got '{role}'")
        raise typer.Exit(1)

    team_id = get_config("team_id")
    with console.status("[bold success]Sending invitation...[/bold success]", spinner="dots"):
        response = api.post_json(f"/teams/{team_id}/members", json_data={"email": email, "role": role})

    if response.status_code != 200:
        console.print(f"[error]Error:[/error] Failed to invite member. {_extract_error_detail(response)}")
        raise typer.Exit(1)

    if cli_state.output_format == "json":
        print(json.dumps(response.json()))
    else:
        console.print(f"[success]✓[/success] Invited [bold]{email}[/bold] as [bold]{role}[/bold].")


@members_app.command("remove")
def command_members_remove(
    user: str = typer.Argument(..., help="Email or user UUID of the member to remove"),
    no_interactive: bool = typer.Option(False, "--no-interactive", help="Skip confirmation prompt"),
):
    """Remove a member from the current team."""
    check_configs(output_format=cli_state.output_format)
    skip_confirm = no_interactive or cli_state.no_interactive
    team_id = get_config("team_id")
    user_id = _resolve_user(team_id, user)

    if not skip_confirm:
        typer.confirm(f"Remove member {user} from the team?", abort=True)

    with console.status("[bold success]Removing member...[/bold success]", spinner="dots"):
        response = api.delete(f"/teams/{team_id}/members/{user_id}")

    if response.status_code != 200:
        console.print(f"[error]Error:[/error] Failed to remove member. {_extract_error_detail(response)}")
        raise typer.Exit(1)

    if cli_state.output_format == "json":
        print(json.dumps(response.json()))
    else:
        console.print(f"[success]✓[/success] Removed [bold]{user}[/bold] from the team.")


@members_app.command("set-role")
def command_members_set_role(
    user: str = typer.Argument(..., help="Email or user UUID of the member"),
    role: str = typer.Argument(..., help="New role: member or owner"),
):
    """Change a member's role in the current team."""
    check_configs(output_format=cli_state.output_format)
    if role not in VALID_ROLES:
        console.print(f"[error]Error:[/error] role must be one of {sorted(VALID_ROLES)}, got '{role}'")
        raise typer.Exit(1)

    team_id = get_config("team_id")
    user_id = _resolve_user(team_id, user)

    with console.status("[bold success]Updating role...[/bold success]", spinner="dots"):
        response = api.put_json(f"/teams/{team_id}/members/{user_id}/role", json_data={"role": role})

    if response.status_code != 200:
        console.print(f"[error]Error:[/error] Failed to update role. {_extract_error_detail(response)}")
        raise typer.Exit(1)

    if cli_state.output_format == "json":
        print(json.dumps(response.json()))
    else:
        console.print(f"[success]✓[/success] Set [bold]{user}[/bold] role to [bold]{role}[/bold].")


@invitations_app.command("list")
def command_invitations_list():
    """List pending invitations for the current team."""
    check_configs(output_format=cli_state.output_format)
    format_type = cli_state.output_format
    team_id = get_config("team_id")

    with console.status("[bold success]Fetching invitations...[/bold success]", spinner="dots"):
        response = api.get(f"/teams/{team_id}/invitations")

    if response.status_code != 200:
        console.print(f"[error]Error:[/error] Failed to fetch invitations. {_extract_error_detail(response)}")
        raise typer.Exit(1)

    invitations = response.json().get("invitations", [])
    if not invitations:
        exit_with_no_results(format_type, "No pending invitations")

    render_table(
        data=invitations,
        format_type=format_type,
        table_columns=["id", "email", "role", "status", "invited_by_email", "expires_at"],
        title="Team Invitations",
    )


@invitations_app.command("cancel")
def command_invitations_cancel(
    invitation_id: str = typer.Argument(..., help="Invitation ID to cancel"),
    no_interactive: bool = typer.Option(False, "--no-interactive", help="Skip confirmation prompt"),
):
    """Cancel a pending invitation."""
    check_configs(output_format=cli_state.output_format)
    skip_confirm = no_interactive or cli_state.no_interactive
    team_id = get_config("team_id")

    if not skip_confirm:
        typer.confirm(f"Cancel invitation {invitation_id}?", abort=True)

    with console.status("[bold success]Cancelling invitation...[/bold success]", spinner="dots"):
        response = api.delete(f"/teams/{team_id}/invitations/{invitation_id}")

    if response.status_code != 200:
        console.print(f"[error]Error:[/error] Failed to cancel invitation. {_extract_error_detail(response)}")
        raise typer.Exit(1)

    if cli_state.output_format == "json":
        print(json.dumps(response.json()))
    else:
        console.print(f"[success]✓[/success] Cancelled invitation [bold]{invitation_id}[/bold].")
