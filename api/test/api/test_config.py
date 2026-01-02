# Update tests to use the shared client fixture
def test_set_config(client):
    response = client.get("/config/set", params={"k": "api_test_key", "v": "test_value"})
    assert response.status_code == 200
    assert response.json() == {"key": "api_test_key", "value": "test_value", "team_wide": True}


def test_get_config(client):
    client.get("/config/set", params={"k": "api_test_key2", "v": "test_value2"})
    response = client.get("/config/get/api_test_key2")
    assert response.status_code == 200
    assert response.json() == "test_value2"
