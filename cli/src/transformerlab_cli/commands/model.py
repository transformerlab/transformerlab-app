import json
import os

import typer
from rich.progress import BarColumn, MofNCompleteColumn, Progress, TextColumn

import transformerlab_cli.util.api as api
from transformerlab_cli.state import cli_state
from transformerlab_cli.util.config import check_configs
from transformerlab_cli.util.ui import console, render_table, render_object
from transformerlab_cli.util import asset_paths, chunked_download, chunked_upload

app = typer.Typer()


def _extract_error(response) -> str:
    try:
        return response.json().get("detail", response.text)
    except Exception:
        return response.text


# ──────────────────────────────────────────────
# list
# ──────────────────────────────────────────────


@app.command("list")
def command_model_list():
    """List all model groups on the server."""
    check_configs(output_format=cli_state.output_format)

    endpoint = "/asset_versions/groups?asset_type=model"
    if cli_state.output_format != "json":
        with console.status("[bold success]Fetching models...[/bold success]", spinner="dots"):
            response = api.get(endpoint)
    else:
        response = api.get(endpoint)

    if response.status_code == 200:
        models = response.json()
        table_columns = ["group_id", "group_name", "latest_version_label", "version_count", "tags"]
        render_table(data=models, format_type=cli_state.output_format, table_columns=table_columns, title="Models")
    else:
        if cli_state.output_format == "json":
            print(json.dumps({"error": f"Failed to fetch models. Status code: {response.status_code}"}))
            raise typer.Exit(1)
        console.print(f"[error]Error:[/error] Failed to fetch models. Status code: {response.status_code}")
        raise typer.Exit(1)


# ──────────────────────────────────────────────
# info
# ──────────────────────────────────────────────


@app.command("info")
def command_model_info(
    group_id: str = typer.Argument(..., help="The model group_id or group_name to inspect"),
):
    """Show detailed information about a specific model group."""
    check_configs(output_format=cli_state.output_format)

    endpoint = "/asset_versions/groups?asset_type=model"
    if cli_state.output_format != "json":
        with console.status("[bold success]Fetching model info...[/bold success]", spinner="dots"):
            response = api.get(endpoint)
    else:
        response = api.get(endpoint)

    if response.status_code != 200:
        if cli_state.output_format == "json":
            print(json.dumps({"error": f"Failed to fetch models. Status code: {response.status_code}"}))
            raise typer.Exit(1)
        console.print(f"[error]Error:[/error] Failed to fetch models. {_extract_error(response)}")
        raise typer.Exit(1)

    models = response.json()
    model = next(
        (m for m in models if m.get("group_id") == group_id or m.get("group_name") == group_id),
        None,
    )

    if model is None:
        if cli_state.output_format == "json":
            print(json.dumps({"error": f"Model '{group_id}' not found."}))
        else:
            console.print(f"[error]Error:[/error] Model [bold]{group_id}[/bold] not found.")
        raise typer.Exit(1)

    if cli_state.output_format == "json":
        print(json.dumps(model, indent=2, default=str))
    else:
        render_object(model)


# ──────────────────────────────────────────────
# delete
# ──────────────────────────────────────────────


@app.command("delete")
def command_model_delete(
    group_id: str = typer.Argument(..., help="The model group_id to delete"),
    yes: bool = typer.Option(False, "--yes", "-y", help="Skip confirmation prompt"),
):
    """Delete a model group and all its versions."""
    check_configs(output_format=cli_state.output_format)

    if not yes and cli_state.output_format != "json":
        confirmed = typer.confirm(
            f"Are you sure you want to delete model group '{group_id}' and ALL its versions?", default=False
        )
        if not confirmed:
            console.print("[warning]Aborted.[/warning]")
            raise typer.Exit(0)

    if cli_state.output_format != "json":
        with console.status(f"[bold success]Deleting model group '{group_id}'...[/bold success]", spinner="dots"):
            response = api.delete(f"/asset_versions/groups/model/{group_id}")
    else:
        response = api.delete(f"/asset_versions/groups/model/{group_id}")

    if response.status_code == 200:
        body = response.json()
        if cli_state.output_format == "json":
            print(json.dumps(body))
        else:
            count = body.get("deleted_count", "?")
            console.print(
                f"[success]✓[/success] Model group [bold]{group_id}[/bold] deleted ({count} version(s) removed)."
            )
    else:
        if cli_state.output_format == "json":
            print(json.dumps({"error": f"Failed to delete model. Status code: {response.status_code}"}))
            raise typer.Exit(1)
        console.print(f"[error]Error:[/error] Failed to delete model. {_extract_error(response)}")
        raise typer.Exit(1)


# ──────────────────────────────────────────────
# edit
# ──────────────────────────────────────────────


@app.command("edit")
def command_model_edit(
    group_id: str = typer.Argument(..., help="The model group_id to update"),
    name: str = typer.Option(None, "--name", help="New display name for the model group"),
    description: str = typer.Option(None, "--description", help="New description for the model group"),
):
    """Edit the name or description of a model group."""
    check_configs(output_format=cli_state.output_format)

    payload: dict = {}
    if name:
        payload["name"] = name
    if description:
        payload["description"] = description

    if not payload:
        console.print("[warning]Nothing to update. Provide --name and/or --description.[/warning]")
        raise typer.Exit(0)

    if cli_state.output_format != "json":
        with console.status(f"[bold success]Updating model group '{group_id}'...[/bold success]", spinner="dots"):
            response = api.patch(f"/asset_versions/groups/model/{group_id}", json_data=payload)
    else:
        response = api.patch(f"/asset_versions/groups/model/{group_id}", json_data=payload)

    if response.status_code == 200:
        body = response.json()
        if cli_state.output_format == "json":
            print(json.dumps(body, indent=2, default=str))
        else:
            console.print(f"[success]✓[/success] Model group [bold]{group_id}[/bold] updated.")
    else:
        if cli_state.output_format == "json":
            print(json.dumps({"error": f"Failed to update model. Status code: {response.status_code}"}))
            raise typer.Exit(1)
        console.print(f"[error]Error:[/error] Failed to update model. {_extract_error(response)}")
        raise typer.Exit(1)


# ──────────────────────────────────────────────
# create  (register a new model group + first version)
# ──────────────────────────────────────────────


@app.command("create")
def command_model_create(
    asset_id: str = typer.Argument(..., help="The underlying asset/model ID (e.g. a HuggingFace model ID)"),
    group_name: str = typer.Option(..., "--name", help="Display name for the new model group"),
    description: str = typer.Option(None, "--description", help="Optional description"),
    tag: str = typer.Option("latest", "--tag", help="Tag to apply to this version (default: latest)"),
):
    """Create a new model group and register its first version (version label is auto-generated)."""
    check_configs(output_format=cli_state.output_format)

    payload = {
        "asset_type": "model",
        "group_name": group_name,
        "asset_id": asset_id,
        "tag": tag,
    }
    if description:
        payload["description"] = description

    if cli_state.output_format != "json":
        with console.status(f"[bold success]Creating model group '{group_name}'...[/bold success]", spinner="dots"):
            response = api.post_json("/asset_versions/versions", json_data=payload)
    else:
        response = api.post_json("/asset_versions/versions", json_data=payload)

    if response.status_code == 200:
        body = response.json()
        if cli_state.output_format == "json":
            print(json.dumps(body, indent=2, default=str))
        else:
            version_label = body.get("version_label", "v?")
            console.print(
                f"[success]✓[/success] Model group [bold]{group_name}[/bold] created "
                f"(group_id: {body.get('group_id', '?')}, version: {version_label})."
            )
    else:
        if cli_state.output_format == "json":
            print(json.dumps({"error": f"Failed to create model. Status code: {response.status_code}"}))
            raise typer.Exit(1)
        console.print(f"[error]Error:[/error] Failed to create model. {_extract_error(response)}")
        raise typer.Exit(1)


# ──────────────────────────────────────────────
# upload
# ──────────────────────────────────────────────


@app.command("upload")
def command_model_upload(
    model_id: str = typer.Argument(..., help="The model ID. Created if it does not exist."),
    paths: list[str] = typer.Argument(..., help="One or more files or directories to upload."),
    force: bool = typer.Option(False, "--force", "-f", help="Overwrite existing server-side files."),
):
    """Upload local files/directories to a model on the server."""
    check_configs(output_format=cli_state.output_format)

    try:
        pairs = list(asset_paths.walk_inputs(paths))
    except FileNotFoundError as exc:
        console.print(f"[error]Error:[/error] path not found: {exc}")
        raise typer.Exit(1)
    if not pairs:
        console.print("[warning]No files to upload (all paths are empty/hidden/symlinks).[/warning]")
        raise typer.Exit(1)

    skipped: list[str] = []
    failed: list[str] = []
    with Progress(
        TextColumn("[bold success]{task.description}"),
        BarColumn(),
        MofNCompleteColumn(),
        console=console,
    ) as progress:
        outer = progress.add_task("Uploading", total=len(pairs))
        for local_path, relpath in pairs:
            progress.update(outer, description=f"Uploading {relpath}")
            try:
                upload_id = chunked_upload.upload_one_file(local_path)
            except Exception as exc:
                console.print(f"[error]Error uploading {relpath}: {exc}")
                failed.append(relpath)
                progress.advance(outer)
                continue
            qs = f"model_id={model_id}&upload_id={upload_id}&relpath={relpath}&force={'true' if force else 'false'}"
            resp = api.post_json(f"/model/fileupload?{qs}", json_data={})
            if resp.status_code == 409:
                console.print(f"[warning]Skipped (already exists):[/warning] {relpath}")
                skipped.append(relpath)
            elif resp.status_code != 200:
                console.print(f"[error]Error uploading {relpath}: {_extract_error(resp)}")
                failed.append(relpath)
            progress.advance(outer)

    if not failed:
        finalize_resp = api.post_json(f"/model/finalize?model_id={model_id}", json_data={})
        if finalize_resp.status_code == 200:
            arch = finalize_resp.json().get("architecture", "?")
            console.print(f"[success]✓[/success] Model [bold]{model_id}[/bold] finalized (architecture: {arch}).")
        elif finalize_resp.status_code == 400:
            console.print(f"[warning]Model uploaded but not finalized:[/warning] {_extract_error(finalize_resp)}")

    if failed:
        raise typer.Exit(1)
    if skipped:
        raise typer.Exit(2)


# ──────────────────────────────────────────────
# download
# ──────────────────────────────────────────────


@app.command("download")
def command_model_download(
    model_id: str = typer.Argument(..., help="The model ID on the server."),
    dest_dir: str = typer.Argument(..., help="Local destination directory (will be created)."),
):
    """Download a model from the server to local disk under <dest>/<model_id>/."""
    check_configs(output_format=cli_state.output_format)

    list_resp = api.get(f"/model/files?model_id={model_id}")
    if list_resp.status_code != 200:
        console.print(f"[error]Error:[/error] {_extract_error(list_resp)}")
        raise typer.Exit(1)
    files = list_resp.json()
    if not files:
        console.print("[warning]Model has no files to download.[/warning]")
        return

    base = os.path.join(dest_dir, model_id)
    os.makedirs(base, exist_ok=True)
    total_bytes = sum(f["size"] for f in files)

    with Progress(
        TextColumn("[bold success]{task.description}"),
        BarColumn(),
        MofNCompleteColumn(),
        console=console,
    ) as progress:
        bar = progress.add_task(f"Downloading {model_id}", total=total_bytes)
        for f in files:
            relpath = f["relpath"]
            size = f["size"]
            target = os.path.join(base, *relpath.split("/"))
            try:
                chunked_download.download_one_file(
                    f"/model/file?model_id={model_id}&relpath={relpath}",
                    target_path=target,
                    server_size=size,
                    progress=progress,
                    progress_task=bar,
                )
            except Exception as exc:
                console.print(f"[error]Failed to download {relpath}: {exc}")
                raise typer.Exit(1)

    console.print(f"[success]✓[/success] Downloaded {len(files)} file(s) to {base}.")
