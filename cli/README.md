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

## Claude Code Skill

Want Claude Code (or other AI coding agents) to manage Transformer Lab for you? Install the skill:

```bash
lab install-agent-skill
```

This is a thin wrapper around the underlying installer:

```bash
npx skills add transformerlab/transformerlab-app --skill transformerlab-cli
```

This teaches your AI agent how to use the `lab` CLI to check job status, stream logs, download artifacts, queue tasks, manage providers, and more. See [.agents/skills/transformerlab-cli/](https://github.com/transformerlab/transformerlab-app/tree/main/.agents/skills/transformerlab-cli) for the full skill definition.

## Development

### Run (DEV)

```bash
uv run src/transformerlab_cli/main.py
```

### Build Locally


#### Option A — Global install (simple)

```bash
uv tool install . --force --reinstall
```

This installs `lab` into `~/.local/bin/` so it's available from any shell.

#### Option B — Editable install into an active venv (recommended for iterative dev)

```bash
# Activate the venv you want lab installed into, e.g.
source ~/.transformerlab/envs/general-uv/bin/activate

# From the cli/ directory:
uv pip install -e .
```

`lab` will live at `<venv>/bin/lab` and only resolve while that venv is active. Code changes take effect without reinstalling.

> ⚠️ **Gotcha:** if a `cli/.venv` directory exists, `uv pip install` targets it instead of your active `$VIRTUAL_ENV`, and `which lab` will come up empty. Either delete it (`rm -rf cli/.venv`) or force the target explicitly: `uv pip install -e . --python "$VIRTUAL_ENV/bin/python"`.

### Debug the Job Monitor

Install editable into your active venv (see Option B above), then:

```bash
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
