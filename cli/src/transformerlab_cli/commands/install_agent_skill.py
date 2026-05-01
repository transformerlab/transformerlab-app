import shutil
import subprocess
import sys

import typer

from transformerlab_cli.util import telemetry
from transformerlab_cli.util.ui import console

app = typer.Typer()

SKILL_COMMAND = [
    "npx",
    "skills",
    "add",
    "transformerlab/transformerlab-app",
    "--skill",
    "transformerlab-cli",
]


@app.command()
def install_agent_skill() -> None:
    """Install the Transformer Lab agent skill for AI coding agents (Claude Code, etc.)."""
    telemetry.init()
    telemetry.incr("install_agent_skill.start")

    if shutil.which("npx") is None:
        console.print(
            "[error]Error:[/error] `npx` was not found on PATH.\n"
            "[dim]`npx` ships with Node.js. Install Node.js from https://nodejs.org "
            "(or via your package manager, e.g. `brew install node`) and try again.[/dim]"
        )
        telemetry.incr("install_agent_skill.completed", exit_code="1", reason="npx_missing")
        telemetry.flush()
        raise typer.Exit(1)

    pretty_command = " ".join(SKILL_COMMAND)
    console.print(f"\n[info]Running:[/info] [bold]{pretty_command}[/bold]\n")
    telemetry.breadcrumb("install_agent_skill_start")

    try:
        process = subprocess.run(SKILL_COMMAND, stdout=sys.stdout, stderr=sys.stderr)
    except KeyboardInterrupt:
        console.print("\n[warning]Installation interrupted.[/warning]")
        telemetry.incr("install_agent_skill.completed", exit_code="130")
        telemetry.flush()
        raise typer.Exit(130)
    except OSError as e:
        console.print(f"\n[error]Failed to run command: {e}[/error]")
        telemetry.incr("install_agent_skill.completed", exit_code="1")
        telemetry.capture_error(e)
        telemetry.flush()
        raise typer.Exit(1)

    telemetry.incr("install_agent_skill.completed", exit_code=str(process.returncode))
    telemetry.flush()
    if process.returncode == 0:
        console.print("\n[success]Skill installed successfully.[/success]")
    else:
        console.print(f"\n[error]Command exited with code {process.returncode}.[/error]")
        raise typer.Exit(process.returncode)
