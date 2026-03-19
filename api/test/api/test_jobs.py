import time
import pytest


@pytest.fixture
def fake_cancel_check_factory():
    # Returns a cancel_check that cancels after a few calls
    call_count = {"value": 0}

    def fake_cancel_check():
        call_count["value"] += 1
        time.sleep(0.2)  # simulate polling delay
        return call_count["value"] >= 3

    return fake_cancel_check


def test_jobs_list(client):
    resp = client.get("/experiment/1/jobs/list")
    assert resp.status_code in (200, 404)


def test_jobs_delete_all(client):
    resp = client.get("/experiment/1/jobs/delete_all")
    assert resp.status_code == 200
    data = resp.json()
    assert "message" in data or data == []
    if "message" in data:
        assert isinstance(data["message"], str)


def test_jobs_get_by_id(client):
    resp = client.get("/experiment/1/jobs/1")
    assert resp.status_code in (200, 404)


def test_jobs_delete_by_id(client):
    resp = client.get("/experiment/1/jobs/delete/1")
    assert resp.status_code in (200, 404)


def test_jobs_get_template(client):
    resp = client.get("/experiment/1/jobs/template/1")
    assert resp.status_code in (200, 404)
