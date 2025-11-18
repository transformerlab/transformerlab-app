import pytest
import requests


@pytest.mark.live_server
def test_set(live_server):
    response = requests.get(f"{live_server}/config/set", params={"k": "message", "v": "Hello, World!"})
    assert response.status_code == 200
    assert response.json() == {"key": "message", "value": "Hello, World!"}


@pytest.mark.live_server
def test_get(live_server):
    response = requests.get(f"{live_server}/config/get/message")
    assert response.status_code == 200
    assert response.json() == "Hello, World!"
