def test_prompts_list(client):
    resp = client.get("/prompts/list")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list) or isinstance(resp.json(), dict)


def test_prompts_dummy(client):
    resp = client.get("/prompts/list?prompt_id=dummy")
    assert resp.status_code in (200, 400, 404)
