"""
Run a task locally, simulating what TransformerLab would do.

This command reads a task.yaml from a directory, sets up a uv virtual environment,
runs the setup and run commands, and streams output to the terminal -- all without
needing the TransformerLab API server running.

Usage:
    lab run-local ./my-task-dir/
    lab run-local ./my-task-dir/ --param learning_rate=0.001 --param epochs=10
"""

import os
import shlex
import signal
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Optional

import typer
import yaml
from rich.console import Console
from rich.panel import Panel
from rich.syntax import Syntax

console = Console()

_PYTHON_VERSION = "3.11"


def _check_nvidia_gpu() -> bool:
    """Return True if NVIDIA GPU is available."""
    import shutil

    if shutil.which("nvidia-smi") is None:
        return False
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader,nounits"],
            capture_output=True,
            text=True,
            check=True,
            timeout=10,
        )
        return bool(result.stdout.strip())
    except (subprocess.SubprocessError, FileNotFoundError):
        return False


def _check_amd_gpu() -> bool:
    """Return True if AMD GPU (ROCm) is available."""
    import shutil

    if shutil.which("rocminfo") is None:
        return False
    try:
        subprocess.run(["rocminfo"], capture_output=True, check=True, timeout=10)
        return True
    except (subprocess.SubprocessError, FileNotFoundError):
        return False


def _get_uv_pip_install_flags() -> str:
    """Return extra flags for uv pip install (e.g. ROCm/CUDA index)."""
    if _check_amd_gpu():
        return "--index https://download.pytorch.org/whl/rocm6.4 --index-strategy unsafe-best-match"
    if _check_nvidia_gpu():
        try:
            with open("/etc/dgx-release", encoding="utf-8") as f:
                if "dgx spark" in f.read().lower():
                    return "--index https://download.pytorch.org/whl/cu130 --index-strategy unsafe-best-match"
        except (OSError, FileNotFoundError):
            pass
        return ""
    if sys.platform != "darwin":
        return "--index https://download.pytorch.org/whl/cpu --index-strategy unsafe-best-match"
    return ""


def _create_venv(venv_path: Path, requirements_file: Optional[Path] = None) -> None:
    """Create a uv venv and optionally install from a requirements file."""
    venv_path.mkdir(parents=True, exist_ok=True)

    console.print(f"[dim]Creating venv at {venv_path}...[/dim]")
    subprocess.run(
        ["uv", "venv", str(venv_path), "--python", _PYTHON_VERSION, "--clear"],
        cwd=venv_path.parent,
        check=True,
        timeout=120,
    )

    if requirements_file and requirements_file.exists():
        console.print(f"[dim]Installing from {requirements_file.name}...[/dim]")
        python_bin = venv_path / "bin" / "python"
        additional_flags = _get_uv_pip_install_flags()
        install_cmd = ["uv", "pip", "install"]
        if additional_flags:
            install_cmd.extend(shlex.split(additional_flags))
        install_cmd.extend(["--python", str(python_bin), "-r", str(requirements_file)])

        result = subprocess.run(
            install_cmd,
            cwd=venv_path.parent,
            capture_output=True,
            text=True,
            timeout=900,
        )
        if result.returncode != 0:
            console.print(f"[red]Failed to install requirements:[/red]\n{result.stderr or result.stdout}")
            raise typer.Exit(1)


def _install_task_requirements(venv_path: Path, task_dir: Path) -> None:
    """Install task-specific requirements.txt if present."""
    req_file = task_dir / "requirements.txt"
    if not req_file.exists():
        return

    console.print("[dim]Installing task requirements.txt...[/dim]")
    python_bin = venv_path / "bin" / "python"
    additional_flags = _get_uv_pip_install_flags()
    install_cmd = ["uv", "pip", "install"]
    if additional_flags:
        install_cmd.extend(shlex.split(additional_flags))
    install_cmd.extend(["--python", str(python_bin), "-r", str(req_file)])

    result = subprocess.run(
        install_cmd,
        cwd=task_dir,
        capture_output=True,
        text=True,
        timeout=900,
    )
    if result.returncode != 0:
        console.print(
            f"[yellow]Warning: Failed to install task requirements:[/yellow]\n{result.stderr or result.stdout}"
        )


def _build_env(venv_path: Path, env_vars: dict, task_dir: Path) -> dict:
    """Build the environment dict for running commands."""
    venv_bin = venv_path / "bin"
    env = os.environ.copy()
    env.update(env_vars)
    env["PATH"] = f"{venv_bin}{os.pathsep}{env.get('PATH', '')}"
    env["VIRTUAL_ENV"] = str(venv_path)
    # Set HOME to a workspace inside the task run dir (matches local provider behavior)
    env["HOME"] = str(task_dir)
    return env


def _run_command(label: str, command: str, env: dict, cwd: Path) -> int:
    """Run a shell command, streaming output to the terminal. Returns exit code."""
    console.print(f"\n[bold cyan]>>> {label}[/bold cyan]")
    console.print(f"[dim]$ {command}[/dim]\n")

    proc = subprocess.Popen(
        ["/bin/bash", "-c", command],
        cwd=str(cwd),
        env=env,
        stdout=sys.stdout,
        stderr=sys.stderr,
    )

    # Forward SIGINT/SIGTERM to the child so Ctrl+C works naturally
    original_sigint = signal.getsignal(signal.SIGINT)
    original_sigterm = signal.getsignal(signal.SIGTERM)

    def _forward_signal(signum: int, _frame: object) -> None:
        try:
            proc.send_signal(signum)
        except ProcessLookupError:
            pass

    signal.signal(signal.SIGINT, _forward_signal)
    signal.signal(signal.SIGTERM, _forward_signal)

    try:
        proc.wait()
    finally:
        signal.signal(signal.SIGINT, original_sigint)
        signal.signal(signal.SIGTERM, original_sigterm)

    return proc.returncode


def _parse_param_overrides(params: list[str]) -> dict:
    """Parse --param KEY=VALUE flags into a dict."""
    overrides: dict = {}
    for p in params:
        if "=" not in p:
            console.print(f"[red]Invalid --param format:[/red] {p!r} (expected KEY=VALUE)")
            raise typer.Exit(1)
        key, value = p.split("=", 1)
        overrides[key.strip()] = value.strip()
    return overrides


def _substitute_parameters(command: str, parameters: dict) -> str:
    """Replace ${{param_name}} placeholders in a command with parameter values."""
    for key, value in parameters.items():
        # Support both ${{key}} (task.yaml convention) and ${key} patterns
        command = command.replace(f"${{{{{key}}}}}", str(value))
        command = command.replace(f"${{{key}}}", str(value))
    return command


def run_task_locally(
    task_dir: Path,
    param_overrides: dict,
    skip_venv: bool = False,
    api_source_dir: Optional[Path] = None,
) -> None:
    """Core logic for running a task locally."""
    task_yaml_path = task_dir / "task.yaml"
    if not task_yaml_path.exists():
        console.print(f"[red]Error:[/red] task.yaml not found in {task_dir}")
        raise typer.Exit(1)

    with open(task_yaml_path, "r", encoding="utf-8") as f:
        task_yaml_content = f.read()

    try:
        task_config = yaml.safe_load(task_yaml_content)
    except yaml.YAMLError as e:
        console.print(f"[red]Error:[/red] Invalid YAML in task.yaml: {e}")
        raise typer.Exit(1)

    if not task_config:
        console.print("[red]Error:[/red] task.yaml is empty")
        raise typer.Exit(1)

    # Support legacy "task:" wrapper
    if "task" in task_config and isinstance(task_config["task"], dict):
        task_config = task_config["task"]

    name = task_config.get("name", "unnamed-task")
    run_cmd = task_config.get("run") or task_config.get("command")
    setup_cmd = task_config.get("setup")
    env_vars = task_config.get("envs") or {}
    parameters = task_config.get("parameters") or {}
    github_repo_url = task_config.get("github_repo_url")
    github_repo_dir = task_config.get("github_repo_dir")
    github_repo_branch = task_config.get("github_repo_branch")

    if not run_cmd:
        console.print("[red]Error:[/red] task.yaml must have a 'run' field")
        raise typer.Exit(1)

    # Resolve parameter defaults and apply overrides
    resolved_params: dict = {}
    for key, value in parameters.items():
        if isinstance(value, dict):
            resolved_params[key] = value.get("default", "")
        else:
            resolved_params[key] = value
    resolved_params.update(param_overrides)

    # Show task summary
    console.print(
        Panel(
            Syntax(task_yaml_content, "yaml", theme="monokai", line_numbers=True),
            title=f"[bold]Task: {name}[/bold]",
            border_style="cyan",
        )
    )

    if resolved_params:
        console.print("\n[bold cyan]Parameters:[/bold cyan]")
        for k, v in resolved_params.items():
            is_override = k in param_overrides
            suffix = " [yellow](override)[/yellow]" if is_override else ""
            console.print(f"  {k} = {v}{suffix}")

    # Substitute parameters into commands
    run_cmd = _substitute_parameters(run_cmd, resolved_params)
    if setup_cmd:
        setup_cmd = _substitute_parameters(setup_cmd, resolved_params)

    # Set up working directory
    work_dir = tempfile.mkdtemp(prefix=f"tfl-local-{name}-")
    work_path = Path(work_dir)
    console.print(f"\n[bold]Working directory:[/bold] {work_path}")

    # Set up venv
    venv_path = work_path / "venv"
    if not skip_venv:
        # Check if there's a base requirements file from local provider
        home_dir = os.environ.get("TRANSFORMERLAB_HOME", os.path.expanduser("~/.transformerlab"))
        base_requirements = Path(home_dir) / "local_provider_base_requirements.txt"

        if base_requirements.exists():
            console.print(f"[dim]Using base requirements from {base_requirements}[/dim]")
            _create_venv(venv_path, base_requirements)
        elif api_source_dir and (api_source_dir / "pyproject.toml").exists():
            # Install from the API source directly
            console.print(f"[dim]Installing from API source at {api_source_dir}[/dim]")
            _create_venv(venv_path)
            python_bin = venv_path / "bin" / "python"
            additional_flags = _get_uv_pip_install_flags()
            install_cmd = ["uv", "pip", "install"]
            if additional_flags:
                install_cmd.extend(shlex.split(additional_flags))
            install_cmd.extend(["--python", str(python_bin), "."])
            result = subprocess.run(
                install_cmd,
                cwd=str(api_source_dir),
                capture_output=True,
                text=True,
                timeout=900,
            )
            if result.returncode != 0:
                console.print(f"[yellow]Warning: API source install failed:[/yellow]\n{result.stderr or result.stdout}")
        else:
            console.print("[dim]No base requirements found, creating bare venv[/dim]")
            _create_venv(venv_path)

        # Install task-specific requirements
        _install_task_requirements(venv_path, task_dir)
    else:
        console.print("[dim]Skipping venv creation (--skip-venv)[/dim]")
        venv_path.mkdir(parents=True, exist_ok=True)

    # Build environment
    env = _build_env(venv_path, env_vars, work_path)

    # Add useful env vars that the harness/SDK normally sets
    env["_TFL_TASK_DIR"] = str(task_dir.resolve())
    if api_source_dir:
        env["_TFL_SOURCE_CODE_DIR"] = str(api_source_dir.resolve())

    # Export parameters as environment variables (TFL_PARAM_<name>)
    for key, value in resolved_params.items():
        env[f"TFL_PARAM_{key.upper()}"] = str(value)

    # Build setup commands
    setup_commands: list[str] = []

    # Handle git clone if task references a github repo
    if github_repo_url:
        branch_flag = f"-b {github_repo_branch}" if github_repo_branch else ""
        clone_cmd = f"git clone --depth 1 {branch_flag} {github_repo_url} ~/src".strip()
        if github_repo_dir:
            clone_cmd += f" && cd ~/src/{github_repo_dir}"
        setup_commands.append(clone_cmd)

    if setup_cmd:
        setup_commands.append(setup_cmd)

    # Run setup
    if setup_commands:
        full_setup = " && ".join(setup_commands)
        exit_code = _run_command("Setup", full_setup, env, work_path)
        if exit_code != 0:
            console.print(f"\n[red]Setup failed with exit code {exit_code}[/red]")
            console.print(f"[dim]Working directory preserved at: {work_path}[/dim]")
            raise typer.Exit(exit_code)

    # Run main command
    exit_code = _run_command("Run", run_cmd, env, work_path)

    if exit_code == 0:
        console.print(f"\n[green]Task '{name}' completed successfully.[/green]")
    else:
        console.print(f"\n[red]Task '{name}' failed with exit code {exit_code}.[/red]")

    console.print(f"[dim]Working directory: {work_path}[/dim]")
    raise typer.Exit(exit_code)


def command_run_local(
    task_directory: str = typer.Argument(..., help="Path to the task directory containing task.yaml"),
    param: list[str] = typer.Option([], "--param", "-p", help="Parameter override as KEY=VALUE (repeatable)"),
    skip_venv: bool = typer.Option(False, "--skip-venv", help="Skip virtual environment creation"),
    api_source: Optional[str] = typer.Option(
        None,
        "--api-source",
        help="Path to the TransformerLab API source (for installing base dependencies)",
    ),
) -> None:
    """Run a task locally, simulating what TransformerLab would do.

    Reads task.yaml from the given directory, creates a virtual environment,
    runs setup and run commands, and streams output to the terminal.
    No API server required.
    """
    task_dir = Path(task_directory).resolve()
    if not task_dir.is_dir():
        console.print(f"[red]Error:[/red] Not a directory: {task_dir}")
        raise typer.Exit(1)

    param_overrides = _parse_param_overrides(param)

    # Try to auto-detect the API source directory
    api_source_dir: Optional[Path] = None
    if api_source:
        api_source_dir = Path(api_source).resolve()
    else:
        # Check common locations
        candidates = [
            Path(__file__).resolve().parents[5] / "api",  # repo root / api
            Path.cwd() / "api",
        ]
        for candidate in candidates:
            if (candidate / "pyproject.toml").exists():
                api_source_dir = candidate
                break

    run_task_locally(task_dir, param_overrides, skip_venv=skip_venv, api_source_dir=api_source_dir)
