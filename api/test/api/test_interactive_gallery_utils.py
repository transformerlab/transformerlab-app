"""Tests for interactive gallery command resolution (resolve_interactive_command, find_interactive_gallery_entry)."""

from transformerlab.shared.interactive_gallery_utils import (
    resolve_interactive_command,
    find_interactive_gallery_entry,
)


# ---- resolve_interactive_command: legacy (no commands field) ----
def test_resolve_legacy_entry_remote():
    """Legacy entry without 'commands' uses top-level command and no setup override."""
    entry = {"id": "jupyter", "command": "jupyter lab --port=8888", "setup": "pip install jupyter"}
    cmd, setup = resolve_interactive_command(entry, "remote")
    assert cmd == "jupyter lab --port=8888"
    assert setup is None


def test_resolve_legacy_entry_local():
    """Legacy entry: local environment still gets legacy command when no commands.local."""
    entry = {"id": "jupyter", "command": "jupyter lab --port=8888"}
    cmd, setup = resolve_interactive_command(entry, "local")
    assert cmd == "jupyter lab --port=8888"
    assert setup is None


# ---- resolve_interactive_command: logic (preferred); commands.local/remote no longer supported ----
def test_resolve_logic_remote_uses_core_tunnel_and_tail():
    """logic.{core,tunnel,tail_logs} are composed for remote; tunnel included."""
    entry = {
        "id": "jupyter",
        "interactive_type": "jupyter",
        "logic": {
            "core": "start-core",
            "tunnel": "start-tunnel",
            "tail_logs": "tail-logs",
        },
        "command": "legacy",
    }
    cmd, setup = resolve_interactive_command(entry, "remote")
    assert cmd == "start-core; start-tunnel; tail-logs"
    assert setup is None


def test_resolve_logic_local_omits_tunnel_adds_echo():
    """logic is used for local too; tunnel omitted, local URL echo for known types, ngrok stripped from tail."""
    entry = {
        "id": "jupyter",
        "interactive_type": "jupyter",
        "logic": {
            "core": "start-core",
            "tunnel": "start-tunnel",
            "tail_logs": "tail -f /tmp/jupyter.log /tmp/ngrok.log",
        },
    }
    cmd, setup = resolve_interactive_command(entry, "local")
    assert "start-core" in cmd
    assert "start-tunnel" not in cmd
    assert "Local URL: http://localhost:8888" in cmd
    assert "/tmp/ngrok.log" not in cmd
    assert setup is None


def test_resolve_legacy_command_when_no_logic():
    """When entry has no logic, top-level command is used (commands.local/remote ignored)."""
    entry = {
        "command": "legacy-cmd",
        "setup": "legacy-setup",
        "commands": {"local": {"default": "local-cmd"}, "remote": {"default": "remote-cmd"}},
    }
    cmd, setup = resolve_interactive_command(entry, "remote")
    assert cmd == "legacy-cmd"
    assert setup is None
    cmd2, _ = resolve_interactive_command(entry, "local")
    assert cmd2 == "legacy-cmd"


# ---- find_interactive_gallery_entry ----
def test_find_entry_by_id():
    """find_interactive_gallery_entry returns entry matching interactive_gallery_id."""
    gallery = [
        {"id": "jupyter", "interactive_type": "jupyter"},
        {"id": "vllm", "interactive_type": "vllm"},
    ]
    found = find_interactive_gallery_entry(gallery, interactive_gallery_id="vllm")
    assert found is not None
    assert found["id"] == "vllm"


def test_find_entry_by_interactive_type():
    """find_interactive_gallery_entry falls back to interactive_type when id not found."""
    gallery = [
        {"id": "jupyter", "interactive_type": "jupyter"},
        {"id": "vllm", "interactive_type": "vllm"},
    ]
    found = find_interactive_gallery_entry(gallery, interactive_type="vllm")
    assert found is not None
    assert found["interactive_type"] == "vllm"


def test_find_entry_id_takes_precedence():
    """When both id and interactive_type are given, id is used first."""
    gallery = [
        {"id": "ollama", "interactive_type": "ollama"},
        {"id": "ollama-macos", "interactive_type": "ollama"},
    ]
    found = find_interactive_gallery_entry(gallery, interactive_gallery_id="ollama-macos", interactive_type="ollama")
    assert found is not None
    assert found["id"] == "ollama-macos"


def test_find_entry_empty_list_returns_none():
    """Empty gallery returns None."""
    assert find_interactive_gallery_entry([], interactive_gallery_id="jupyter") is None
    assert find_interactive_gallery_entry([], interactive_type="jupyter") is None


def test_find_entry_not_found_returns_none():
    """When no entry matches, returns None."""
    gallery = [{"id": "jupyter", "interactive_type": "jupyter"}]
    assert find_interactive_gallery_entry(gallery, interactive_gallery_id="nonexistent") is None
    assert find_interactive_gallery_entry(gallery, interactive_type="vllm") is None
