import os
import tempfile
import subprocess

import typer
from rich.markdown import Markdown

import transformerlab_cli.util.api as api
from transformerlab_cli.util.config import resolve_experiment_id
from transformerlab_cli.util.ui import console

app = typer.Typer()


def _get_notes(experiment_id: str) -> str:
    """Fetch current notes content. Exits with error on failure."""
    response = api.get(f"/experiment/{experiment_id}/notes")
    if response.status_code != 200:
        console.print(f"[error]Error:[/error] Failed to fetch notes. Status code: {response.status_code}")
        raise typer.Exit(1)
    content = response.json()
    return content if isinstance(content, str) else ""


def _save_notes(experiment_id: str, content: str) -> None:
    """Save notes content. Exits with error on failure."""
    response = api.post_json(f"/experiment/{experiment_id}/notes", content)
    if response.status_code != 200:
        console.print(f"[error]Error:[/error] Failed to save notes. Status code: {response.status_code}")
        raise typer.Exit(1)


@app.command("show")
def command_notes_show(
    raw: bool = typer.Option(False, "--raw", help="Print raw markdown instead of rendered output"),
    experiment: str | None = typer.Option(None, "--experiment", "-e", help="Override experiment for this command"),
) -> None:
    """Show experiment notes."""
    experiment_id = resolve_experiment_id(experiment)
    content = _get_notes(experiment_id)
    if not content.strip():
        console.print("[dim]No notes yet.[/dim]")
        return
    if raw:
        console.print(content)
    else:
        console.print(Markdown(content))


@app.command("edit")
def command_notes_edit(
    experiment: str | None = typer.Option(None, "--experiment", "-e", help="Override experiment for this command"),
) -> None:
    """Open experiment notes in $EDITOR for editing."""
    experiment_id = resolve_experiment_id(experiment)
    content = _get_notes(experiment_id)
    editor = os.environ.get("EDITOR", "nano")

    with tempfile.NamedTemporaryFile(suffix=".md", mode="w", encoding="utf-8", delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        result = subprocess.run([editor, tmp_path])
        if result.returncode != 0:
            console.print(f"[error]Error:[/error] Editor exited with code {result.returncode}")
            raise typer.Exit(1)
        with open(tmp_path, "r", encoding="utf-8") as f:
            new_content = f.read()
    finally:
        os.unlink(tmp_path)

    _save_notes(experiment_id, new_content)
    console.print("[success]✓[/success] Notes saved.")


@app.command("append")
def command_notes_append(
    text: str = typer.Argument(..., help="Text to append to the notes"),
    experiment: str | None = typer.Option(None, "--experiment", "-e", help="Override experiment for this command"),
) -> None:
    """Append a line of text to experiment notes without opening an editor."""
    experiment_id = resolve_experiment_id(experiment)
    current = _get_notes(experiment_id)
    new_content = f"{current}\n{text}" if current.strip() else text
    _save_notes(experiment_id, new_content)
    console.print("[success]✓[/success] Notes updated.")
