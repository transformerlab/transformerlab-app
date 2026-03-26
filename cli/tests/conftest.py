"""Shared test fixtures for CLI tests."""

import os
import json
from unittest.mock import MagicMock

import pytest


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
