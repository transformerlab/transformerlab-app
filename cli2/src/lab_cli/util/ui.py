def render_table(data, format_type: str, table_columns: list, title: str) -> None:
    """Render data in specified format (table, json, or csv)."""
    from rich.console import Console
    from rich.table import Table
    import json
    import csv
    import sys

    console = Console()

    if format_type == "table":
        table = Table(title=title)
        for col in table_columns:
            table.add_column(col, style="cyan", no_wrap=True)

        for row in data:
            table.add_row(*[str(row.get(col.lower().replace(" ", "_"), "N/A")) for col in table_columns])

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
