from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.text import Text
from rich.theme import Theme
import json
import csv
import sys
import re
from datetime import datetime


# 1. Define your centralized themes
# We add "header" here as requested
THEMES = {
    "default": Theme(
        {
            "info": "bold cyan",
            "warning": "magenta",
            "error": "bold red",
            "success": "bold green",
            "label": "cyan",
            "value": "green",
            "header": "bold magenta",
        }
    ),
    "dracula": Theme(
        {
            "info": "#bd93f9",  # Purple
            "warning": "#ffb86c",  # Orange
            "error": "#ff5555",  # Red
            "success": "#50fa7b",  # Green
            "label": "#8be9fd",  # Cyan
            "value": "#f8f8f2",  # White
            "header": "bold #ff79c6",  # Pink
        }
    ),
    "monokai": Theme(
        {
            "info": "#66d9ef",  # Blue
            "warning": "#fd971f",  # Orange
            "error": "#f92672",  # Pink/Red
            "success": "#a6e22e",  # Green
            "label": "#e6db74",  # Yellow
            "value": "#f8f8f2",  # White
            "header": "bold #f92672",  # Pink
        }
    ),
}

# 2. Initialize Console with the Theme
# You could eventually load 'selected_theme' from a config file or env var
selected_theme = "default"
console = Console(theme=THEMES.get(selected_theme, THEMES["default"]))

ISO_DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$")


def format_value(value: str) -> str:
    """Format a value, converting ISO dates to a human-readable format."""
    if ISO_DATE_PATTERN.match(value):
        try:
            dt = datetime.fromisoformat(value)
            return dt.strftime("%b %d, %Y %I:%M %p")
        except ValueError:
            pass
    return value


def render_table(data, format_type: str, table_columns: list, title: str | None) -> None:
    """Render data in specified format (table, json, or csv)."""
    if format_type == "pretty":
        # THEME: Use 'header' style for the table headers
        table = Table(title=title, title_justify="left", show_header=True, header_style="header")

        for col in table_columns:
            # THEME: Use 'value' style for the column content
            # This ensures all data rows appear in the standard data color
            table.add_column(
                col,
                style="value",
                no_wrap=False,
                overflow="fold",
            )

        for row in data:
            table.add_row(*[format_value(str(row.get(col.replace(" ", "_"), "N/A"))) for col in table_columns])

        console.print(table)

    elif format_type == "json":
        console.print_json(json.dumps(data))

    elif format_type == "csv":
        writer = csv.writer(sys.stdout)
        writer.writerow(table_columns)
        for row in data:
            writer.writerow([row.get(col.lower().replace(" ", "_"), "N/A") for col in table_columns])

    else:
        # THEME: Use 'error' style
        console.print(
            f"[error]Error:[/error] Unsupported format type '{format_type}'. Supported types are: table, json, csv."
        )


def render_object(data: dict, format_type: str = "pretty") -> None:
    """Render a dictionary object in a readable format."""
    if format_type == "json":
        console.print_json(json.dumps(data))
    else:
        content = Text()
        for key, value in data.items():
            # THEME: Use 'label' for the keys
            content.append(f"{key}: ", style="label")
            content.append(f"{str(value)}\n")

        # THEME: Use 'label' (or 'info') for the border to match the key aesthetic
        panel = Panel(
            content,
            title="Object Details",
            title_align="left",
            border_style="label",
            expand=True,
        )
        console.print(panel)
