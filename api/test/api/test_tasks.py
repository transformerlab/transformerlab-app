import pytest

pytestmark = pytest.mark.skip("skipping these as they need to be fixed")


def test_tasks_list(client):
    resp = client.get("/tasks/list")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list) or isinstance(resp.json(), dict)


def test_tasks_get_by_id(client):
    resp = client.get("/tasks/1/get")
    assert resp.status_code in (200, 404)


def test_tasks_list_by_type(client):
    resp = client.get("/tasks/list_by_type?type=TRAIN")
    assert resp.status_code in (200, 404)


def test_add_task(client):
    new_task = {
        "name": "Test Task",
        "type": "TRAIN",
        "inputs": "{}",
        "config": "{}",
        "plugin": "test_plugin",
        "outputs": "{}",
        "experiment_id": 1,
    }
    resp = client.put("/tasks/new_task", json=new_task)
    assert resp.status_code == 200
    assert "message" in resp.json() or "status" in resp.json()


def test_update_task(client):
    update_data = {"name": "Updated Task", "inputs": "{}", "config": "{}", "outputs": "{}"}
    resp = client.put("/tasks/1/update", json=update_data)
    assert resp.status_code == 200
    assert resp.json()["message"] == "OK"


def test_list_by_type_in_experiment(client):
    resp = client.get("/tasks/list_by_type_in_experiment?type=TRAIN&experiment_id=1")
    assert resp.status_code in (200, 404)


def test_delete_task(client):
    resp = client.get("/tasks/1/delete")
    assert resp.status_code == 200
    assert resp.json()["message"] == "OK"


def test_delete_all_tasks(client):
    resp = client.get("/tasks/delete_all")
    assert resp.status_code == 200
    assert resp.json()["message"] == "OK"
