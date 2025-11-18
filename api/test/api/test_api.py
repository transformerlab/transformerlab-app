def test_root(client):
    response = client.get("/")
    assert response.status_code == 200
