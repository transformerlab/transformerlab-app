# NOTE: Uses the synchronous `client` fixture from api/test/api/conftest.py.
# The fixture provides an AuthenticatedTestClient (sync TestClient) that automatically
# adds Bearer token + X-Team-Id headers. Experiments are created inline per test using
# GET /experiment/create?name=<unique_name>, matching the pattern in test_documents.py
# and test_experiment_jobs.py.

import time


def _create_experiment(client) -> str:
    unique_name = f"test_share_{int(time.time() * 1000)}"
    resp = client.get(f"/experiment/create?name={unique_name}")
    assert resp.status_code == 200
    return resp.json()


def test_get_active_returns_null_initially(client):
    experiment_id = _create_experiment(client)
    r = client.get(f"/experiment/{experiment_id}/share/notes")
    assert r.status_code == 200
    assert r.json() is None


def test_post_mints_link(client):
    experiment_id = _create_experiment(client)
    r = client.post(f"/experiment/{experiment_id}/share/notes")
    assert r.status_code == 200
    body = r.json()
    assert body["token"]
    assert body["url"].endswith(f"/#/public/share/{body['token']}")


def test_post_twice_yields_new_token(client):
    experiment_id = _create_experiment(client)
    a = client.post(f"/experiment/{experiment_id}/share/notes").json()
    b = client.post(f"/experiment/{experiment_id}/share/notes").json()
    assert a["token"] != b["token"]


def test_delete_revokes(client):
    experiment_id = _create_experiment(client)
    client.post(f"/experiment/{experiment_id}/share/notes")
    r = client.delete(f"/experiment/{experiment_id}/share/notes")
    assert r.status_code == 200
    r2 = client.get(f"/experiment/{experiment_id}/share/notes")
    assert r2.json() is None


def test_chart_kind_works_the_same(client):
    experiment_id = _create_experiment(client)
    r = client.post(f"/experiment/{experiment_id}/share/chart")
    assert r.status_code == 200
    assert r.json()["token"]


def test_unknown_kind_returns_404_or_422(client):
    experiment_id = _create_experiment(client)
    r = client.post(f"/experiment/{experiment_id}/share/logs")
    assert r.status_code in (400, 404, 422)
