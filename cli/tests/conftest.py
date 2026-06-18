"""Shared test fixtures for CLI tests."""

import os
import json
from unittest.mock import MagicMock

import pytest


@pytest.fixture(autouse=True)
def _isolate_lab_config_from_user_home(tmp_path, monkeypatch):
    """Point CONFIG_DIR/CONFIG_FILE and CREDENTIALS_DIR/CREDENTIALS_FILE at a
    per-test tmp directory so tests cannot read from — or wipe — the real
    ``~/.lab/config.json`` / ``~/.lab/credentials`` on the developer's machine.

    Applied to every test via ``autouse=True``; any test that needs the raw
    paths can still accept the ``tmp_config_dir`` fixture explicitly.
    """
    fake_lab_dir = tmp_path / "_isolated_lab"
    fake_lab_dir.mkdir(exist_ok=True)
    fake_config_file = str(fake_lab_dir / "config.json")
    fake_credentials_file = str(fake_lab_dir / "credentials")

    import transformerlab_cli.util.config as config_mod
    import transformerlab_cli.util.shared as shared_mod
    import transformerlab_cli.util.profile as profile_mod

    # CONFIG_DIR is the lab home; profile paths derive from it. Pointing it at a tmp dir
    # isolates every profile (default + named) from the developer's real ~/.lab.
    monkeypatch.setattr(shared_mod, "CONFIG_DIR", str(fake_lab_dir))
    monkeypatch.setattr(shared_mod, "CONFIG_FILE", fake_config_file)
    monkeypatch.setattr(shared_mod, "CREDENTIALS_DIR", str(fake_lab_dir))
    monkeypatch.setattr(shared_mod, "CREDENTIALS_FILE", fake_credentials_file)
    monkeypatch.setattr(config_mod, "cached_config", None)
    # Each test starts on the default profile.
    profile_mod.set_active(None)


@pytest.fixture()
def tmp_config_dir(tmp_path):
    """Provide a temporary config directory and patch CONFIG_DIR/CONFIG_FILE."""
    tmp_path_str = str(tmp_path)
    config_dir = os.path.join(tmp_path_str, ".lab")
    os.makedirs(config_dir, exist_ok=True)
    config_file = os.path.join(config_dir, "config.json")
    return config_dir, config_file


@pytest.fixture()
def mock_api_response():
    """Factory to create mock httpx responses."""

    def _make(status_code: int = 200, json_data=None, text: str = ""):
        mock = MagicMock()
        mock.status_code = status_code
        mock.json.return_value = json_data if json_data is not None else {}
        mock.text = text or json.dumps(json_data or {})
        return mock

    return _make
