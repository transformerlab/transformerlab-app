"""Tests for the browser-login loopback server."""

import json
import threading
import time
from unittest.mock import patch

import httpx
import pytest

from transformerlab_cli.util.browser_login import run_browser_login, BrowserLoginError


def _post_callback(port: int, state: str, payload: dict) -> httpx.Response:
    return httpx.post(
        f"http://127.0.0.1:{port}/callback",
        json={"state": state, **payload},
        timeout=5.0,
    )


def test_happy_path_returns_key_and_team():
    """Browser flow returns api_key, team_id, team_name on valid callback."""
    captured = {}

    def fake_open(url: str) -> bool:
        # Parse the port out of the redirect param and POST the callback.
        from urllib.parse import urlparse, parse_qs

        qs = parse_qs(urlparse(url).fragment.split("?", 1)[1])
        state = qs["state"][0]
        redirect = qs["redirect"][0]
        port = int(urlparse(redirect).port)
        captured["state"] = state
        captured["port"] = port

        def deliver():
            time.sleep(0.1)  # let the server start accepting
            _post_callback(
                port,
                state,
                {"key": "tlab_xxx", "team_id": "t1", "team_name": "Team One"},
            )

        threading.Thread(target=deliver, daemon=True).start()
        return True

    with patch("transformerlab_cli.util.browser_login.webbrowser.open", side_effect=fake_open):
        result = run_browser_login(server_url="http://localhost:8338", timeout=5)

    assert result == {"api_key": "tlab_xxx", "team_id": "t1", "team_name": "Team One"}


def test_state_mismatch_returns_400_and_keeps_waiting():
    """A POST with the wrong state must return 400 and not unblock the CLI."""
    delivered = {}

    def fake_open(url: str) -> bool:
        from urllib.parse import urlparse, parse_qs

        qs = parse_qs(urlparse(url).fragment.split("?", 1)[1])
        port = int(urlparse(qs["redirect"][0]).port)

        def deliver():
            time.sleep(0.1)
            r = _post_callback(port, "WRONG_STATE", {"key": "tlab_x", "team_id": "t1", "team_name": "T"})
            delivered["status"] = r.status_code

        threading.Thread(target=deliver, daemon=True).start()
        return True

    with patch("transformerlab_cli.util.browser_login.webbrowser.open", side_effect=fake_open):
        with pytest.raises(BrowserLoginError, match="timed out"):
            run_browser_login(server_url="http://localhost:8338", timeout=1)

    assert delivered["status"] == 400


def test_timeout_raises():
    """If no callback arrives, the call raises a timeout error."""
    with patch("transformerlab_cli.util.browser_login.webbrowser.open", return_value=True):
        with pytest.raises(BrowserLoginError, match="timed out"):
            run_browser_login(server_url="http://localhost:8338", timeout=1)


def test_no_browser_prints_url_and_does_not_call_webbrowser():
    """open_browser=False must skip webbrowser.open and print the URL."""
    printed = []

    def fake_print(*args, **kwargs):
        printed.append(" ".join(str(a) for a in args))

    with (
        patch("transformerlab_cli.util.browser_login.webbrowser.open") as m_open,
        patch("transformerlab_cli.util.browser_login.console.print", side_effect=fake_print),
    ):
        with pytest.raises(BrowserLoginError, match="timed out"):
            run_browser_login(server_url="http://localhost:8338", open_browser=False, timeout=1)

    assert m_open.call_count == 0
    assert any("/#/cli-auth?" in line for line in printed)
