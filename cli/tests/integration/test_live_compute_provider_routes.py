"""Live API smoke tests for CLI compute-provider routes.

These tests run against a real server and validate the route contract that CLI commands rely on.
They are skipped by default unless TLAB_RUN_LIVE_SERVER_TESTS=1 is set.
"""

import os
import uuid

import httpx
import pytest


RUN_LIVE_TESTS = os.getenv("TLAB_RUN_LIVE_SERVER_TESTS") == "1"
BASE_URL = os.getenv("TLAB_LIVE_SERVER_URL", "http://127.0.0.1:8338").rstrip("/")
LOGIN_EMAIL = os.getenv("TLAB_LIVE_TEST_EMAIL", "admin@example.com")
LOGIN_PASSWORD = os.getenv("TLAB_LIVE_TEST_PASSWORD", "admin123")


pytestmark = pytest.mark.skipif(not RUN_LIVE_TESTS, reason="Set TLAB_RUN_LIVE_SERVER_TESTS=1 to run live tests")


def _auth_headers(client: httpx.Client) -> dict[str, str]:
    login_response = client.post(
        f"{BASE_URL}/auth/jwt/login",
        data={"username": LOGIN_EMAIL, "password": LOGIN_PASSWORD},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert login_response.status_code == 200, login_response.text

    token = login_response.json()["access_token"]
    auth_headers = {"Authorization": f"Bearer {token}"}

    teams_response = client.get(f"{BASE_URL}/users/me/teams", headers=auth_headers)
    assert teams_response.status_code == 200, teams_response.text

    teams_payload = teams_response.json()
    teams_list: list[dict]
    if isinstance(teams_payload, list):
        teams_list = teams_payload
    elif isinstance(teams_payload, dict):
        # Different API versions can return a wrapped object.
        if isinstance(teams_payload.get("teams"), list):
            teams_list = teams_payload["teams"]
        elif isinstance(teams_payload.get("data"), list):
            teams_list = teams_payload["data"]
        else:
            teams_list = []
    else:
        teams_list = []

    assert teams_list, f"Expected at least one team for the test user, got: {teams_payload!r}"
    team_id = teams_list[0]["id"]

    return {**auth_headers, "X-Team-Id": str(team_id)}


def test_cli_compute_provider_route_contract_live_server() -> None:
    """Smoke test all compute-provider routes used by CLI provider/task commands."""
    provider_id: str | None = None

    with httpx.Client(timeout=30.0) as client:
        headers = _auth_headers(client)

        list_response = client.get(f"{BASE_URL}/compute_provider/providers/?include_disabled=false", headers=headers)
        assert list_response.status_code == 200, list_response.text

        create_payload = {
            "name": f"cli-route-smoke-{uuid.uuid4().hex[:8]}",
            "type": "local",
            "config": {},
        }
        create_response = client.post(f"{BASE_URL}/compute_provider/providers/", headers=headers, json=create_payload)
        assert create_response.status_code == 200, create_response.text
        provider_id = create_response.json().get("id")
        assert provider_id, "Provider create response did not include id"

        info_response = client.get(f"{BASE_URL}/compute_provider/providers/{provider_id}", headers=headers)
        assert info_response.status_code == 200, info_response.text

        disable_response = client.patch(
            f"{BASE_URL}/compute_provider/providers/{provider_id}",
            headers=headers,
            json={"disabled": True},
        )
        assert disable_response.status_code == 200, disable_response.text

        enable_response = client.patch(
            f"{BASE_URL}/compute_provider/providers/{provider_id}",
            headers=headers,
            json={"disabled": False},
        )
        assert enable_response.status_code == 200, enable_response.text

        # CLI launch uses this endpoint. A minimal payload should still bind to the route
        # even if the body is rejected with validation (422).
        launch_response = client.post(
            f"{BASE_URL}/compute_provider/providers/{provider_id}/launch/",
            headers=headers,
            json={},
        )
        assert launch_response.status_code in {200, 202, 400, 422}, launch_response.text

        delete_response = client.delete(f"{BASE_URL}/compute_provider/providers/{provider_id}", headers=headers)
        assert delete_response.status_code == 200, delete_response.text
        provider_id = None

    # Best-effort cleanup if assertions fail mid-test.
    if provider_id:
        with httpx.Client(timeout=30.0) as client:
            headers = _auth_headers(client)
            client.delete(f"{BASE_URL}/compute_provider/providers/{provider_id}", headers=headers)
