import pytest
import requests


@pytest.mark.live_server
def test_server_info(live_server):
    # Get admin token for authentication
    login_response = requests.post(
        f"{live_server}/auth/jwt/login",
        data={"username": "admin@localhost", "password": "admin123"}
    )
    assert login_response.status_code == 200
    token = login_response.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    response = requests.get(f"{live_server}/server/info", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)
    assert "cpu" in data
    assert "memory" in data and isinstance(data["memory"], dict)
    assert "disk" in data and isinstance(data["disk"], dict)
    assert "gpu" in data
    # Check memory fields
    mem = data["memory"]
    for key in ("total", "available", "percent", "used", "free"):
        assert key in mem
    # Check disk fields
    disk = data["disk"]
    for key in ("total", "used", "free", "percent"):
        assert key in disk


@pytest.mark.live_server
def test_server_python_libraries(live_server):
    # Get admin token for authentication
    login_response = requests.post(
        f"{live_server}/auth/jwt/login",
        data={"username": "admin@localhost", "password": "admin123"}
    )
    assert login_response.status_code == 200
    token = login_response.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    response = requests.get(f"{live_server}/server/python_libraries", headers=headers)
    assert response.status_code == 200
    data = response.json()
    # assert it is an array of {"name": "package_name", "version": "version_number"} type things
    assert isinstance(data, list)
    assert len(data) > 0
    for package in data:
        assert isinstance(package, dict)
        assert "name" in package and isinstance(package["name"], str) and package["name"]
        assert "version" in package and isinstance(package["version"], str) and package["version"]


@pytest.mark.live_server
def test_server_pytorch_collect_env(live_server):
    # Get admin token for authentication
    login_response = requests.post(
        f"{live_server}/auth/jwt/login",
        data={"username": "admin@localhost", "password": "admin123"}
    )
    assert login_response.status_code == 200
    token = login_response.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    response = requests.get(f"{live_server}/server/pytorch_collect_env", headers=headers)
    assert response.status_code == 200
    data = response.text
    assert "PyTorch" in data
