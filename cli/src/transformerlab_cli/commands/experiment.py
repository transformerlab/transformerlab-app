import json
from urllib.parse import quote

import typer

import transformerlab_cli.util.api as api
from transformerlab_cli.state import cli_state
from transformerlab_cli.util.config import check_configs, get_config, set_config
from transformerlab_cli.util.ui import console, render_table

app = typer.Typer()


def _extract_error_detail(response) -> str:
    try:
        return response.json().get("detail", response.text)
    except (ValueError, KeyError):
        return response.text


@app.command("list")
def command_experiment_list(
    tag: list[str] = typer.Option(
        None,
        "--tag",
        help="Filter experiments by tag. Repeat to AND multiple tags.",
    ),
):
    """List all experiments. Marks the current default with a *.

    Use --tag <name> (repeatable) to filter; multiple --tag flags are AND'd.
    """
    check_configs(output_format=cli_state.output_format)
    output_format = cli_state.output_format

    with console.status("[bold success]Fetching experiments...[/bold success]", spinner="dots"):
        response = api.get("/experiment/")

    if response.status_code != 200:
        console.print(f"[error]Error:[/error] Failed to fetch experiments. {_extract_error_detail(response)}")
        raise typer.Exit(1)

    experiments = response.json() or []
    current = get_config("current_experiment")

    filter_tags = [t.strip().lower() for t in (tag or []) if t and t.strip()]

    def _exp_tags(exp):
        cfg = exp.get("config") or {}
        if isinstance(cfg, str):
            try:
                cfg = json.loads(cfg)
            except (ValueError, TypeError):
                cfg = {}
        tags = cfg.get("tags") or []
        return [str(t) for t in tags if isinstance(t, str)]

    if filter_tags:
        experiments = [
            exp for exp in experiments if set(filter_tags).issubset({t.lower() for t in _exp_tags(exp)})
        ]

    if output_format == "json":
        print(json.dumps({"current_experiment": current, "experiments": experiments}))
        return

    if not experiments and filter_tags:
        console.print(f"No experiments match tag(s): {', '.join(filter_tags)}")
        return

    rows = [
        {
            "default": "*" if str(exp.get("id")) == str(current) or exp.get("name") == current else "",
            "name": exp.get("name", ""),
            "tags": ", ".join(_exp_tags(exp)),
        }
        for exp in experiments
    ]
    render_table(
        data=rows,
        format_type=output_format,
        table_columns=["default", "name", "tags"],
        title="Experiments",
    )


@app.command("create")
def command_experiment_create(
    name: str = typer.Argument(..., help="Experiment name"),
    set_default: bool = typer.Option(False, "--set-default", help="Set the new experiment as the default"),
):
    """Create a new experiment."""
    check_configs(output_format=cli_state.output_format)

    with console.status(f"[bold success]Creating experiment {name}...[/bold success]", spinner="dots"):
        response = api.get(f"/experiment/create?name={quote(name)}")

    if response.status_code != 200:
        console.print(f"[error]Error:[/error] Failed to create experiment. {_extract_error_detail(response)}")
        raise typer.Exit(1)

    new_id = response.json()
    console.print(f"[success]✓[/success] Experiment created: [bold]{new_id}[/bold]")

    if set_default:
        set_config("current_experiment", str(new_id), cli_state.output_format)


@app.command("delete")
def command_experiment_delete(
    experiment_id: str = typer.Argument(..., help="Experiment ID to delete"),
    no_interactive: bool = typer.Option(False, "--no-interactive", help="Skip confirmation prompt"),
):
    """Delete an experiment."""
    check_configs(output_format=cli_state.output_format)

    if not no_interactive:
        typer.confirm(f"Delete experiment {experiment_id}?", abort=True)

    with console.status(f"[bold success]Deleting experiment {experiment_id}...[/bold success]", spinner="dots"):
        response = api.get(f"/experiment/{experiment_id}/delete")

    if response.status_code != 200:
        console.print(f"[error]Error:[/error] Failed to delete experiment. {_extract_error_detail(response)}")
        raise typer.Exit(1)

    console.print(f"[success]✓[/success] Experiment [bold]{experiment_id}[/bold] deleted.")

    if str(get_config("current_experiment")) == str(experiment_id):
        console.print(
            "[warning]Note:[/warning] This was your default experiment. "
            "Set a new default with [bold]lab experiment set-default <id>[/bold]."
        )


@app.command("set-default")
def command_experiment_set_default(
    experiment_id: str = typer.Argument(..., help="Experiment ID to set as the default"),
):
    """Set the default experiment (stored in ~/.lab/config.json)."""
    set_config("current_experiment", experiment_id, cli_state.output_format)


tag_app = typer.Typer(help="Manage tags on an experiment.")
app.add_typer(tag_app, name="tag")


def _print_tags(tags):
    if tags:
        console.print(f"[success]Tags:[/success] {', '.join(tags)}")
    else:
        console.print("[success]No tags.[/success]")


@tag_app.command("add")
def command_experiment_tag_add(
    experiment: str = typer.Argument(..., help="Experiment name or id"),
    tags: list[str] = typer.Argument(..., help="One or more tags to add"),
):
    """Add one or more tags to an experiment."""
    check_configs(output_format=cli_state.output_format)
    payload = {"tags": list(tags)}
    response = api.post_json(f"/experiment/{quote(experiment)}/tags/add", payload)
    if response.status_code != 200:
        console.print(f"[error]Error:[/error] {_extract_error_detail(response)}")
        raise typer.Exit(1)
    _print_tags(response.json().get("tags", []))


@tag_app.command("remove")
def command_experiment_tag_remove(
    experiment: str = typer.Argument(..., help="Experiment name or id"),
    tags: list[str] = typer.Argument(..., help="One or more tags to remove"),
):
    """Remove one or more tags from an experiment."""
    check_configs(output_format=cli_state.output_format)
    payload = {"tags": list(tags)}
    response = api.post_json(f"/experiment/{quote(experiment)}/tags/remove", payload)
    if response.status_code != 200:
        console.print(f"[error]Error:[/error] {_extract_error_detail(response)}")
        raise typer.Exit(1)
    _print_tags(response.json().get("tags", []))


@app.command("tags")
def command_experiment_list_all_tags():
    """List all distinct tags across experiments you can read."""
    check_configs(output_format=cli_state.output_format)
    output_format = cli_state.output_format

    response = api.get("/experiment/tags")
    if response.status_code != 200:
        console.print(f"[error]Error:[/error] {_extract_error_detail(response)}")
        raise typer.Exit(1)

    tags = response.json().get("tags", [])

    if output_format == "json":
        print(json.dumps({"tags": tags}))
        return

    if not tags:
        console.print("No tags found.")
        return

    rows = [{"tag": t} for t in tags]
    render_table(data=rows, format_type=output_format, table_columns=["tag"], title="Tags")
