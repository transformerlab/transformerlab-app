

## Run:

```
uv run src/transformerlab_cli/main.py
```

## Build Locally:

`uv tool install .`

Adds a `lab` command to your terminal

## Debug the Job Monitor:

```
uv run textual run --dev src/transformerlab_cli/commands/job_monitor/job_monitor.py
```

Run in browser (for fun?)
```
uv run textual serve src/transformerlab_cli/commands/job_monitor/job_monitor.py
```
