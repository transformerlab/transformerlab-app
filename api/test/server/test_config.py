import pytest
import requests


def _ensure_first_user(live_server: str) -> None:
    status_resp = requests.get(f"{live_server}/auth/setup/status")
    if status_resp.ok:
        data = status_resp.json()
        if data.get("has_users") is True:
            return

    payload = {
        "email": "admin@example.com",
        "password": "admin123",
        "confirm_password": "admin123",
        "first_name": "Admin",
        "last_name": "User",
    }
    # Best-effort: concurrent test runs might race; treat 409 as acceptable.
    create_resp = requests.post(
        f"{live_server}/auth/setup/create-first-user",
        json=payload,
    )
    if create_resp.status_code not in (200, 201, 409):
        raise RuntimeError(f"Failed to bootstrap first user: {create_resp.status_code}: {create_resp.text}")


@pytest.mark.live_server
def test_set(live_server):
    _ensure_first_user(live_server)
    # Get admin token for authentication
    login_response = requests.post(
        f"{live_server}/auth/jwt/login", data={"username": "admin@example.com", "password": "admin123"}
    )
    assert login_response.status_code == 200, f"Login failed with {login_response.status_code}: {login_response.text}"
    token = login_response.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Get user's team ID
    teams_response = requests.get(f"{live_server}/users/me/teams", headers=headers)
    assert teams_response.status_code == 200
    teams_data = teams_response.json()
    assert "teams" in teams_data and len(teams_data["teams"]) > 0, "User has no teams"
    team_id = teams_data["teams"][0]["id"]
    headers["X-Team-Id"] = team_id

    response = requests.get(f"{live_server}/config/set", params={"k": "message", "v": "Hello, World!"}, headers=headers)
    assert response.status_code == 200
    assert response.json() == {"key": "message", "value": "Hello, World!", "team_wide": True}


@pytest.mark.live_server
def test_get(live_server):
    _ensure_first_user(live_server)
    # Get admin token for authentication
    login_response = requests.post(
        f"{live_server}/auth/jwt/login", data={"username": "admin@example.com", "password": "admin123"}
    )
    assert login_response.status_code == 200, f"Login failed with {login_response.status_code}: {login_response.text}"
    token = login_response.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Get user's team ID
    teams_response = requests.get(f"{live_server}/users/me/teams", headers=headers)
    assert teams_response.status_code == 200
    teams_data = teams_response.json()
    assert "teams" in teams_data and len(teams_data["teams"]) > 0, "User has no teams"
    team_id = teams_data["teams"][0]["id"]
    headers["X-Team-Id"] = team_id

    response = requests.get(f"{live_server}/config/get/message", headers=headers)
    assert response.status_code == 200
    assert response.json() == "Hello, World!"
