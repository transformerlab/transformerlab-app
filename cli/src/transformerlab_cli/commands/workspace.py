"""Workspace storage diagnostics (server-side backend configuration)."""

import json

import httpx
import typer
from rich.table import Table

from transformerlab_cli.state import cli_state
from transformerlab_cli.util import api
from transformerlab_cli.util.config import check_configs
from transformerlab_cli.util.ui import console

app = typer.Typer(help="Workspace and storage diagnostics")


@app.command("check")
def workspace_check():
    """
    Ask the server to verify workspace storage for the current team.

    Reports the resolved workspace root, storage provider mode, whether common credential
    env vars are set (not their values), and runs a small read/write probe under the workspace.

    Requires API login (server, team_id, user) so the server can resolve org-scoped paths.
    Remote compute providers (SkyPilot, Slurm) may use different filesystem mounts than the
    API host; this command does not compare those paths yet.
    """
    check_configs(output_format="json" if cli_state.output_format == "json" else "pretty")
    try:
        response = api.get("/server/workspace_storage_check", timeout=60.0)
    except httpx.HTTPError as e:
        if cli_state.output_format == "json":
            print(json.dumps({"error": str(e)}))
        else:
            console.print(f"[error]Error:[/error] Request failed: {e}")
        raise typer.Exit(1) from e

    if response.status_code != 200:
        if cli_state.output_format == "json":
            print(json.dumps({"error": response.text, "status_code": response.status_code}))
        else:
            console.print(f"[error]Error:[/error] {response.status_code}: {response.text}")
        raise typer.Exit(1)

    data = response.json()
    if cli_state.output_format == "json":
        print(json.dumps(data))
        if not data.get("ok"):
            raise typer.Exit(1)
        return

    ok = data.get("ok", False)
    style = "success" if ok else "error"
    console.print(f"[{style}]Workspace storage probe: {'PASS' if ok else 'FAIL'}[/{style}]")

    table = Table(show_header=False, box=None, title="Workspace storage")
    table.add_column("Field", style="label")
    table.add_column("Value", style="value")
    for key in (
        "workspace_dir",
        "storage_root",
        "workspace_is_remote",
        "storage_provider",
        "remote_storage_enabled",
        "tfl_storage_uri_configured",
        "workspace_requires_cloud_credentials",
    ):
        if key in data:
            table.add_row(key, str(data[key]))
    console.print(table)

    skip = data.get("credential_validation_skipped_reason")
    if skip:
        console.print(f"[warning]Credential validation:[/warning] {skip}")

    req_cloud = data.get("workspace_requires_cloud_credentials")
    cred_val = data.get("credential_validation")
    if cred_val:
        title = "Cloud credentials (STS / API check)"
        if not req_cloud:
            title += " (informational if workspace is local)"
        vt = Table(show_header=False, box=None, title=title)
        vt.add_column("Key", style="label")
        vt.add_column("Value", style="value")
        for ck, cv in sorted(cred_val.items(), key=lambda x: x[0]):
            if cv is None or cv == "":
                continue
            vt.add_row(str(ck), str(cv))
        console.print(vt)

    hints = data.get("credential_hints") or {}
    if hints:
        ht = Table(show_header=False, box=None, title="Credential hints (env present, not values)")
        ht.add_column("Key", style="label")
        ht.add_column("Value", style="value")
        for hk, hv in sorted(hints.items()):
            ht.add_row(hk, str(hv))
        console.print(ht)

    probe = data.get("read_write_probe") or {}
    if probe.get("error"):
        console.print(f"[error]Probe error:[/error] {probe['error']}")

    if cred_val and not cred_val.get("ok") and cred_val.get("error"):
        console.print(f"[error]Cloud credentials:[/error] {cred_val['error']}")

    if not ok:
        raise typer.Exit(1)
