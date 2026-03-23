import json
from typing import Optional

import typer

from transformerlab_cli.state import cli_state
from transformerlab_cli.util.config import VALID_CONFIG_KEYS, get_config, list_config, set_config
from transformerlab_cli.util.ui import console


def _print_error_and_exit(message: str, output_format: str) -> None:
    if output_format == "json":
        print(json.dumps({"error": message}))
    else:
        console.print(f"[error]Error:[/error] {message}")
    raise typer.Exit(1)


def command_config(
    args: Optional[list[str]] = typer.Argument(
        None,
        help="Config usage: `lab config`, `lab config <key>`, `lab config get <key>`, `lab config set <key> <value>`",
    ),
):
    """View, get, and set configuration values."""
    output_format = cli_state.output_format
    parsed_args = args or []

    if len(parsed_args) == 0:
        list_config(output_format=output_format)
        return

    if parsed_args[0] == "set":
        if len(parsed_args) != 3:
            _print_error_and_exit("Usage: lab config set <key> <value>", output_format)
        key = parsed_args[1]
        value = parsed_args[2]
        if key not in VALID_CONFIG_KEYS:
            keys_list = ", ".join(VALID_CONFIG_KEYS)
            if output_format == "json":
                print(json.dumps({"error": f"Invalid config key '{key}'", "valid_keys": VALID_CONFIG_KEYS}))
            else:
                console.print(f"[error]Error:[/error] Invalid config key '{key}'")
                console.print(f"[warning]Valid keys:[/warning] {keys_list}")
            raise typer.Exit(1)
        set_config(key, value, output_format=output_format)
        return

    if parsed_args[0] == "get":
        if len(parsed_args) != 2:
            _print_error_and_exit("Usage: lab config get <key>", output_format)
        key = parsed_args[1]
    else:
        if len(parsed_args) != 1:
            _print_error_and_exit("To set config, use: lab config set <key> <value>", output_format)
        key = parsed_args[0]

    if key not in VALID_CONFIG_KEYS:
        keys_list = ", ".join(VALID_CONFIG_KEYS)
        if output_format == "json":
            print(json.dumps({"error": f"Invalid config key '{key}'", "valid_keys": VALID_CONFIG_KEYS}))
        else:
            console.print(f"[error]Error:[/error] Invalid config key '{key}'")
            console.print(f"[warning]Valid keys:[/warning] {keys_list}")
        raise typer.Exit(1)

    value = get_config(key)
    if value is None:
        _print_error_and_exit(f"Config key '{key}' is not set", output_format)

    if output_format == "json":
        print(json.dumps({"key": key, "value": value}))
    else:
        console.print(value)
