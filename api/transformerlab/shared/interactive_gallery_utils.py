"""
Utilities for resolving interactive gallery commands by environment (local/remote).
See galleries.py for the interactive gallery schema documentation.
"""

import re
from typing import Any, Optional, Tuple

# Prepended to interactive remote setup in the launch route so $SUDO is defined
# without putting that logic in the gallery JSON. Setup content stays in the gallery.
INTERACTIVE_SUDO_PREFIX = (
    'SUDO=""; if [ "$(id -u)" -ne 0 ]; then SUDO="sudo"; fi; export DEBIAN_FRONTEND=noninteractive;'
)

# Shell command to install ngrok (Debian/Bookworm). Uses $SUDO from INTERACTIVE_SUDO_PREFIX.
NGROK_INSTALL_CMD = (
    "command -v ngrok >/dev/null 2>&1 || (curl -sSL https://ngrok-agent.s3.amazonaws.com/ngrok.asc | $SUDO tee "
    '/etc/apt/trusted.gpg.d/ngrok.asc >/dev/null && echo "deb https://ngrok-agent.s3.amazonaws.com bookworm main" | '
    "$SUDO tee /etc/apt/sources.list.d/ngrok.list && $SUDO apt-get update && $SUDO apt-get install -y ngrok)"
)


def _sanitize_tunnel_name(label: Optional[str], port: int) -> str:
    """Return a safe YAML key for a tunnel: from label or port_<port>."""
    if label and isinstance(label, str) and label.strip():
        # Lowercase, replace non-alphanumeric with underscore
        safe = re.sub(r"[^a-z0-9]+", "_", label.strip().lower()).strip("_")
        if safe:
            return safe
    return f"port_{port}"


def build_ngrok_tunnel_command(entry_id: str, ports: list[dict[str, Any]]) -> str:
    """
    Build the full ngrok tunnel shell command (install + auth + YAML + start).
    Uses ngrok v2 config with one tunnel per port; supports single or multiple ports.
    """
    if not ports:
        return ""

    install_and_auth = f"{NGROK_INSTALL_CMD}; ngrok config add-authtoken $NGROK_AUTH_TOKEN"

    config_path = f"~/ngrok-{entry_id}.yml"
    yaml_lines = ["version: 2", "authtoken: $NGROK_AUTH_TOKEN", "tunnels:"]

    for p in ports:
        port_val = p.get("port") if isinstance(p, dict) else None
        if port_val is None:
            continue
        try:
            port_num = int(port_val)
        except (TypeError, ValueError):
            continue
        protocol = "http"
        if isinstance(p, dict) and isinstance(p.get("protocol"), str):
            protocol = p.get("protocol", "http").strip().lower() or "http"
        if protocol != "tcp":
            protocol = "http"
        label = p.get("label") if isinstance(p, dict) else None
        name = _sanitize_tunnel_name(label, port_num)
        yaml_lines.append(f"  {name}:")
        yaml_lines.append(f"    proto: {protocol}")
        yaml_lines.append(f"    addr: {port_num}")

    # Build printf args: each line single-quoted; authtoken line must expand $NGROK_AUTH_TOKEN
    printf_parts = ["printf '%s\\n'"]
    for i, line in enumerate(yaml_lines):
        if line == "authtoken: $NGROK_AUTH_TOKEN":
            printf_parts.append("'authtoken: '\"$NGROK_AUTH_TOKEN\"")
        else:
            escaped = line.replace("'", "'\"'\"'")
            printf_parts.append(f"'{escaped}'")
    printf_cmd = " ".join(printf_parts) + f" > {config_path}"
    # Run ngrok in the background so task-level run commands can continue uninterrupted.
    # Wrap in a subshell so callers can safely append `; <next command>` without producing `&;`.
    start_cmd = f"(ngrok start --all --config {config_path} --log=stdout > /tmp/ngrok.log 2>&1 &)"

    return f"{install_and_auth}; {printf_cmd} && {start_cmd}"


def _compose_command_from_logic(
    logic: dict,
    interactive_type: str,
    environment: str,
    template_entry: Optional[dict] = None,
) -> Optional[str]:
    """
    Compose a command from the logic block:
      - core: required
      - tunnel: optional
      - tail_logs: optional

    The caller chooses environment:
      - local: tunnel is omitted
      - remote: tunnel is included if present
    """
    core = logic.get("core")
    if not isinstance(core, str) or not core.strip():
        return None

    tail_logs = logic.get("tail_logs")

    parts: list[str] = []

    def _clean(fragment: Optional[str]) -> Optional[str]:
        if not isinstance(fragment, str):
            return None
        cleaned = fragment.strip().rstrip(";").strip()
        return cleaned or None

    def _local_url_echo(t: str) -> Optional[str]:
        # These echoed lines are parsed by tunnel_parser for local provider UX.
        if t == "jupyter":
            return "echo 'Local URL: http://localhost:8888'"
        if t == "vllm":
            return "echo 'Local vLLM API: http://localhost:8000'; echo 'Local Open WebUI: http://localhost:8080'"
        if t == "ollama":
            return "echo 'Local Ollama API: http://localhost:11434'; echo 'Local Open WebUI: http://localhost:8080'"
        return None

    def _strip_ngrok_log_from_tail(cmd: str) -> str:
        # Best-effort: if tail command includes /tmp/ngrok.log, remove it for local runs.
        stripped = cmd
        if stripped.startswith("tail -f ") or stripped.startswith("tail -F "):
            tokens = stripped.split()
            # tokens like: ["tail","-f","/tmp/a.log","/tmp/ngrok.log"]
            kept = [tok for tok in tokens if tok != "/tmp/ngrok.log"]
            stripped = " ".join(kept)
        return stripped

    core_clean = _clean(core)
    if not core_clean:
        return None
    parts.append(core_clean)

    if environment == "local":
        echo_cmd = _local_url_echo(interactive_type)
        if echo_cmd:
            parts.append(echo_cmd)

    # For remote interactive jobs, auto-start ngrok whenever ports are defined.
    if environment == "remote" and template_entry:
        entry_id = template_entry.get("id") or "default"
        ports = template_entry.get("ports") or []
        if isinstance(ports, list) and ports:
            ngrok_cmd = build_ngrok_tunnel_command(entry_id, ports)
            if ngrok_cmd:
                parts.append(ngrok_cmd)

    tail_clean = _clean(tail_logs)
    if tail_clean:
        if environment == "local":
            tail_clean = _strip_ngrok_log_from_tail(tail_clean)
            if tail_clean.strip() in {"tail", "tail -f", "tail -F"}:
                tail_clean = ""
        parts.append(tail_clean)

    parts = [p for p in parts if isinstance(p, str) and p.strip()]
    if not parts:
        return None
    return "; ".join(parts)


def resolve_interactive_command(
    template_entry: dict,
    environment: str,
    base_command: str = "",
) -> Tuple[str, Optional[str]]:
    """
    Resolve the run command and optional setup override for an interactive template
    based on environment (local/remote).

    Args:
        template_entry: One entry from the interactive gallery (e.g. from get_interactive_gallery).
        environment: "local" or "remote".
        base_command: Existing run command already resolved from task data (e.g. task.yaml run).

    Returns:
        (command, setup_override). setup_override is None if the entry-level "setup"
        should be used; otherwise the caller should use setup_override for this run.
    """
    env = "local" if environment == "local" else "remote"
    interactive_type = str(template_entry.get("interactive_type") or template_entry.get("id") or "").strip()

    logic = template_entry.get("logic")
    if isinstance(logic, dict):
        composed = _compose_command_from_logic(logic, interactive_type, env, template_entry)
        if composed:
            return (composed, None)

    # Fallback path: compose from existing command (task.yaml run) or legacy top-level command.
    resolved_base = (base_command or "").strip() or str(template_entry.get("command", "") or "").strip()
    if env == "remote":
        entry_id = template_entry.get("id") or "default"
        ports = template_entry.get("ports") or []
        if isinstance(ports, list) and ports:
            ngrok_cmd = build_ngrok_tunnel_command(entry_id, ports)
            if ngrok_cmd:
                if resolved_base:
                    return (f"{ngrok_cmd}; {resolved_base}", None)
                return (ngrok_cmd, None)

    return (resolved_base, None)


def find_interactive_gallery_entry(
    gallery_list: list,
    interactive_gallery_id: Optional[str] = None,
) -> Optional[dict]:
    """
    Find one interactive gallery entry by its unique id.

    Args:
        gallery_list: Result of get_interactive_gallery().
        interactive_gallery_id: Entry id (e.g. "jupyter", "ollama_gradio").

    Returns:
        The gallery entry dict or None if not found.
    """
    if not gallery_list or not interactive_gallery_id:
        return None
    for entry in gallery_list:
        if entry.get("id") == interactive_gallery_id:
            return entry
    return None
