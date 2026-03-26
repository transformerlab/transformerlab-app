# Transformer Lab CLI

![Main Screenshot](https://raw.githubusercontent.com/transformerlab/transformerlab-app/main/cli/screenshots/screenshot001.png)

![Job Monitor Screenshot](https://raw.githubusercontent.com/transformerlab/transformerlab-app/main/cli/screenshots/screenshot002.png)

## Install

```bash
uv tool install transformerlab-cli
```

## Usage

```
 Usage: lab [OPTIONS] COMMAND [ARGS]...

 Transformer Lab CLI

╭─ Options ────────────────────────────────────────────────────────────────────╮
│ --format        TEXT  Output format: pretty or json [default: pretty]        │
│ --help                Show this message and exit.                            │
╰──────────────────────────────────────────────────────────────────────────────╯
╭─ Commands ───────────────────────────────────────────────────────────────────╮
│ version   Display the CLI version.                                           │
│ config    View or set configuration values.                                  │
│ status    Check the status of the server.                                    │
│ login     Log in to Transformer Lab.                                         │
│ logout    Log out from Transformer Lab.                                      │
│ task      Task management commands                                           │
│ job       Job management commands                                            │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Command Reference

For a full list of all commands with detailed options and example usage, see [COMMANDS.md](https://github.com/transformerlab/transformerlab-app/blob/main/cli/COMMANDS.md).

## Development

### Run (DEV)

```bash
uv run src/transformerlab_cli/main.py
```

### Build Locally

```bash
uv tool install .
```

or rebuild with:

```bash
uv tool install . --force --reinstall
```

Adds a `lab` command to your terminal.

### Debug the Job Monitor

```bash
pip install -e .
uv run textual run --dev src/transformerlab_cli/commands/job_monitor/job_monitor.py
```

and then in another window:

```bash
textual console -x SYSTEM -x EVENT -x INFO
```

### Run Textual in Browser

```bash
uv run textual serve src/transformerlab_cli/commands/job_monitor/job_monitor.py
```
