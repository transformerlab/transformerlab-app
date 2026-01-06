from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.text import Text
import json
import csv
import sys

console = Console()


def render_table(data, format_type: str, table_columns: list, title: str) -> None:
    """Render data in specified format (table, json, or csv)."""
    if format_type == "pretty":
        table = Table(title=title)
        for col in table_columns:
            table.add_column(col, style="cyan", no_wrap=True)

        for row in data:
            table.add_row(*[str(row.get(col.replace(" ", "_"), "N/A")) for col in table_columns])

        console.print(table)

    elif format_type == "json":
        console.print_json(json.dumps(data))

    elif format_type == "csv":
        writer = csv.writer(sys.stdout)
        writer.writerow(table_columns)
        for row in data:
            writer.writerow([row.get(col.lower().replace(" ", "_"), "N/A") for col in table_columns])

    else:
        console.print(
            f"[red]Error:[/red] Unsupported format type '{format_type}'. Supported types are: table, json, csv."
        )


def render_object(data: dict, format_type: str = "pretty") -> None:
    """Render a dictionary object in a readable format."""
    if format_type == "json":
        console.print_json(json.dumps(data))
    else:
        content = Text()
        for key, value in data.items():
            content.append(f"{key}: ", style="bold cyan")
            content.append(f"{str(value)}\n")
        panel = Panel(
            content,
            title="Object Details",
            title_align="left",
            border_style="cyan",
            expand=True,
        )
        console.print(panel)
