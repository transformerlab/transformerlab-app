#!/usr/bin/env python3
"""
test-task-placement.py

Exercises `lab task add` in each of the documented file-placement scenarios,
queues the task on the default provider (Local unless you drive the interactive
prompts), waits for completion, and prints a final report showing where files
landed on the worker in each case.

Scenarios:
  1. Manual        — directory with only a task.yaml (inline `run`, no source files).
  2. GitHub full   — local dir whose task.yaml sets github_repo_url (full clone).
  3. GitHub subdir — local dir whose task.yaml sets github_repo_url + github_repo_dir + github_repo_branch.
                     (The CLI's --from-git cannot express a subdirectory; /tree/<branch>/<path>
                     URLs are not parsed server-side. Uploading a task.yaml that carries the
                     fields is the CLI-native way to exercise sparse-checkout.)
  4. Upload subdir — `lab task add ./probe-upload` (task.yaml + main.py inside).
  5. Upload cwd    — `cd probe-upload && lab task add .` (byte-for-byte identical to #4).

Usage:
    python3 scripts/test-task-placement.py --provider <provider-name> --experiment <experiment-id>

Both --provider and --experiment are required.

- Run `lab provider list` to see available provider names. The script uses the
  provider's position in that list to drive the interactive `lab task queue`
  prompts. Task YAMLs do NOT hard-code a compute_provider — the provider is
  chosen at queue time so the exact same tasks can be retargeted.
- The CLI reads `current_experiment` from its global config. This script
  temporarily sets `current_experiment` to the value of --experiment for the
  duration of the run and restores the previous value on exit (including on
  error).

Requirements: `lab` CLI installed and authenticated.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import textwrap
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

# ---- Config -----------------------------------------------------------------

GITHUB_FULL_REPO = "https://github.com/transformerlab/transformerlab-app"
GITHUB_SUBDIR_REPO = "https://github.com/transformerlab/transformerlab-app"
GITHUB_SUBDIR_PATH = "api/transformerlab/galleries/examples/sample-task"
GITHUB_SUBDIR_BRANCH = "main"

JOB_WAIT_SECS = int(os.environ.get("JOB_WAIT_SECS", "300"))
POLL_INTERVAL = 5

TERMINAL_STATUSES = {"COMPLETE", "FAILED", "STOPPED", "ERROR", "CANCELLED"}

# ---- Probe ------------------------------------------------------------------
# Bash probe, used as the `run` field in scenarios 1-3 (no source file uploaded).

PROBE_RUN_BASH = r"""set +e
echo "=== PROBE BEGIN ==="
echo "pwd=$(pwd)"
echo "HOME=$HOME"
echo "whoami=$(whoami)"
echo "--- ls -la of cwd ---"
ls -la
echo "--- find . -maxdepth 3 (git/hidden excluded) ---"
find . -maxdepth 3 \( -path ./.git -o -path ./node_modules \) -prune -o -print 2>/dev/null | head -60
echo "--- ls -la of \$HOME ---"
ls -la "$HOME" 2>/dev/null | head -30
echo "=== PROBE END ==="
"""

# Python probe for scenarios 4-5 (main.py is uploaded and executes via `python main.py`).
PROBE_MAIN_PY = textwrap.dedent(
    """\
    import os, subprocess, sys
    from lab import lab

    lab.init()

    def log(s):
        lab.log(s)
        print(s, flush=True)

    log("=== PROBE BEGIN (python) ===")
    log(f"pwd={os.getcwd()}")
    log(f"HOME={os.environ.get('HOME')}")
    log(f"__file__={os.path.abspath(__file__)}")
    log(f"sys.argv[0]={sys.argv[0]}")
    log("--- ls -la of cwd ---")
    log(subprocess.check_output(["ls", "-la"]).decode())
    log("--- find . -maxdepth 3 ---")
    try:
        out = subprocess.check_output(
            ["find", ".", "-maxdepth", "3", "-not", "-path", "*/.git/*"], timeout=10
        ).decode()
        for line in out.splitlines()[:80]:
            log(line)
    except Exception as e:
        log(f"find failed: {e}")
    log("--- ls -la of $HOME ---")
    try:
        log(subprocess.check_output(["ls", "-la", os.environ.get("HOME", "/root")]).decode())
    except Exception as e:
        log(f"ls HOME failed: {e}")
    log("=== PROBE END ===")
    lab.finish(message="probe done")
    """
)


def _indent(text: str, prefix: str) -> str:
    return "".join(prefix + line for line in text.splitlines(keepends=True))


def task_yaml_minimal(name: str) -> str:
    return (
        f"name: {name}\n"
        "resources:\n  cpus: 1\n  memory: 2\n"
        "setup: pip install -q transformerlab\n"
        "run: |\n"
        f"{_indent(PROBE_RUN_BASH, '  ')}"
    )


def task_yaml_github_full(name: str) -> str:
    return (
        f"name: {name}\n"
        "resources:\n  cpus: 1\n  memory: 2\n"
        f'github_repo_url: "{GITHUB_FULL_REPO}"\n'
        "setup: pip install -q transformerlab\n"
        "run: |\n"
        f"{_indent(PROBE_RUN_BASH, '  ')}"
    )


def task_yaml_github_subdir(name: str) -> str:
    return (
        f"name: {name}\n"
        "resources:\n  cpus: 1\n  memory: 2\n"
        f'github_repo_url: "{GITHUB_SUBDIR_REPO}"\n'
        f'github_repo_dir: "{GITHUB_SUBDIR_PATH}"\n'
        f'github_repo_branch: "{GITHUB_SUBDIR_BRANCH}"\n'
        "setup: pip install -q transformerlab\n"
        "run: |\n"
        f"{_indent(PROBE_RUN_BASH, '  ')}"
    )


def task_yaml_upload(name: str) -> str:
    return (
        f"name: {name}\nresources:\n  cpus: 1\n  memory: 2\nsetup: pip install -q transformerlab\nrun: python main.py\n"
    )


# ---- Scenario model ---------------------------------------------------------


@dataclass
class Scenario:
    name: str
    description: str
    # Builder returns the directory to upload and the command-line cwd to run
    # `lab task add` from (None means the script's own cwd / temp root).
    directory: Path = field(default_factory=Path)
    add_from_inside_dir: bool = False
    task_id: Optional[str] = None
    job_id: Optional[str] = None
    final_status: Optional[str] = None
    task_logs: str = ""
    machine_logs: str = ""
    error: Optional[str] = None


# ---- Shell helpers ----------------------------------------------------------


def run(cmd: list[str], cwd: Optional[Path] = None, capture: bool = True) -> subprocess.CompletedProcess:
    """Run a command; stream to stdout if not capturing, otherwise capture."""
    print(f"+ {' '.join(cmd)}" + (f"   (cwd={cwd})" if cwd else ""))
    if capture:
        return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, check=False)
    return subprocess.run(cmd, cwd=cwd, text=True, check=False)


TASK_ID_RE = re.compile(r"Task created with ID:\s*(\S+)")
JOB_ID_RE = re.compile(r"Job (?:ID|created with ID)[:]?\s+([a-f0-9-]+)", re.IGNORECASE)


def extract_task_id(stdout: str) -> Optional[str]:
    m = TASK_ID_RE.search(stdout or "")
    return m.group(1) if m else None


def extract_job_id(stdout: str) -> Optional[str]:
    m = JOB_ID_RE.search(stdout or "")
    return m.group(1) if m else None


def find_latest_job_for_task(task_id: str) -> Optional[str]:
    """Fallback: look up the most recent job for the given task via `lab --format json job list`."""
    proc = run(["lab", "--format", "json", "job", "list"])
    if proc.returncode != 0:
        return None
    try:
        jobs = json.loads(proc.stdout)
    except json.JSONDecodeError:
        return None
    matching = [j for j in jobs if j.get("task_id") == task_id]
    matching.sort(key=lambda j: j.get("created_at", ""), reverse=True)
    return matching[0]["id"] if matching else None


def job_status(job_id: str) -> Optional[str]:
    # NOTE: `lab job info` does not honor `--format json` (it always pretty-prints
    # via Rich), so we read status from `lab job list --format json` instead.
    proc = run(["lab", "--format", "json", "job", "list"])
    if proc.returncode != 0:
        return None
    try:
        jobs = json.loads(proc.stdout)
    except json.JSONDecodeError:
        return None
    job = next((j for j in jobs if str(j.get("id")) == job_id), None)
    return job.get("status") if job else None


def get_current_experiment() -> Optional[str]:
    """Read `current_experiment` from the CLI config, or None if unset."""
    proc = run(["lab", "config", "get", "current_experiment"])
    if proc.returncode != 0:
        return None
    # The command prints either the raw value or `key: value`. Be lenient.
    out = (proc.stdout or "").strip()
    if not out:
        return None
    if ":" in out:
        out = out.split(":", 1)[1].strip()
    # Treat obvious "unset" markers as None.
    if out.lower() in {"none", "null", "n/a", "-", ""}:
        return None
    return out


def set_current_experiment(value: str) -> None:
    """Set `current_experiment` in the CLI config; exits on failure."""
    proc = run(["lab", "config", "set", "current_experiment", value])
    if proc.returncode != 0:
        print(
            f"!! failed to set current_experiment to '{value}': {proc.stderr or proc.stdout}",
            file=sys.stderr,
        )
        sys.exit(2)


def unset_current_experiment() -> None:
    """Best-effort: clear current_experiment. Only used when there was no prior value."""
    # Fall back to a harmless empty string; some CLI versions may reject this, which is fine.
    run(["lab", "config", "set", "current_experiment", ""])


def resolve_provider_index(name: str) -> int:
    """Resolve a provider name to its 1-based index in `lab provider list` order.

    The interactive `lab task queue` prompt enumerates providers starting from 1
    using the same ordering as `lab provider list`, so we can reuse that number.
    Exits with status 2 if the name is not found.
    """
    proc = run(["lab", "--format", "json", "provider", "list"])
    if proc.returncode != 0:
        print("!! `lab provider list` failed:", proc.stderr, file=sys.stderr)
        sys.exit(2)
    try:
        providers = json.loads(proc.stdout)
    except json.JSONDecodeError:
        print("!! could not parse provider list as JSON:", proc.stdout, file=sys.stderr)
        sys.exit(2)

    for i, p in enumerate(providers, start=1):
        if p.get("name") == name:
            print(f"Resolved provider '{name}' to index {i} (id={p.get('id')}, type={p.get('type')}).")
            return i

    available = ", ".join(p.get("name", "?") for p in providers) or "(none)"
    print(
        f"!! provider '{name}' not found. Available providers: {available}",
        file=sys.stderr,
    )
    sys.exit(2)


# ---- Core flow --------------------------------------------------------------


def header(title: str) -> None:
    print()
    print("=" * 60)
    print(f"  {title}")
    print("=" * 60)


def create_scenarios(tmp_root: Path) -> list[Scenario]:
    pid = os.getpid()
    scenarios: list[Scenario] = []

    # 1. Manual
    s1 = Scenario(name="1-manual", description="Manual (task.yaml only, no source files)")
    s1.directory = tmp_root / "scenario1-manual"
    s1.directory.mkdir(parents=True, exist_ok=True)
    (s1.directory / "task.yaml").write_text(task_yaml_minimal(f"probe-manual-{pid}"))
    scenarios.append(s1)

    # 2. GitHub full
    s2 = Scenario(name="2-github-full", description=f"GitHub full repo ({GITHUB_FULL_REPO})")
    s2.directory = tmp_root / "scenario2-github-full"
    s2.directory.mkdir(parents=True, exist_ok=True)
    (s2.directory / "task.yaml").write_text(task_yaml_github_full(f"probe-gh-full-{pid}"))
    scenarios.append(s2)

    # 3. GitHub subdir
    s3 = Scenario(
        name="3-github-subdir",
        description=f"GitHub subdir ({GITHUB_SUBDIR_REPO} :: {GITHUB_SUBDIR_PATH} @ {GITHUB_SUBDIR_BRANCH})",
    )
    s3.directory = tmp_root / "scenario3-github-subdir"
    s3.directory.mkdir(parents=True, exist_ok=True)
    (s3.directory / "task.yaml").write_text(task_yaml_github_subdir(f"probe-gh-subdir-{pid}"))
    scenarios.append(s3)

    # 4. Upload subdir
    s4 = Scenario(name="4-upload-subdir", description="Upload subdirectory (lab task add ./dir)")
    s4.directory = tmp_root / "scenario4-upload-subdir"
    s4.directory.mkdir(parents=True, exist_ok=True)
    (s4.directory / "task.yaml").write_text(task_yaml_upload(f"probe-upload-subdir-{pid}"))
    (s4.directory / "main.py").write_text(PROBE_MAIN_PY)
    scenarios.append(s4)

    # 5. Upload cwd (same content as #4, but invoke `lab task add .` from inside the dir)
    s5 = Scenario(
        name="5-upload-cwd",
        description="Upload current directory (cd dir && lab task add .)",
        add_from_inside_dir=True,
    )
    s5.directory = tmp_root / "scenario5-upload-cwd"
    s5.directory.mkdir(parents=True, exist_ok=True)
    (s5.directory / "task.yaml").write_text(task_yaml_upload(f"probe-upload-cwd-{pid}"))
    (s5.directory / "main.py").write_text(PROBE_MAIN_PY)
    scenarios.append(s5)

    return scenarios


def add_and_queue(s: Scenario, provider_name: str, provider_index: int) -> None:
    header(f"SCENARIO — {s.description}")
    print(f"Contents of {s.directory}:")
    for item in sorted(s.directory.iterdir()):
        print(f"  {item.name}  ({item.stat().st_size} bytes)")
    print()

    # `lab task add`
    if s.add_from_inside_dir:
        add_proc = run(["lab", "task", "add", ".", "--no-interactive"], cwd=s.directory)
    else:
        add_proc = run(["lab", "task", "add", str(s.directory), "--no-interactive"])

    combined = (add_proc.stdout or "") + "\n" + (add_proc.stderr or "")
    print(combined)
    s.task_id = extract_task_id(combined)
    if not s.task_id:
        s.error = "failed to parse task_id from `lab task add` output"
        print(f"!! {s.error}")
        return
    print(f"task_id = {s.task_id}")

    # `lab task queue` — drive the interactive prompts to pick a specific provider.
    # Prompts (in order):
    #   1. "Use these resource requirements? [Y/n]"  → accept default with "y"
    #   2. "Select a provider [1]:"                   → provider index (1-based)
    # Our task.yamls have no `parameters:` block, so no further prompts appear.
    stdin_input = f"y\n{provider_index}\n"
    print(f"+ lab task queue {s.task_id}   (provider='{provider_name}', index={provider_index})")
    q_proc = subprocess.run(
        ["lab", "task", "queue", s.task_id],
        input=stdin_input,
        capture_output=True,
        text=True,
        check=False,
    )
    q_out = (q_proc.stdout or "") + "\n" + (q_proc.stderr or "")
    print(q_out)
    s.job_id = extract_job_id(q_out)
    if not s.job_id:
        s.job_id = find_latest_job_for_task(s.task_id)
    print(f"job_id = {s.job_id}")


def wait_for_job(s: Scenario) -> None:
    if not s.job_id:
        return
    header(f"WAITING — {s.name}  (job={s.job_id})")
    start = time.monotonic()
    deadline = start + JOB_WAIT_SECS
    last_status = ""
    while time.monotonic() < deadline:
        status = job_status(s.job_id) or "UNKNOWN"
        if status != last_status:
            print(f"  [{int(time.monotonic() - start)}s] status={status}")
            last_status = status
        if status in TERMINAL_STATUSES:
            s.final_status = status
            break
        time.sleep(POLL_INTERVAL)
    else:
        s.final_status = f"TIMEOUT (last seen: {last_status or 'UNKNOWN'})"


def fetch_logs(s: Scenario) -> None:
    if not s.job_id:
        return
    t = run(["lab", "job", "task-logs", s.job_id])
    s.task_logs = (t.stdout or "") + (("\n" + t.stderr) if t.stderr else "")
    m = run(["lab", "job", "machine-logs", s.job_id])
    s.machine_logs = (m.stdout or "") + (("\n" + m.stderr) if m.stderr else "")


def dump_raw_logs(s: Scenario) -> None:
    header(f"RAW LOGS — {s.name}  (job={s.job_id}  status={s.final_status})")
    print("----- lab job task-logs -----")
    print(textwrap.indent(s.task_logs or "(empty)", "  "))
    print("----- lab job machine-logs (tail 80 lines) -----")
    tail = "\n".join((s.machine_logs or "").splitlines()[-80:]) or "(empty)"
    print(textwrap.indent(tail, "  "))


# ---- Probe extraction & verdicts --------------------------------------------

PROBE_BLOCK_RE = re.compile(r"=== PROBE BEGIN.*?=== PROBE END ===", re.DOTALL)


def extract_probe_block(s: Scenario) -> Optional[str]:
    for source in (s.task_logs, s.machine_logs):
        if not source:
            continue
        m = PROBE_BLOCK_RE.search(source)
        if m:
            return m.group(0)
    return None


def probe_field(probe: str, key: str) -> Optional[str]:
    for line in probe.splitlines():
        if line.startswith(f"{key}="):
            return line[len(key) + 1 :].strip()
    return None


def probe_section(probe: str, start_marker: str, end_marker_re: str) -> str:
    """Return text between a 'start' line and the first subsequent line matching end_marker_re."""
    lines = probe.splitlines()
    try:
        start = next(i for i, ln in enumerate(lines) if start_marker in ln)
    except StopIteration:
        return ""
    end_pat = re.compile(end_marker_re)
    for j in range(start + 1, len(lines)):
        if end_pat.search(lines[j]):
            return "\n".join(lines[start + 1 : j])
    return "\n".join(lines[start + 1 :])


def verdict_for(s: Scenario, probe: str) -> list[str]:
    pwd_val = probe_field(probe, "pwd")
    home_val = probe_field(probe, "HOME")
    cwd_ls = probe_section(probe, "--- ls -la of cwd", r"^---")
    home_ls = probe_section(probe, "--- ls -la of $HOME", r"^===")

    lines = [
        f"  pwd   : {pwd_val or '?'}",
        f"  HOME  : {home_val or '?'}",
    ]

    def has(text: str, needle: str, ci: bool = False) -> bool:
        hay = text.lower() if ci else text
        ndl = needle.lower() if ci else needle
        return ndl in hay

    if s.name == "1-manual":
        if has(cwd_ls, "task.yaml"):
            lines.append("  verdict: OK — task.yaml present in cwd; no source files (as expected for inline task).")
        else:
            lines.append("  verdict: UNEXPECTED — task.yaml not visible in cwd. Check the probe above.")

    elif s.name == "2-github-full":
        markers = ["README", "LICENSE", ".git"]
        if any(has(cwd_ls, m, ci=True) for m in markers):
            lines.append("  verdict: OK — repo contents flattened into cwd (README/LICENSE/.git visible).")
        else:
            lines.append("  verdict: UNEXPECTED — repo contents not visible at cwd root. Check the probe above.")

    elif s.name == "3-github-subdir":
        leaf = GITHUB_SUBDIR_PATH.rsplit("/", 1)[-1]
        in_cwd = has(cwd_ls, leaf)
        in_home = has(home_ls, leaf)
        if in_cwd or in_home:
            if pwd_val == home_val and in_cwd and not has(cwd_ls, "task.yaml"):
                lines.append(
                    f"  verdict: OK (with gotcha) — '{leaf}/' is in cwd, but cwd is $HOME; "
                    f"your run command must cd into '{leaf}/'."
                )
            elif in_home and not in_cwd:
                lines.append(
                    f"  verdict: OK (with gotcha) — '{leaf}/' is under $HOME but NOT in cwd; "
                    f"your run command must reference $HOME/{leaf}/."
                )
            else:
                lines.append(f"  verdict: OK — '{leaf}/' found (sparse-checkout landed it as expected).")
        else:
            lines.append(f"  verdict: UNEXPECTED — '{leaf}/' not visible in cwd or $HOME. Check the probe above.")

    elif s.name in {"4-upload-subdir", "5-upload-cwd"}:
        if has(cwd_ls, "task.yaml") and has(cwd_ls, "main.py"):
            lines.append("  verdict: OK — both task.yaml and main.py present at cwd root.")
        else:
            lines.append("  verdict: UNEXPECTED — task.yaml and/or main.py missing at cwd. Check the probe above.")

    return lines


# ---- Main -------------------------------------------------------------------


def list_provider_names() -> list[str]:
    """Best-effort provider name list via `lab --format json provider list`.
    Returns [] if the CLI call fails or the output can't be parsed."""
    try:
        proc = run(["lab", "--format", "json", "provider", "list"])
        if proc.returncode != 0:
            return []
        data = json.loads(proc.stdout)
        return [str(p.get("name", "?")) for p in data if isinstance(p, dict)]
    except (json.JSONDecodeError, FileNotFoundError):
        return []


def _format_available(label: str, names: list[str]) -> str:
    if not names:
        return f"  (could not list available {label} — are you logged in? try `lab status` / `lab login`)"
    return "  " + "\n  ".join(f"- {n}" for n in names)


def parse_args(argv: Optional[list[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Exercise `lab task add` + `lab task queue` across every file-placement scenario.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "The --provider argument is required. The script looks up the provider in\n"
            "`lab provider list` and uses its 1-based index to drive the interactive queue\n"
            "prompts. Run `lab provider list` first to see the available names.\n"
        ),
    )
    # Both args are semantically required, but we validate them manually after
    # parsing so we can enrich the error output with the list of available
    # providers/experiments (argparse's `required=True` errors before we can
    # fetch anything).
    parser.add_argument(
        "--provider",
        default=None,
        help="Name of the compute provider to queue every scenario on (required).",
    )
    parser.add_argument(
        "--experiment",
        default=None,
        help=(
            "Experiment ID/name to use. The script sets `current_experiment` in lab config "
            "to this value for the duration of the run and restores the previous value on exit."
        ),
    )
    return parser.parse_args(argv)


def validate_args_or_exit(args: argparse.Namespace) -> None:
    """If --provider or --experiment is missing, fetch the available options and
    print a helpful error listing them, then exit with status 2."""
    missing = [flag for flag, val in (("--provider", args.provider), ("--experiment", args.experiment)) if not val]
    if not missing:
        return

    print(f"\n!! missing required argument(s): {', '.join(missing)}", file=sys.stderr)
    print(file=sys.stderr)

    if "--provider" in missing:
        print("Available providers (from `lab provider list`):", file=sys.stderr)
        print(_format_available("providers", list_provider_names()), file=sys.stderr)
        print(file=sys.stderr)

    if "--experiment" in missing:
        print(
            "(the `lab` CLI has no command to list experiments; "
            "find yours in the web UI or with `lab config get current_experiment`.)",
            file=sys.stderr,
        )
        print(file=sys.stderr)

    print(
        "Example:\n  python3 scripts/test-task-placement.py --provider <name> --experiment <name>",
        file=sys.stderr,
    )
    sys.exit(2)


def main(argv: Optional[list[str]] = None) -> int:
    args = parse_args(argv)
    validate_args_or_exit(args)

    # Preflight
    header("Preflight: lab status")
    p = run(["lab", "status"], capture=False)
    if p.returncode != 0:
        print("\n!! `lab status` failed. Run `lab login` first.")
        return 2

    header("Preflight: lab config")
    run(["lab", "config"], capture=False)

    # Save the previous current_experiment BEFORE any change so we can restore it
    # unconditionally in the finally block (including on sys.exit paths).
    previous_experiment = get_current_experiment()
    tmp_root: Optional[Path] = None

    try:
        header(f"Setting current_experiment to '{args.experiment}' (was: {previous_experiment!r})")
        set_current_experiment(args.experiment)

        header(f"Resolving provider '{args.provider}'")
        provider_index = resolve_provider_index(args.provider)

        tmp_root = Path(tempfile.mkdtemp(prefix="lab-task-placement-"))
        print(f"\nWorking dir for scenario sources: {tmp_root}")

        scenarios = create_scenarios(tmp_root)

        for s in scenarios:
            add_and_queue(s, args.provider, provider_index)

        for s in scenarios:
            wait_for_job(s)
            fetch_logs(s)

        for s in scenarios:
            dump_raw_logs(s)

        # Summary table
        header("SUMMARY")
        print(f"{'SCENARIO':<20} {'STATUS':<14} {'TASK_ID':<38} JOB_ID")
        for s in scenarios:
            status = s.final_status or ("ERROR: " + s.error if s.error else "-")
            print(f"{s.name:<20} {status:<14} {(s.task_id or '-'):<38} {s.job_id or '-'}")

        # Final report: just the probe blocks + verdicts
        header("FINAL REPORT — file placement on the worker")
        print("For each scenario: the probe block extracted from the job logs,")
        print("followed by a short verdict comparing actual vs. expected placement.")

        for s in scenarios:
            print()
            print("-" * 60)
            print(f"  {s.name}   (task={s.task_id}  job={s.job_id}  status={s.final_status})")
            print("-" * 60)
            if s.error:
                print(f"  (setup error: {s.error})")
                continue
            if not s.job_id:
                print("  (no job was queued — nothing to report)")
                continue
            probe = extract_probe_block(s)
            if not probe:
                print("  (no PROBE block found — job likely failed before the run command executed)")
                print("  See the RAW LOGS section above for this scenario.")
                continue
            print(textwrap.indent(probe, "    "))
            print()
            for line in verdict_for(s, probe):
                print(line)

        header("KEY QUESTION: does pwd match $HOME, or is it the job dir?")
        print("  - If pwd == $HOME for every scenario, you're on a remote provider (SkyPilot/RunPod).")
        print("  - If pwd is a path like .../workspace/jobs/<uuid>, you're on the Local provider.")
        print(f"  - For scenario 3 specifically: expect '{GITHUB_SUBDIR_PATH}' to appear as a child of")
        print("    cwd or $HOME, NOT at cwd root. That's the sparse-checkout gotcha.")
        return 0
    finally:
        # Restore the previous current_experiment so we don't leave the user's CLI in a
        # different state than they left it in.
        if previous_experiment is not None:
            print(f"\nRestoring current_experiment to '{previous_experiment}'.")
            set_current_experiment(previous_experiment)
        else:
            print("\nNo previous current_experiment was set; clearing it.")
            unset_current_experiment()

        # Clean up the scenario source dirs. Set KEEP_TMP=1 to keep them for inspection.
        if tmp_root is not None:
            if os.environ.get("KEEP_TMP") == "1":
                print(f"\nKEEP_TMP=1 — leaving {tmp_root} on disk.")
            else:
                shutil.rmtree(tmp_root, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
