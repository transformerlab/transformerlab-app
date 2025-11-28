import pytest
import requests


@pytest.mark.live_server
def test_set(live_server):
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
    assert response.json() == {"key": "message", "value": "Hello, World!"}


@pytest.mark.live_server
def test_get(live_server):
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
