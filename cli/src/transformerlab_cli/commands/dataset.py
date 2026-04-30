import json
import os

import typer
from rich.progress import BarColumn, MofNCompleteColumn, Progress, TextColumn

import transformerlab_cli.util.api as api
from transformerlab_cli.state import cli_state
from transformerlab_cli.util.config import check_configs
from transformerlab_cli.util import asset_paths, chunked_download, chunked_upload
from transformerlab_cli.util.ui import console, render_table, render_object

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
def command_dataset_list():
    """List all dataset groups on the server."""
    check_configs(output_format=cli_state.output_format)

    endpoint = "/asset_versions/groups?asset_type=dataset"
    if cli_state.output_format != "json":
        with console.status("[bold success]Fetching datasets...[/bold success]", spinner="dots"):
            response = api.get(endpoint)
    else:
        response = api.get(endpoint)

    if response.status_code == 200:
        datasets = response.json()
        table_columns = ["group_id", "group_name", "latest_version_label", "version_count", "tags"]
        render_table(data=datasets, format_type=cli_state.output_format, table_columns=table_columns, title="Datasets")
    else:
        if cli_state.output_format == "json":
            print(json.dumps({"error": f"Failed to fetch datasets. Status code: {response.status_code}"}))
            raise typer.Exit(1)
        console.print(f"[error]Error:[/error] Failed to fetch datasets. Status code: {response.status_code}")
        raise typer.Exit(1)


# ──────────────────────────────────────────────
# info
# ──────────────────────────────────────────────


@app.command("info")
def command_dataset_info(
    group_id: str = typer.Argument(..., help="The dataset group_id or group_name to inspect"),
):
    """Show detailed information about a specific dataset group."""
    check_configs(output_format=cli_state.output_format)

    endpoint = "/asset_versions/groups?asset_type=dataset"
    if cli_state.output_format != "json":
        with console.status("[bold success]Fetching dataset info...[/bold success]", spinner="dots"):
            response = api.get(endpoint)
    else:
        response = api.get(endpoint)

    if response.status_code != 200:
        if cli_state.output_format == "json":
            print(json.dumps({"error": f"Failed to fetch datasets. Status code: {response.status_code}"}))
            raise typer.Exit(1)
        console.print(f"[error]Error:[/error] Failed to fetch datasets. {_extract_error(response)}")
        raise typer.Exit(1)

    datasets = response.json()
    dataset = next(
        (d for d in datasets if d.get("group_id") == group_id or d.get("group_name") == group_id),
        None,
    )

    if dataset is None:
        if cli_state.output_format == "json":
            print(json.dumps({"error": f"Dataset '{group_id}' not found."}))
        else:
            console.print(f"[error]Error:[/error] Dataset [bold]{group_id}[/bold] not found.")
        raise typer.Exit(1)

    if cli_state.output_format == "json":
        print(json.dumps(dataset, indent=2, default=str))
    else:
        render_object(dataset)


# ──────────────────────────────────────────────
# delete
# ──────────────────────────────────────────────


@app.command("delete")
def command_dataset_delete(
    group_id: str = typer.Argument(..., help="The dataset group_id to delete"),
    yes: bool = typer.Option(False, "--yes", "-y", help="Skip confirmation prompt"),
):
    """Delete a dataset group and all its versions."""
    check_configs(output_format=cli_state.output_format)

    if not yes and cli_state.output_format != "json":
        confirmed = typer.confirm(
            f"Are you sure you want to delete dataset group '{group_id}' and ALL its versions?", default=False
        )
        if not confirmed:
            console.print("[warning]Aborted.[/warning]")
            raise typer.Exit(0)

    if cli_state.output_format != "json":
        with console.status(f"[bold success]Deleting dataset group '{group_id}'...[/bold success]", spinner="dots"):
            response = api.delete(f"/asset_versions/groups/dataset/{group_id}")
    else:
        response = api.delete(f"/asset_versions/groups/dataset/{group_id}")

    if response.status_code == 200:
        body = response.json()
        if cli_state.output_format == "json":
            print(json.dumps(body))
        else:
            count = body.get("deleted_count", "?")
            console.print(
                f"[success]✓[/success] Dataset group [bold]{group_id}[/bold] deleted ({count} version(s) removed)."
            )
    else:
        if cli_state.output_format == "json":
            print(json.dumps({"error": f"Failed to delete dataset. Status code: {response.status_code}"}))
            raise typer.Exit(1)
        console.print(f"[error]Error:[/error] Failed to delete dataset. {_extract_error(response)}")
        raise typer.Exit(1)


# ──────────────────────────────────────────────
# edit
# ──────────────────────────────────────────────


@app.command("edit")
def command_dataset_edit(
    group_id: str = typer.Argument(..., help="The dataset group_id to update"),
    name: str = typer.Option(None, "--name", help="New display name for the dataset group"),
    description: str = typer.Option(None, "--description", help="New description for the dataset group"),
):
    """Edit the name or description of a dataset group."""
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
        with console.status(f"[bold success]Updating dataset group '{group_id}'...[/bold success]", spinner="dots"):
            response = api.patch(f"/asset_versions/groups/dataset/{group_id}", json_data=payload)
    else:
        response = api.patch(f"/asset_versions/groups/dataset/{group_id}", json_data=payload)

    if response.status_code == 200:
        body = response.json()
        if cli_state.output_format == "json":
            print(json.dumps(body, indent=2, default=str))
        else:
            console.print(f"[success]✓[/success] Dataset group [bold]{group_id}[/bold] updated.")
    else:
        if cli_state.output_format == "json":
            print(json.dumps({"error": f"Failed to update dataset. Status code: {response.status_code}"}))
            raise typer.Exit(1)
        console.print(f"[error]Error:[/error] Failed to update dataset. {_extract_error(response)}")
        raise typer.Exit(1)


# ──────────────────────────────────────────────
# upload
# ──────────────────────────────────────────────


@app.command("upload")
def command_dataset_upload(
    dataset_id: str = typer.Argument(..., help="The dataset ID. Created if it does not exist."),
    paths: list[str] = typer.Argument(..., help="Files or directories to upload."),
    force: bool = typer.Option(False, "--force", "-f", help="Overwrite existing server-side files."),
):
    """Upload local files/directories to a dataset on the server."""
    check_configs(output_format=cli_state.output_format)

    try:
        pairs = list(asset_paths.walk_inputs(paths))
    except FileNotFoundError as exc:
        console.print(f"[error]Error:[/error] path not found: {exc}")
        raise typer.Exit(1)
    if not pairs:
        console.print("[warning]No files to upload.[/warning]")
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
            qs = f"dataset_id={dataset_id}&upload_id={upload_id}&relpath={relpath}&force={'true' if force else 'false'}"
            resp = api.post_json(f"/data/fileupload?{qs}", json_data={})
            if resp.status_code == 409:
                console.print(f"[warning]Skipped (already exists):[/warning] {relpath}")
                skipped.append(relpath)
            elif resp.status_code != 200:
                console.print(f"[error]Error uploading {relpath}: {_extract_error(resp)}")
                failed.append(relpath)
            progress.advance(outer)

    console.print(
        f"[success]✓[/success] Uploaded {len(pairs) - len(failed) - len(skipped)} file(s) to dataset [bold]{dataset_id}[/bold]."
    )
    if failed:
        raise typer.Exit(1)
    if skipped:
        raise typer.Exit(2)


# ──────────────────────────────────────────────
# download (server → local)
# ──────────────────────────────────────────────


@app.command("download")
def command_dataset_download(
    dataset_id: str = typer.Argument(..., help="The dataset ID on the server."),
    dest_dir: str = typer.Argument(..., help="Local destination directory."),
):
    """Download a dataset from the server to local disk under <dest>/<dataset_id>/."""
    check_configs(output_format=cli_state.output_format)

    list_resp = api.get(f"/data/files?dataset_id={dataset_id}")
    if list_resp.status_code != 200:
        console.print(f"[error]Error:[/error] {_extract_error(list_resp)}")
        raise typer.Exit(1)
    files = list_resp.json()
    if not files:
        console.print("[warning]Dataset has no files to download.[/warning]")
        return

    base = os.path.join(dest_dir, dataset_id)
    os.makedirs(base, exist_ok=True)
    total_bytes = sum(f["size"] for f in files)

    with Progress(
        TextColumn("[bold success]{task.description}"),
        BarColumn(),
        MofNCompleteColumn(),
        console=console,
    ) as progress:
        bar = progress.add_task(f"Downloading {dataset_id}", total=total_bytes)
        for f in files:
            relpath = f["relpath"]
            size = f["size"]
            target = os.path.join(base, *relpath.split("/"))
            try:
                chunked_download.download_one_file(
                    f"/data/file?dataset_id={dataset_id}&relpath={relpath}",
                    target_path=target,
                    server_size=size,
                    progress=progress,
                    progress_task=bar,
                )
            except Exception as exc:
                console.print(f"[error]Failed to download {relpath}: {exc}")
                raise typer.Exit(1)

    console.print(f"[success]✓[/success] Downloaded {len(files)} file(s) to {base}.")
