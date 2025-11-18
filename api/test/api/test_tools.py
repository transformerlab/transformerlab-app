def test_tools_list(client):
    resp = client.get("/tools/list")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list) or isinstance(resp.json(), dict)


def test_tools_all(client):
    resp = client.get("/tools/all")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_tools_install_mcp_server_invalid_file(client):
    resp = client.get("/tools/install_mcp_server?server_name=/not/a/real/path.py")
    assert resp.status_code == 403
    assert resp.json()["status"] == "error"
