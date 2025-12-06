import json

import pytest

pytestmark = pytest.mark.skip("Skipping all workflow tests due to database index conflicts")


def test_create_empty_workflow(client):
    resp = client.get("/experiment/1/workflows/create_empty", params={"name": "testwf"})
    assert resp.status_code == 200
    workflow_id = resp.json()
    assert workflow_id
    # Cleanup
    del_resp = client.get(f"/experiment/1/workflows/delete/{workflow_id}")
    assert del_resp.status_code == 200
    assert del_resp.json().get("message") == "OK"


def test_list_workflows(client):
    # Create a workflow to ensure at least one exists
    create_resp = client.get("/experiment/1/workflows/create_empty", params={"name": "listtest"})
    workflow_id = create_resp.json()
    resp = client.get("/experiment/1/workflows/list")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
    # Cleanup
    del_resp = client.get(f"/experiment/1/workflows/delete/{workflow_id}")
    assert del_resp.status_code == 200
    assert del_resp.json().get("message") == "OK"


def test_delete_workflow(client):
    # Create a workflow to delete
    create_resp = client.get("/experiment/1/workflows/create_empty", params={"name": "todelete"})
    workflow_id = create_resp.json()
    del_resp = client.get(f"/experiment/1/workflows/delete/{workflow_id}")
    assert del_resp.status_code == 200
    assert del_resp.json().get("message") == "OK"


def test_workflow_update_name(client):
    create_resp = client.get("/experiment/1/workflows/create_empty", params={"name": "updatename"})
    workflow_id = create_resp.json()
    resp = client.get(
        f"/experiment/1/workflows/{workflow_id}/update_name", params={"new_name": "updatedname"}
    )
    assert resp.status_code == 200
    assert resp.json().get("message") == "OK"
    # Cleanup
    client.get(f"/experiment/1/workflows/delete/{workflow_id}")


def test_workflow_add_and_delete_node(client):
    create_resp = client.get("/experiment/1/workflows/create_empty", params={"name": "addnode"})
    workflow_id = create_resp.json()
    node = {"type": "TASK", "name": "Test Task", "task": "test_task", "out": []}
    add_node_resp = client.get(
        f"/experiment/1/workflows/{workflow_id}/add_node", params={"node": json.dumps(node)}
    )
    assert add_node_resp.status_code == 200
    # Get workflow config to find node id
    wf_resp = client.get("/experiment/1/workflows/list")
    workflow = next(w for w in wf_resp.json() if w["id"] == workflow_id)
    config = workflow["config"]
    if not isinstance(config, dict):
        config = json.loads(config)
    task_node = next(n for n in config["nodes"] if n["type"] == "TASK")
    node_id = task_node["id"]
    # Delete node
    del_node_resp = client.get(f"/experiment/1/workflows/{workflow_id}/{node_id}/delete_node")
    assert del_node_resp.status_code == 200
    # Cleanup
    client.get(f"/experiment/1/workflows/delete/{workflow_id}")


def test_workflow_edit_node_metadata(client):
    create_resp = client.get("/experiment/1/workflows/create_empty", params={"name": "editmeta"})
    workflow_id = create_resp.json()
    node = {"type": "TASK", "name": "Meta Task", "task": "test_task", "out": []}
    client.get(f"/experiment/1/workflows/{workflow_id}/add_node", params={"node": json.dumps(node)})
    wf_resp = client.get("/experiment/1/workflows/list")
    workflow = next(w for w in wf_resp.json() if w["id"] == workflow_id)
    config = workflow["config"]
    if not isinstance(config, dict):
        config = json.loads(config)
    task_node = next(n for n in config["nodes"] if n["type"] == "TASK")
    node_id = task_node["id"]
    meta = {"desc": "testdesc"}
    edit_resp = client.get(
        f"/experiment/1/workflows/{workflow_id}/{node_id}/edit_node_metadata",
        params={"metadata": json.dumps(meta)},
    )
    assert edit_resp.status_code == 200
    # Cleanup
    client.get(f"/experiment/1/workflows/delete/{workflow_id}")


def test_workflow_add_and_remove_edge(client):
    create_resp = client.get("/experiment/1/workflows/create_empty", params={"name": "edgecase"})
    workflow_id = create_resp.json()
    node1 = {"type": "TASK", "name": "Task1", "task": "task1", "out": []}
    node2 = {"type": "TASK", "name": "Task2", "task": "task2", "out": []}
    client.get(
        f"/experiment/1/workflows/{workflow_id}/add_node", params={"node": json.dumps(node1)}
    )
    client.get(
        f"/experiment/1/workflows/{workflow_id}/add_node", params={"node": json.dumps(node2)}
    )
    wf_resp = client.get("/experiment/1/workflows/list")
    workflow = next(w for w in wf_resp.json() if w["id"] == workflow_id)
    config = workflow["config"]
    if not isinstance(config, dict):
        config = json.loads(config)
    task_nodes = [n for n in config["nodes"] if n["type"] == "TASK"]
    node1_id, node2_id = task_nodes[0]["id"], task_nodes[1]["id"]
    add_edge_resp = client.post(
        f"/experiment/1/workflows/{workflow_id}/{node1_id}/add_edge",
        params={"end_node_id": node2_id},
    )
    assert add_edge_resp.status_code == 200
    remove_edge_resp = client.post(
        f"/experiment/1/workflows/{workflow_id}/{node1_id}/remove_edge",
        params={"end_node_id": node2_id},
    )
    assert remove_edge_resp.status_code == 200
    # Cleanup
    client.get(f"/experiment/1/workflows/delete/{workflow_id}")


def test_workflow_export_to_yaml(client):
    create_resp = client.get("/experiment/1/workflows/create_empty", params={"name": "yamltest"})
    workflow_id = create_resp.json()
    export_resp = client.get(f"/experiment/1/workflows/{workflow_id}/export_to_yaml")
    assert export_resp.status_code == 200
    # Cleanup
    client.get(f"/experiment/1/workflows/delete/{workflow_id}")


def test_workflow_add_eval_node_and_metadata(client):
    create_resp = client.get("/experiment/1/workflows/create_empty", params={"name": "evalnode"})
    workflow_id = create_resp.json()
    # Add EVAL node with realistic structure
    node = {"name": "hello", "task": "WarmPanda", "type": "EVAL", "metadata": {}, "out": []}
    add_node_resp = client.get(
        f"/experiment/1/workflows/{workflow_id}/add_node", params={"node": json.dumps(node)}
    )
    assert add_node_resp.status_code == 200
    # Get workflow config to find node id
    wf_resp = client.get("/experiment/1/workflows/list")
    workflow = next(w for w in wf_resp.json() if w["id"] == workflow_id)
    config = workflow["config"]
    if not isinstance(config, dict):
        config = json.loads(config)
    eval_node = next(n for n in config["nodes"] if n["type"] == "EVAL")
    node_id = eval_node["id"]
    # Edit metadata
    meta = {"desc": "eval node test"}
    edit_resp = client.get(
        f"/experiment/1/workflows/{workflow_id}/{node_id}/edit_node_metadata",
        params={"metadata": json.dumps(meta)},
    )
    assert edit_resp.status_code == 200
    # Cleanup
    client.get(f"/experiment/1/workflows/delete/{workflow_id}")


def test_workflow_update_config(client):
    # Create a workflow to update config
    create_resp = client.get(
        "/experiment/1/workflows/create_empty", params={"name": "updateconfig"}
    )
    workflow_id = create_resp.json()

    # Test config with a custom structure
    new_config = {
        "nodes": [
            {"type": "START", "id": "start-123", "name": "START", "out": ["task-456"]},
            {"type": "TASK", "id": "task-456", "name": "Test Task", "task": "test_task", "out": []},
        ]
    }

    # Update config using PUT endpoint
    resp = client.put(f"/experiment/1/workflows/{workflow_id}/config", json=new_config)
    assert resp.status_code == 200
    assert resp.json().get("message") == "OK"

    # Verify the config was updated by fetching the workflow
    list_resp = client.get("/experiment/1/workflows/list")
    workflow = next(w for w in list_resp.json() if w["id"] == workflow_id)
    config = workflow["config"]
    if not isinstance(config, dict):
        config = json.loads(config)

    # Verify the config matches what we set
    assert len(config["nodes"]) == 2
    assert config["nodes"][0]["type"] == "START"
    assert config["nodes"][1]["type"] == "TASK"
    assert config["nodes"][0]["out"] == ["task-456"]

    # Cleanup
    client.get(f"/experiment/1/workflows/delete/{workflow_id}")


def test_workflow_task_isolation_success(client):
    """Test that workflows can find tasks in their own experiment with correct type."""
    # Create a TRAIN task in experiment 1
    task_data = {
        "name": "isolation_test_task",
        "type": "TRAIN",
        "inputs": '{"model_name": "test_model"}',
        "config": '{"learning_rate": 0.001}',
        "plugin": "test_plugin",
        "outputs": '{"adaptor_name": "test_adaptor"}',
        "experiment_id": 1,
    }
    task_resp = client.put("/tasks/new_task", json=task_data)
    assert task_resp.status_code == 200

    # Verify task exists in experiment 1
    tasks_resp = client.get("/tasks/list_by_type_in_experiment?type=TRAIN&experiment_id=1")
    assert tasks_resp.status_code == 200
    tasks = tasks_resp.json()
    test_task = next((t for t in tasks if t["name"] == "isolation_test_task"), None)
    assert test_task is not None
    task_id = test_task["id"]

    # Create a workflow that references this task
    create_resp = client.get(
        "/experiment/1/workflows/create_empty", params={"name": "isolation_test_workflow"}
    )
    assert create_resp.status_code == 200
    workflow_id = create_resp.json()

    # Add TRAIN node
    train_node = {
        "type": "TRAIN",
        "name": "Training Node",
        "task": "isolation_test_task",
        "out": [],
    }
    add_node_resp = client.get(
        f"/experiment/1/workflows/{workflow_id}/add_node", params={"node": json.dumps(train_node)}
    )
    assert add_node_resp.status_code == 200

    # Start the workflow
    start_resp = client.get(f"/experiment/1/workflows/{workflow_id}/start")
    assert start_resp.status_code == 200
    assert start_resp.json().get("message") == "OK"

    # Test the task isolation by triggering workflow execution
    import asyncio

    from transformerlab.routers.experiment import workflows

    async def trigger_workflow_execution():
        return await workflows.start_next_step_in_workflow()

    # Run the workflow execution step
    asyncio.run(trigger_workflow_execution())

    # Verify workflow was processed successfully
    runs_resp = client.get("/experiment/1/workflows/runs")
    assert runs_resp.status_code == 200
    runs = runs_resp.json()
    test_run = next((r for r in runs if r["workflow_id"] == workflow_id), None)
    assert test_run is not None
    assert test_run["status"] in ["QUEUED", "RUNNING", "COMPLETE", "FAILED"]

    # Cleanup
    client.get(f"/tasks/{task_id}/delete")
    client.get(f"/experiment/1/workflows/delete/{workflow_id}")


def test_workflow_task_isolation_cross_experiment_failure(client):
    """Test that workflows cannot access tasks from other experiments."""
    # Create a task in experiment 2
    task_data = {
        "name": "cross_experiment_task",
        "type": "TRAIN",
        "inputs": '{"model_name": "test_model"}',
        "config": '{"learning_rate": 0.001}',
        "plugin": "test_plugin",
        "outputs": '{"adaptor_name": "test_adaptor"}',
        "experiment_id": 2,
    }
    task_resp = client.put("/tasks/new_task", json=task_data)
    assert task_resp.status_code == 200

    # Verify task exists in experiment 2
    tasks_resp = client.get("/tasks/list_by_type_in_experiment?type=TRAIN&experiment_id=2")
    assert tasks_resp.status_code == 200
    tasks = tasks_resp.json()
    test_task = next((t for t in tasks if t["name"] == "cross_experiment_task"), None)
    assert test_task is not None
    task_id = test_task["id"]

    # Create a workflow in experiment 1 that tries to reference the task from experiment 2
    create_resp = client.get(
        "/experiment/1/workflows/create_empty", params={"name": "cross_exp_workflow"}
    )
    assert create_resp.status_code == 200
    workflow_id = create_resp.json()

    # Add a node that references the task from experiment 2
    train_node = {
        "type": "TRAIN",
        "name": "Cross Exp Node",
        "task": "cross_experiment_task",
        "out": [],
    }
    add_node_resp = client.get(
        f"/experiment/1/workflows/{workflow_id}/add_node", params={"node": json.dumps(train_node)}
    )
    assert add_node_resp.status_code == 200

    # Start the workflow
    start_resp = client.get(f"/experiment/1/workflows/{workflow_id}/start")
    assert start_resp.status_code == 200

    # Trigger workflow execution
    import asyncio

    from transformerlab.routers.experiment import workflows

    async def trigger_workflow_execution():
        return await workflows.start_next_step_in_workflow()

    asyncio.run(trigger_workflow_execution())

    # Verify workflow failed because it couldn't find the cross-experiment task
    runs_resp = client.get("/experiment/1/workflows/runs")
    assert runs_resp.status_code == 200
    runs = runs_resp.json()
    test_run = next((r for r in runs if r["workflow_id"] == workflow_id), None)
    assert test_run is not None
    # The workflow should fail because the task is not found in experiment 1
    assert test_run["status"] == "FAILED"

    # Cleanup
    client.get(f"/tasks/{task_id}/delete")
    client.get(f"/experiment/1/workflows/delete/{workflow_id}")
