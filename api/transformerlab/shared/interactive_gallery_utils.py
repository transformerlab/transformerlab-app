"""
Utilities for resolving interactive gallery commands by environment (local/remote).
See galleries.py for the interactive gallery schema documentation.
"""

from typing import Optional, Tuple

# Prepended to interactive remote setup in the launch route so $SUDO is defined
# without putting that logic in the gallery JSON. Setup content stays in the gallery.
INTERACTIVE_SUDO_PREFIX = (
    'SUDO=""; if [ "$(id -u)" -ne 0 ]; then SUDO="sudo"; fi; export DEBIAN_FRONTEND=noninteractive;'
)


def _compose_command_from_logic(
    logic: dict,
    interactive_type: str,
    environment: str,
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

    tunnel = logic.get("tunnel")
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

    # Only include tunnel logic for remote environments
    if environment == "remote":
        tunnel_clean = _clean(tunnel)
        if tunnel_clean:
            parts.append(tunnel_clean)

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
) -> Tuple[str, Optional[str]]:
    """
    Resolve the run command and optional setup override for an interactive template
    based on environment (local/remote).

    Args:
        template_entry: One entry from the interactive gallery (e.g. from get_interactive_gallery).
        environment: "local" or "remote".

    Returns:
        (command, setup_override). setup_override is None if the entry-level "setup"
        should be used; otherwise the caller should use setup_override for this run.
    """
    env = "local" if environment == "local" else "remote"
    interactive_type = str(template_entry.get("interactive_type") or template_entry.get("id") or "").strip()

    logic = template_entry.get("logic")
    if isinstance(logic, dict):
        composed = _compose_command_from_logic(logic, interactive_type, env)
        if composed:
            return (composed, None)

    # Final fallback: legacy top-level command only (no setup override)
    legacy_command = template_entry.get("command", "")
    return (legacy_command or "", None)


def find_interactive_gallery_entry(
    gallery_list: list,
    interactive_gallery_id: Optional[str] = None,
    interactive_type: Optional[str] = None,
) -> Optional[dict]:
    """
    Find one interactive gallery entry by id or by interactive_type.
    Used at launch time to re-resolve the template for command resolution.

    Args:
        gallery_list: Result of get_interactive_gallery().
        interactive_gallery_id: Preferred: entry id (e.g. "jupyter", "ollama-macos").
        interactive_type: Fallback: first entry with this interactive_type.

    Returns:
        The gallery entry dict or None if not found.
    """
    if not gallery_list:
        return None
    if interactive_gallery_id:
        for entry in gallery_list:
            if entry.get("id") == interactive_gallery_id:
                return entry
    if interactive_type:
        for entry in gallery_list:
            if entry.get("interactive_type") == interactive_type:
                return entry
    return None
