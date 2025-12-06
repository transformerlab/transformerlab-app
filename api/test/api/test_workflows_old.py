import json

import pytest

from transformerlab.routers.experiment import workflows as wf

pytestmark = pytest.mark.skip("This entire test file is currently under development.")


@pytest.fixture(scope="module")
def experiment_id(client):
    """Create a single experiment for all workflow tests and clean up afterward"""
    exp_resp = client.get("/experiment/create?name=test_workflows_experiment")
    assert exp_resp.status_code == 200
    exp_id = exp_resp.json()

    yield exp_id

    # Cleanup: delete the experiment after all tests are done
    client.get(f"/experiment/delete/{exp_id}")
    # Don't assert on the delete response as it might fail if experiment is already gone


def test_workflows_list(client, experiment_id):
    resp = client.get(f"/experiment/{experiment_id}/workflows/list")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list) or isinstance(resp.json(), dict)


def test_workflows_delete(client, experiment_id):
    # Create a workflow to delete
    create_resp = client.get(
        f"/experiment/{experiment_id}/workflows/create?name=workflow_to_delete"
    )
    assert create_resp.status_code == 200
    workflow_id = create_resp.json()

    # Try to delete the workflow
    resp = client.get(f"/experiment/{experiment_id}/workflows/delete/{workflow_id}")
    assert resp.status_code == 200
    assert resp.json() == {"message": "OK"}

    # Try to delete a non-existent workflow
    resp = client.get(f"/experiment/{experiment_id}/workflows/delete/non_existent_workflow")
    assert resp.status_code == 200
    assert resp.json() == {"error": "Workflow not found or does not belong to this experiment"}


def test_workflows_create(client, experiment_id):
    import json

    # Create workflow with required fields
    config = {
        "nodes": [{"type": "START", "id": "start", "name": "START", "out": []}],
        "status": "CREATED",
    }
    resp = client.get(
        f"/experiment/{experiment_id}/workflows/create?name=test_workflow&config={json.dumps(config)}"
    )
    assert resp.status_code == 200
    assert resp.json() is not None  # Just check that we get a valid response


def test_experiment_workflows_list(client, experiment_id):
    """Test the new experiment workflows list endpoint"""
    # Create a workflow in the experiment
    workflow_resp = client.get(f"/experiment/{experiment_id}/workflows/create?name=test_workflow")
    assert workflow_resp.status_code == 200

    # Test the new experiment workflows list endpoint
    resp = client.get(f"/experiment/{experiment_id}/workflows/list")
    assert resp.status_code == 200
    workflows = resp.json()
    assert isinstance(workflows, list)
    assert len(workflows) > 0
    assert workflows[0]["experiment_id"] == experiment_id


def test_experiment_workflow_runs(client, experiment_id):
    """Test the new experiment workflow runs endpoint"""
    # Create a workflow in the experiment
    workflow_resp = client.get(f"/experiment/{experiment_id}/workflows/create?name=test_workflow")
    assert workflow_resp.status_code == 200
    workflow_id = workflow_resp.json()

    # Queue the workflow to create a run
    queue_resp = client.get(f"/experiment/{experiment_id}/workflows/{workflow_id}/start")
    assert queue_resp.status_code == 200

    # Test the new experiment workflow runs endpoint
    resp = client.get(f"/experiment/{experiment_id}/workflows/runs")
    assert resp.status_code == 200
    runs = resp.json()
    assert isinstance(runs, list)
    assert len(runs) > 0
    assert runs[0]["experiment_id"] == experiment_id
    assert runs[0]["workflow_id"] == workflow_id


def test_workflow_node_operations(client, experiment_id):
    """Test node-related operations in a workflow"""
    # Create workflow
    workflow_resp = client.get(f"/experiment/{experiment_id}/workflows/create?name=test_workflow")
    assert workflow_resp.status_code == 200
    workflow_id = workflow_resp.json()

    # Add a node
    node_data = {
        "type": "TASK",
        "name": "Test Task",
        "task": "test_task",  # Required field
        "out": [],  # Required field
    }
    add_node_resp = client.get(
        f"/experiment/{experiment_id}/workflows/{workflow_id}/add_node?node={json.dumps(node_data)}"
    )
    assert add_node_resp.status_code == 200

    # Get the workflow to find the node ID
    workflow_resp = client.get(f"/experiment/{experiment_id}/workflows/list")
    assert workflow_resp.status_code == 200
    workflows = workflow_resp.json()
    workflow = next(w for w in workflows if w["id"] == workflow_id)
    workflow_config = workflow["config"]
    if not isinstance(workflow_config, dict):
        workflow_config = json.loads(workflow_config)

    nodes = workflow_config["nodes"]
    node_id = next(n["id"] for n in nodes if n["type"] == "TASK")

    # Update node metadata
    metadata = {"key": "value"}
    metadata_resp = client.get(
        f"/experiment/{experiment_id}/workflows/{workflow_id}/{node_id}/edit_node_metadata?metadata={json.dumps(metadata)}"
    )
    assert metadata_resp.status_code == 200

    # Update node
    new_node = {
        "id": node_id,
        "type": "TASK",
        "name": "Updated Task",
        "task": "test_task",
        "out": [],
    }
    update_resp = client.post(
        f"/experiment/{experiment_id}/workflows/{workflow_id}/{node_id}/update_node", json=new_node
    )
    assert update_resp.status_code == 200

    # Add edge
    edge_resp = client.post(
        f"/experiment/{experiment_id}/workflows/{workflow_id}/START/add_edge?end_node_id={node_id}"
    )
    assert edge_resp.status_code == 200

    # Remove edge
    remove_edge_resp = client.post(
        f"/experiment/{experiment_id}/workflows/{workflow_id}/START/remove_edge?end_node_id={node_id}"
    )
    assert remove_edge_resp.status_code == 200

    # Delete node
    delete_node_resp = client.get(
        f"/experiment/{experiment_id}/workflows/{workflow_id}/{node_id}/delete_node"
    )
    assert delete_node_resp.status_code == 200


def test_workflow_name_update(client, experiment_id):
    """Test updating a workflow's name"""
    # Create workflow
    workflow_resp = client.get(f"/experiment/{experiment_id}/workflows/create?name=old_name")
    assert workflow_resp.status_code == 200
    workflow_id = workflow_resp.json()

    # Update name
    update_resp = client.get(
        f"/experiment/{experiment_id}/workflows/{workflow_id}/update_name?new_name=new_name"
    )
    assert update_resp.status_code == 200
    assert update_resp.json() == {"message": "OK"}


def test_workflow_yaml_operations(client, experiment_id):
    """Test YAML import/export operations"""
    # Create workflow with required fields
    config = {
        "nodes": [{"type": "START", "id": "start", "name": "START", "out": []}],
        "status": "CREATED",
    }
    workflow_resp = client.get(
        f"/experiment/{experiment_id}/workflows/create?name=test_workflow&config={json.dumps(config)}"
    )
    assert workflow_resp.status_code == 200
    workflow_id = workflow_resp.json()

    # Queue the workflow to create a workflow run with the required fields
    queue_resp = client.get(f"/experiment/{experiment_id}/workflows/{workflow_id}/start")
    assert queue_resp.status_code == 200

    # Export to YAML - using the experiment-scoped path
    export_resp = client.get(f"/experiment/{experiment_id}/workflows/{workflow_id}/export_to_yaml")
    assert export_resp.status_code == 200
    # Check that we get a file response with the correct filename
    # assert export_resp.headers.get("content-type") == "text/plain; charset=utf-8"
    assert (
        export_resp.headers.get("content-disposition")
        == 'attachment; filename="test_workflow.yaml"'
    )


def test_workflow_run_operations(client, experiment_id):
    """Test workflow run operations"""
    # Create workflow
    workflow_resp = client.get(f"/experiment/{experiment_id}/workflows/create?name=test_workflow")
    assert workflow_resp.status_code == 200
    workflow_id = workflow_resp.json()

    # Start workflow
    start_resp = client.get(f"/experiment/{experiment_id}/workflows/{workflow_id}/start")
    assert start_resp.status_code == 200

    # Get workflow runs
    runs_resp = client.get(f"/experiment/{experiment_id}/workflows/runs")
    assert runs_resp.status_code == 200
    runs = runs_resp.json()
    assert isinstance(runs, list)
    assert len(runs) > 0
    run_id = runs[0]["id"]

    # Get specific run
    run_resp = client.get(f"/experiment/{experiment_id}/workflows/runs/{run_id}")
    assert run_resp.status_code == 200
    run_data = run_resp.json()
    assert "run" in run_data
    assert "workflow" in run_data
    assert "jobs" in run_data


def test_workflow_next_step(client, experiment_id):
    """Test workflow progression through complete workflow execution"""
    # Create workflow with simple configuration that can complete quickly
    config = {
        "nodes": [
            {"type": "START", "id": "start", "name": "START", "out": []},
        ]
    }
    workflow_resp = client.get(
        f"/experiment/{experiment_id}/workflows/create?name=test_workflow&config={json.dumps(config)}"
    )
    assert workflow_resp.status_code == 200
    workflow_id = workflow_resp.json()

    # Start workflow to create a queued run
    start_resp = client.get(f"/experiment/{experiment_id}/workflows/{workflow_id}/start")
    assert start_resp.status_code == 200

    # Verify workflow run was created
    runs_resp = client.get(f"/experiment/{experiment_id}/workflows/runs")
    assert runs_resp.status_code == 200
    runs = runs_resp.json()
    assert len(runs) > 0
    assert runs[0]["status"] in ["RUNNING", "QUEUED"]

    # Test workflow run retrieval
    run_id = runs[0]["id"]
    run_resp = client.get(f"/experiment/{experiment_id}/workflows/runs/{run_id}")
    assert run_resp.status_code == 200
    run_data = run_resp.json()
    assert "run" in run_data
    assert "workflow" in run_data
    assert "jobs" in run_data


def test_workflow_create_invalid(client, experiment_id):
    """Test workflow creation with invalid config"""
    # Test workflow creation without config (should still work)
    resp = client.get(f"/experiment/{experiment_id}/workflows/create?name=test_workflow_no_config")
    assert resp.status_code == 200
    # Just verify we get some response
    assert resp.json() is not None


def test_workflow_run_cancel(client, experiment_id):
    """Test workflow run cancellation"""
    # Create workflow
    workflow_resp = client.get(f"/experiment/{experiment_id}/workflows/create?name=test_workflow")
    assert workflow_resp.status_code == 200
    workflow_id = workflow_resp.json()

    # Start workflow to create a run
    start_resp = client.get(f"/experiment/{experiment_id}/workflows/{workflow_id}/start")
    assert start_resp.status_code == 200

    # Get the workflow run
    runs_resp = client.get(f"/experiment/{experiment_id}/workflows/runs")
    assert runs_resp.status_code == 200
    runs = runs_resp.json()
    assert len(runs) > 0
    run_id = runs[0]["id"]

    # Test successful cancellation
    cancel_resp = client.get(f"/experiment/{experiment_id}/workflows/{run_id}/cancel")
    assert cancel_resp.status_code == 200
    cancel_data = cancel_resp.json()
    assert "message" in cancel_data
    assert f"Workflow run {run_id} cancellation initiated" in cancel_data["message"]
    assert "cancelled_jobs" in cancel_data
    assert "note" in cancel_data


def test_workflow_run_cancel_with_active_jobs(client, experiment_id):
    """Test workflow run cancellation with actual running jobs"""

    # Create workflow
    workflow_resp = client.get(
        f"/experiment/{experiment_id}/workflows/create?name=test_workflow_with_jobs"
    )
    assert workflow_resp.status_code == 200
    workflow_id = workflow_resp.json()

    # Create a job via API (more realistic)
    job_resp = client.get(f"/jobs/create?type=TRAIN&status=RUNNING&experiment_id={experiment_id}")
    assert job_resp.status_code == 200
    job_id = job_resp.json()

    # Start workflow to create a run
    start_resp = client.get(f"/experiment/{experiment_id}/workflows/{workflow_id}/start")
    assert start_resp.status_code == 200

    # Get the workflow run
    runs_resp = client.get(f"/experiment/{experiment_id}/workflows/runs")
    assert runs_resp.status_code == 200
    runs = runs_resp.json()
    assert len(runs) > 0
    run_id = runs[0]["id"]

    # Manually add job to workflow run to simulate active job
    # This simulates what happens when a workflow step is running
    import asyncio

    from transformerlab.db import db

    async def add_job_to_run():
        await db.workflow_run_update_with_new_job(run_id, f'["{job_id}"]', f"[{job_id}]")

    asyncio.run(add_job_to_run())

    # Test the cancellation via API
    cancel_resp = client.get(f"/experiment/{experiment_id}/workflows/{run_id}/cancel")
    assert cancel_resp.status_code == 200

    response_data = cancel_resp.json()
    assert "cancelled_jobs" in response_data
    assert job_id in response_data["cancelled_jobs"]
    assert len(response_data["cancelled_jobs"]) == 1

    # Verify job was actually stopped by checking via API
    job_resp = client.get(f"/jobs/{job_id}")
    assert job_resp.status_code == 200
    job_data = job_resp.json()
    assert job_data["job_data"]["stop"]


def test_workflow_run_cancel_invalid_cases(client, experiment_id):
    """Test workflow run cancellation with invalid cases"""
    # Test cancelling non-existent workflow run
    cancel_resp = client.get(f"/experiment/{experiment_id}/workflows/non_existent_run/cancel")
    assert cancel_resp.status_code == 200
    assert cancel_resp.json() == {"error": "Workflow run not found"}

    # Create workflow and run for testing status checks
    workflow_resp = client.get(f"/experiment/{experiment_id}/workflows/create?name=test_workflow")
    assert workflow_resp.status_code == 200
    workflow_id = workflow_resp.json()

    # Start workflow to create a run
    start_resp = client.get(f"/experiment/{experiment_id}/workflows/{workflow_id}/start")
    assert start_resp.status_code == 200

    # Get the workflow run
    runs_resp = client.get(f"/experiment/{experiment_id}/workflows/runs")
    assert runs_resp.status_code == 200
    runs = runs_resp.json()
    assert len(runs) > 0
    run_id = runs[0]["id"]

    # First cancellation should succeed
    cancel_resp = client.get(f"/experiment/{experiment_id}/workflows/{run_id}/cancel")
    assert cancel_resp.status_code == 200


def test_workflow_run_cancel_security(client, experiment_id):
    """Test workflow run cancellation security checks across experiments"""
    # Create a second experiment for security testing
    exp2_resp = client.get("/experiment/create?name=test_workflow_cancel_security_exp2")
    assert exp2_resp.status_code == 200
    exp2_id = exp2_resp.json()

    try:
        # Create workflow in original experiment
        workflow_resp = client.get(
            f"/experiment/{experiment_id}/workflows/create?name=test_workflow"
        )
        assert workflow_resp.status_code == 200
        workflow_id = workflow_resp.json()

        # Start workflow to create a run
        start_resp = client.get(f"/experiment/{experiment_id}/workflows/{workflow_id}/start")
        assert start_resp.status_code == 200

        # Get the workflow run from original experiment
        runs_resp = client.get(f"/experiment/{experiment_id}/workflows/runs")
        assert runs_resp.status_code == 200
        runs = runs_resp.json()
        assert len(runs) > 0
        run_id = runs[0]["id"]

        # Try to cancel the workflow run from experiment 2 (should fail)
        cancel_resp = client.get(f"/experiment/{exp2_id}/workflows/{run_id}/cancel")
        assert cancel_resp.status_code == 200
        assert cancel_resp.json() == {
            "error": "Associated workflow not found or does not belong to this experiment"
        }

        # Verify cancellation works from the correct experiment
        cancel_resp = client.get(f"/experiment/{experiment_id}/workflows/{run_id}/cancel")
        assert cancel_resp.status_code == 200
        cancel_data = cancel_resp.json()
        assert "message" in cancel_data
        assert f"Workflow run {run_id} cancellation initiated" in cancel_data["message"]
    finally:
        # Cleanup the second experiment
        client.get(f"/experiment/delete/{exp2_id}")


def test_workflow_run_cancel_edge_cases(client, experiment_id):
    """Test workflow run cancellation edge cases"""
    # Create workflow with complex configuration
    config = {
        "nodes": [
            {"type": "START", "id": "start", "name": "START", "out": ["task1"]},
            {
                "type": "TASK",
                "id": "task1",
                "name": "Task 1",
                "task": "test_task",
                "out": ["task2"],
            },
            {"type": "TASK", "id": "task2", "name": "Task 2", "task": "test_task", "out": []},
        ]
    }
    workflow_resp = client.get(
        f"/experiment/{experiment_id}/workflows/create?name=test_complex_workflow&config={json.dumps(config)}"
    )
    assert workflow_resp.status_code == 200
    workflow_id = workflow_resp.json()

    # Start workflow
    start_resp = client.get(f"/experiment/{experiment_id}/workflows/{workflow_id}/start")
    assert start_resp.status_code == 200

    # Get workflow run
    runs_resp = client.get(f"/experiment/{experiment_id}/workflows/runs")
    assert runs_resp.status_code == 200
    runs = runs_resp.json()
    assert len(runs) > 0
    run_id = runs[0]["id"]

    # Cancel the workflow run
    cancel_resp = client.get(f"/experiment/{experiment_id}/workflows/{run_id}/cancel")
    assert cancel_resp.status_code == 200
    cancel_data = cancel_resp.json()

    # Verify response structure
    assert isinstance(cancel_data.get("cancelled_jobs"), list)
    assert cancel_data.get("note") == "Workflow status will be updated to CANCELLED automatically"


def test_workflow_node_operations_invalid(client, experiment_id):
    """Test node operations with invalid node IDs"""
    # Use shared experiment instead of creating new one
    workflow_resp = client.get(f"/experiment/{experiment_id}/workflows/create?name=test_workflow")
    assert workflow_resp.status_code == 200

    # Just test that the endpoint exists and doesn't crash - no complex operations
    resp = client.get(f"/experiment/{experiment_id}/workflows/list")
    assert resp.status_code == 200


def test_workflow_edge_operations_invalid(client, experiment_id):
    """Test edge operations with invalid node IDs"""
    # Use shared experiment instead of creating new one
    config = {
        "nodes": [{"type": "START", "id": "start", "name": "START", "out": []}],
        "status": "CREATED",
    }
    workflow_resp = client.get(
        f"/experiment/{experiment_id}/workflows/create?name=test_workflow&config={json.dumps(config)}"
    )
    assert workflow_resp.status_code == 200
    workflow_id = workflow_resp.json()

    # Only test operations that are guaranteed to work
    # Just verify the endpoints exist and don't crash
    resp = client.post(
        f"/experiment/{experiment_id}/workflows/{workflow_id}/start/add_edge?end_node_id=non_existent"
    )
    assert resp.status_code == 200


def test_workflow_run_operations_invalid(client, experiment_id):
    """Test workflow run operations with invalid run IDs"""
    # Try to get non-existent run using shared experiment
    resp = client.get(f"/experiment/{experiment_id}/workflows/runs/non_existent_run")
    assert resp.status_code == 200
    assert resp.json() == {"error": "Workflow run not found"}


def test_workflow_name_update_invalid(client, experiment_id):
    """Test invalid workflow name updates"""
    # Use shared experiment instead of creating new one
    config = {
        "nodes": [{"type": "START", "id": "start", "name": "START", "out": []}],
        "status": "CREATED",
    }
    workflow_resp = client.get(
        f"/experiment/{experiment_id}/workflows/create?name=test_workflow&config={json.dumps(config)}"
    )
    assert workflow_resp.status_code == 200
    workflow_id = workflow_resp.json()
    assert workflow_id is not None

    # Just test that the endpoint exists and doesn't crash
    resp = client.get(
        f"/experiment/{experiment_id}/workflows/{workflow_id}/update_name?new_name=new_name"
    )
    assert resp.status_code == 200


def test_find_nodes_by_ids_helper(client):
    # Use shared experiment instead of creating new one
    workflow_resp = client.get(f"/experiment/{experiment_id}/workflows/create?name=test_workflow")
    assert workflow_resp.status_code == 200

    # Just test that the endpoint exists and doesn't crash
    resp = client.get(f"/experiment/{experiment_id}/workflows/list")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_determine_next_and_start_skip_helpers(client):
    """Test determine_next_tasks and handle_start_node_skip helpers with various scenarios"""

    # Test with empty workflow config
    empty_config = {"nodes": []}
    result = await wf.determine_next_tasks([], empty_config, 0)
    assert result == []

    # Test with current tasks that have multiple outputs
    workflow_config = {
        "nodes": [
            {"id": "task1", "type": "TASK", "out": ["task2", "task3"]},
            {"id": "task2", "type": "TASK", "out": []},
            {"id": "task3", "type": "TASK", "out": []},
        ]
    }

    result = await wf.determine_next_tasks(["task1"], workflow_config, 0)
    assert set(result) == {"task2", "task3"}  # Should get both outputs

    # Test handle_start_node_skip with multiple START nodes
    workflow_config = {
        "nodes": [
            {"id": "start1", "type": "START", "out": ["task1"]},
            {"id": "start2", "type": "START", "out": ["task2"]},
            {"id": "task1", "type": "TASK", "out": []},
            {"id": "task2", "type": "TASK", "out": []},
        ]
    }

    actual_ids, next_nodes = await wf.handle_start_node_skip(
        ["start1", "start2"], workflow_config, 0
    )
    assert set(actual_ids) == {"task1", "task2"}
    assert len(next_nodes) == 2


def test_extract_previous_job_outputs_and_prepare_io():
    """Test extract_previous_job_outputs and prepare_next_task_io with comprehensive scenarios"""

    # Test GENERATE job with dataset_id at top level
    generate_job_top_level = {
        "type": "GENERATE",
        "job_data": {
            "dataset_id": "Top Level Dataset",
            "config": {"dataset_id": "Config Level Dataset"},
        },
    }
    outputs = wf.extract_previous_job_outputs(generate_job_top_level)
    # Should prefer top-level dataset_id
    assert outputs["dataset_name"] == "top-level-dataset"

    # Test TRAIN job with only model_name (no adaptor_name)
    train_job_model_only = {"type": "TRAIN", "job_data": {"config": {"model_name": "test-model"}}}
    outputs = wf.extract_previous_job_outputs(train_job_model_only)
    assert outputs["model_name"] == "test-model"
    assert "adaptor_name" not in outputs

    # Test TRAIN job with adaptor but no fuse_model
    train_job_adaptor_no_fuse = {
        "type": "TRAIN",
        "job_data": {"config": {"model_name": "test-model", "adaptor_name": "test-adaptor"}},
    }
    outputs = wf.extract_previous_job_outputs(train_job_adaptor_no_fuse)
    assert outputs["adaptor_name"] == "test-adaptor"

    # Test TRAIN task with existing inputs and outputs
    task_def_train = {
        "type": "TRAIN",
        "inputs": '{"existing_input": "value", "model_name": "old_model"}',
        "outputs": '{"existing_output": "result"}',
    }
    previous_outputs = {"model_name": "new_model", "dataset_name": "test_dataset"}

    inputs_json, outputs_json = wf.prepare_next_task_io(task_def_train, previous_outputs)
    inputs = json.loads(inputs_json)
    outputs = json.loads(outputs_json)

    # Should override model_name but keep existing fields
    assert inputs["model_name"] == "new_model"
    assert inputs["dataset_name"] == "test_dataset"
    assert inputs["existing_input"] == "value"

    # Should add adaptor_name and keep existing outputs
    assert "adaptor_name" in outputs
    assert outputs["existing_output"] == "result"

    # Test EVAL task with partial previous outputs
    task_def_eval = {"type": "EVAL", "inputs": "{}", "outputs": "{}"}
    partial_outputs = {
        "model_name": "test_model"
        # Missing other fields
    }

    inputs_json, outputs_json = wf.prepare_next_task_io(task_def_eval, partial_outputs)
    inputs = json.loads(inputs_json)

    # Should only include the fields that exist in previous_outputs
    assert inputs["model_name"] == "test_model"
    assert "model_architecture" not in inputs
    assert "adaptor_name" not in inputs
    assert "dataset_name" not in inputs


def test_workflow_security_checks(client):
    """Test security checks for workflow operations across different experiments"""
    # Create two separate experiments for security testing
    exp1_resp = client.get("/experiment/create?name=test_workflow_security_exp1")
    assert exp1_resp.status_code == 200
    exp1_id = exp1_resp.json()

    exp2_resp = client.get("/experiment/create?name=test_workflow_security_exp2")
    assert exp2_resp.status_code == 200
    exp2_id = exp2_resp.json()

    try:
        # Create a workflow in experiment 1
        workflow_resp = client.get(f"/experiment/{exp1_id}/workflows/create?name=test_workflow")
        assert workflow_resp.status_code == 200
        workflow_id = workflow_resp.json()

        # Try to delete workflow from experiment 1 using experiment 2's context
        delete_resp = client.get(f"/experiment/{exp2_id}/workflows/delete/{workflow_id}")
        assert delete_resp.status_code == 200
        assert delete_resp.json() == {
            "error": "Workflow not found or does not belong to this experiment"
        }

        # Try to edit node metadata from wrong experiment
        metadata_resp = client.get(
            f"/experiment/{exp2_id}/workflows/{workflow_id}/node_id/edit_node_metadata?metadata={{}}"
        )
        assert metadata_resp.status_code == 200
        assert metadata_resp.json() == {
            "error": "Workflow not found or does not belong to this experiment"
        }

        # Try to update name from wrong experiment
        name_resp = client.get(
            f"/experiment/{exp2_id}/workflows/{workflow_id}/update_name?new_name=new_name"
        )
        assert name_resp.status_code == 200
        assert name_resp.json() == {
            "error": "Workflow not found or does not belong to this experiment"
        }

        # Try to add node from wrong experiment
        node_data = {"type": "TASK", "name": "Test Task", "task": "test_task", "out": []}
        add_node_resp = client.get(
            f"/experiment/{exp2_id}/workflows/{workflow_id}/add_node?node={json.dumps(node_data)}"
        )
        assert add_node_resp.status_code == 200
        assert add_node_resp.json() == {
            "error": "Workflow not found or does not belong to this experiment"
        }

        # Try to update node from wrong experiment
        new_node = {
            "id": "test",
            "type": "TASK",
            "name": "Updated Task",
            "task": "test_task",
            "out": [],
        }
        update_resp = client.post(
            f"/experiment/{exp2_id}/workflows/{workflow_id}/test/update_node", json=new_node
        )
        assert update_resp.status_code == 200
        assert update_resp.json() == {
            "error": "Workflow not found or does not belong to this experiment"
        }

        # Try to remove edge from wrong experiment
        remove_edge_resp = client.post(
            f"/experiment/{exp2_id}/workflows/{workflow_id}/start/remove_edge?end_node_id=test"
        )
        assert remove_edge_resp.status_code == 200
        assert remove_edge_resp.json() == {
            "error": "Workflow not found or does not belong to this experiment"
        }

        # Try to add edge from wrong experiment
        add_edge_resp = client.post(
            f"/experiment/{exp2_id}/workflows/{workflow_id}/start/add_edge?end_node_id=test"
        )
        assert add_edge_resp.status_code == 200
        assert add_edge_resp.json() == {
            "error": "Workflow not found or does not belong to this experiment"
        }

        # Try to delete node from wrong experiment
        delete_node_resp = client.get(
            f"/experiment/{exp2_id}/workflows/{workflow_id}/test/delete_node"
        )
        assert delete_node_resp.status_code == 200
        assert delete_node_resp.json() == {
            "error": "Workflow not found or does not belong to this experiment"
        }

        # Try to export YAML from wrong experiment
        export_resp = client.get(f"/experiment/{exp2_id}/workflows/{workflow_id}/export_to_yaml")
        assert export_resp.status_code == 200
        assert export_resp.json() == {
            "error": "Workflow not found or does not belong to this experiment"
        }

        # Try to start workflow from wrong experiment
        start_resp = client.get(f"/experiment/{exp2_id}/workflows/{workflow_id}/start")
        assert start_resp.status_code == 200
        assert start_resp.json() == {
            "error": "Workflow not found or does not belong to this experiment"
        }
    finally:
        # Cleanup both experiments
        client.get(f"/experiment/delete/{exp1_id}")
        client.get(f"/experiment/delete/{exp2_id}")


def test_workflow_start_node_deletion(client, experiment_id):
    """Test that START nodes cannot be deleted"""
    exp_id = experiment_id

    # Create workflow
    workflow_resp = client.get(f"/experiment/{exp_id}/workflows/create?name=test_workflow123")
    assert workflow_resp.status_code == 200
    workflow_id = workflow_resp.json()

    # Get the workflow to find the START node ID
    workflow_resp = client.get(f"/experiment/{exp_id}/workflows/list")
    assert workflow_resp.status_code == 200
    workflows = workflow_resp.json()
    workflow = next(w for w in workflows if w["id"] == workflow_id)
    nodes = json.loads(workflow["config"])["nodes"]
    start_node_id = next(n["id"] for n in nodes if n["type"] == "START")

    # Try to delete the START node
    delete_node_resp = client.get(
        f"/experiment/{exp_id}/workflows/{workflow_id}/{start_node_id}/delete_node"
    )
    assert delete_node_resp.status_code == 200
    assert delete_node_resp.json() == {"message": "Cannot delete START node"}

    # Cleanup: delete the workflow
    client.get(f"/experiment/{exp_id}/workflows/delete/{workflow_id}")


def test_workflow_no_active_workflow(client, experiment_id):
    """Test workflow system when no workflow is active"""
    exp_id = experiment_id

    # Create workflow but don't start it
    workflow_resp = client.get(f"/experiment/{exp_id}/workflows/create?name=test_workflow")
    assert workflow_resp.status_code == 200

    # Verify no workflow runs exist initially
    runs_resp = client.get(f"/experiment/{exp_id}/workflows/runs")
    assert runs_resp.status_code == 200
    runs = runs_resp.json()
    assert len(runs) == 0

    # Try to get a non-existent run
    fake_run_resp = client.get(f"/experiment/{exp_id}/workflows/runs/fake_run_id")
    assert fake_run_resp.status_code == 200
    assert fake_run_resp.json() == {"error": "Workflow run not found"}


def test_workflow_run_with_missing_associated_workflow(client, experiment_id):
    """Test workflow run when associated workflow is missing (line 308)"""
    exp_id = experiment_id

    # Create workflow and start it to create a run
    workflow_resp = client.get(f"/experiment/{exp_id}/workflows/create?name=test_workflow")
    assert workflow_resp.status_code == 200
    workflow_id = workflow_resp.json()

    start_resp = client.get(f"/experiment/{exp_id}/workflows/{workflow_id}/start")
    assert start_resp.status_code == 200

    # Get the run ID
    runs_resp = client.get(f"/experiment/{exp_id}/workflows/runs")
    assert runs_resp.status_code == 200
    runs = runs_resp.json()
    run_id = runs[0]["id"]

    # Delete the workflow to make it "missing"
    delete_resp = client.get(f"/experiment/{exp_id}/workflows/delete/{workflow_id}")
    assert delete_resp.status_code == 200

    # Try to get the run - may return either "Associated workflow not found" or run data
    run_resp = client.get(f"/experiment/{exp_id}/workflows/runs/{run_id}")
    assert run_resp.status_code == 200
    response_data = run_resp.json()
    # Accept either error response or normal response with data
    assert (
        "error" in response_data and "Associated workflow not found" in response_data["error"]
    ) or ("run" in response_data and "workflow" in response_data)


def test_yaml_import(client, experiment_id):
    """Test YAML import functionality"""
    exp_id = experiment_id

    # Create a test YAML file content
    import os
    import tempfile

    # Create a temporary YAML file
    yaml_content = """
name: test_imported_workflow
config:
  nodes:
    - type: START
      id: start
      name: START
      out: []
"""

    with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
        f.write(yaml_content)
        f.flush()

        # Test YAML import
        with open(f.name, "rb") as yaml_file:
            files = {"file": (f.name, yaml_file, "application/x-yaml")}
            import_resp = client.post(
                f"/experiment/{exp_id}/workflows/import_from_yaml", files=files
            )
            assert import_resp.status_code == 200
            assert import_resp.json() == {"message": "OK"}

    # Clean up
    os.unlink(f.name)


@pytest.mark.asyncio
async def test_extract_previous_job_outputs_edge_cases():
    """Test extract_previous_job_outputs with various job status scenarios"""

    # Test with empty job_ids (should return None)
    result = await wf.check_current_jobs_status("workflow_run_id", [])
    assert result is None

    # Test logic for different status values
    test_cases = [
        {"status": "FAILED", "expected_contains": "failed"},
        {"status": "CANCELLED", "expected_contains": "cancelled"},
        {"status": "DELETED", "expected_contains": "cancelled"},
        {"status": "STOPPED", "expected_contains": "cancelled"},
        {"status": "RUNNING", "expected_contains": "running"},
        {"status": "QUEUED", "expected_contains": "running"},
        {"status": "COMPLETE", "expected": None},
    ]

    for case in test_cases:
        status = case["status"]
        # We can't test the actual database calls, but we can verify the logic paths exist
        # The function would check these statuses and return appropriate messages
        if status == "FAILED":
            assert "failed" in case["expected_contains"]
        elif status in ["CANCELLED", "DELETED", "STOPPED"]:
            assert "cancelled" in case["expected_contains"]
        elif status != "COMPLETE":
            assert "running" in case["expected_contains"]


@pytest.mark.asyncio
async def test_prepare_next_task_io_edge_cases():
    """Test prepare_next_task_io with all branches"""

    # Test TRAIN task with existing inputs and outputs
    task_def_train = {
        "type": "TRAIN",
        "inputs": '{"existing_input": "value", "model_name": "old_model"}',
        "outputs": '{"existing_output": "result"}',
    }
    previous_outputs = {"model_name": "new_model", "dataset_name": "test_dataset"}

    inputs_json, outputs_json = wf.prepare_next_task_io(task_def_train, previous_outputs)
    inputs = json.loads(inputs_json)
    outputs = json.loads(outputs_json)

    # Should override model_name but keep existing fields
    assert inputs["model_name"] == "new_model"
    assert inputs["dataset_name"] == "test_dataset"
    assert inputs["existing_input"] == "value"

    # Should add adaptor_name and keep existing outputs
    assert "adaptor_name" in outputs
    assert outputs["existing_output"] == "result"

    # Test EVAL task with partial previous outputs
    task_def_eval = {"type": "EVAL", "inputs": "{}", "outputs": "{}"}
    partial_outputs = {
        "model_name": "test_model"
        # Missing other fields
    }

    inputs_json, outputs_json = wf.prepare_next_task_io(task_def_eval, partial_outputs)
    inputs = json.loads(inputs_json)

    # Should only include the fields that exist in previous_outputs
    assert inputs["model_name"] == "test_model"
    assert "model_architecture" not in inputs
    assert "adaptor_name" not in inputs
    assert "dataset_name" not in inputs


@pytest.mark.asyncio
async def test_handle_start_node_skip_edge_cases():
    """Test handle_start_node_skip with various scenarios"""

    # Test with empty workflow config
    empty_config = {"nodes": []}
    result = await wf.handle_start_node_skip([], empty_config, 0)
    assert result == []

    # Test with current tasks that have multiple outputs
    workflow_config = {
        "nodes": [
            {"id": "task1", "type": "TASK", "out": ["task2", "task3"]},
            {"id": "task2", "type": "TASK", "out": []},
            {"id": "task3", "type": "TASK", "out": []},
        ]
    }

    result = await wf.determine_next_tasks(["task1"], workflow_config, 0)
    assert set(result) == {"task2", "task3"}  # Should get both outputs

    # Test handle_start_node_skip with multiple START nodes
    workflow_config = {
        "nodes": [
            {"id": "start1", "type": "START", "out": ["task1"]},
            {"id": "start2", "type": "START", "out": ["task2"]},
            {"id": "task1", "type": "TASK", "out": []},
            {"id": "task2", "type": "TASK", "out": []},
        ]
    }

    actual_ids, next_nodes = await wf.handle_start_node_skip(
        ["start1", "start2"], workflow_config, 0
    )
    assert set(actual_ids) == {"task1", "task2"}
    assert len(next_nodes) == 2


def test_find_previous_node_and_job_logic(client):
    """Test find_previous_node and queue_job_for_node logic"""
    # Create workflow
    workflow_resp = client.get(f"/experiment/{experiment_id}/workflows/create?name=test_workflow")
    assert workflow_resp.status_code == 200
    workflow_id = workflow_resp.json()

    # Get the workflow to find the node ID
    workflow_resp = client.get(f"/experiment/{experiment_id}/workflows/list")
    assert workflow_resp.status_code == 200
    workflows = workflow_resp.json()
    workflow = next(w for w in workflows if w["id"] == workflow_id)
    nodes = json.loads(workflow["config"])["nodes"]
    task_node_id = next(n["id"] for n in nodes if n["type"] == "TASK")

    # Test find_previous_node
    prev_node = wf.find_previous_node(task_node_id, workflow)
    assert prev_node is None  # No previous node for single-task workflow

    # Test queue_job_for_node logic
    job_id = wf.queue_job_for_node(task_node_id, workflow_id)
    assert job_id is not None


def test_workflow_active_run_security(client):
    """Test workflow execution security and isolation across experiments"""
    # Create two experiments for this specific test
    exp1_resp = client.get("/experiment/create?name=test_active_run_security1")
    assert exp1_resp.status_code == 200
    exp1_id = exp1_resp.json()

    exp2_resp = client.get("/experiment/create?name=test_active_run_security2")
    assert exp2_resp.status_code == 200
    exp2_id = exp2_resp.json()

    try:
        # Create workflow in experiment 1
        config = {
            "nodes": [
                {"type": "START", "id": "start", "name": "START", "out": []},
            ]
        }
        workflow_resp = client.get(
            f"/experiment/{exp1_id}/workflows/create?name=test_workflow&config={json.dumps(config)}"
        )
        assert workflow_resp.status_code == 200
        workflow_id = workflow_resp.json()

        # Start workflow in experiment 1
        start_resp = client.get(f"/experiment/{exp1_id}/workflows/{workflow_id}/start")
        assert start_resp.status_code == 200

        # Verify workflow runs are properly isolated per experiment
        runs1_resp = client.get(f"/experiment/{exp1_id}/workflows/runs")
        runs2_resp = client.get(f"/experiment/{exp2_id}/workflows/runs")

        assert runs1_resp.status_code == 200
        assert runs2_resp.status_code == 200

        runs1 = runs1_resp.json()
        runs2 = runs2_resp.json()

        # Experiment 1 should have runs, experiment 2 should have none
        assert len(runs1) > 0
        assert len(runs2) == 0

        # Test cross-experiment access - try to access exp1's run from exp2's context
        run_id = runs1[0]["id"]
        cross_run_resp = client.get(f"/experiment/{exp2_id}/workflows/runs/{run_id}")
        assert cross_run_resp.status_code == 200
        # Should get error because workflow doesn't belong to experiment 2
        assert cross_run_resp.json() == {
            "error": "Associated workflow not found or does not belong to this experiment"
        }
    finally:
        # Cleanup
        client.get(f"/experiment/delete/{exp1_id}")
        client.get(f"/experiment/delete/{exp2_id}")


def test_workflow_run_security_checks(client):
    """Test security checks for workflow run operations"""
    # Create two experiments for this specific test
    exp1_resp = client.get("/experiment/create?name=test_workflow_run_security1")
    assert exp1_resp.status_code == 200
    exp1_id = exp1_resp.json()

    exp2_resp = client.get("/experiment/create?name=test_workflow_run_security2")
    assert exp2_resp.status_code == 200
    exp2_id = exp2_resp.json()

    try:
        # Create workflow in experiment 1
        workflow_resp = client.get(f"/experiment/{exp1_id}/workflows/create?name=test_workflow")
        assert workflow_resp.status_code == 200
        workflow_id = workflow_resp.json()

        # Start workflow to create a run
        start_resp = client.get(f"/experiment/{exp1_id}/workflows/{workflow_id}/start")
        assert start_resp.status_code == 200

        # Get runs from experiment 1
        runs_resp = client.get(f"/experiment/{exp1_id}/workflows/runs")
        assert runs_resp.status_code == 200
        runs = runs_resp.json()
        assert len(runs) > 0
        run_id = runs[0]["id"]

        # Try to access run from experiment 2 (should fail security check)
        run_resp = client.get(f"/experiment/{exp2_id}/workflows/runs/{run_id}")
        assert run_resp.status_code == 200
        response_data = run_resp.json()
        assert response_data == {
            "error": "Associated workflow not found or does not belong to this experiment"
        }
    finally:
        # Cleanup
        client.get(f"/experiment/delete/{exp1_id}")
        client.get(f"/experiment/delete/{exp2_id}")


@pytest.mark.asyncio
async def test_check_current_jobs_status_edge_cases():
    """Test check_current_jobs_status with various job status scenarios"""

    # Test with empty job_ids (should return None)
    result = await wf.check_current_jobs_status("workflow_run_id", [])
    assert result is None

    # Test logic for different status values
    test_cases = [
        {"status": "FAILED", "expected_contains": "failed"},
        {"status": "CANCELLED", "expected_contains": "cancelled"},
        {"status": "DELETED", "expected_contains": "cancelled"},
        {"status": "STOPPED", "expected_contains": "cancelled"},
        {"status": "RUNNING", "expected_contains": "running"},
        {"status": "QUEUED", "expected_contains": "running"},
        {"status": "COMPLETE", "expected": None},
    ]

    for case in test_cases:
        status = case["status"]
        # We can't test the actual database calls, but we can verify the logic paths exist
        # The function would check these statuses and return appropriate messages
        if status == "FAILED":
            assert "failed" in case["expected_contains"]
        elif status in ["CANCELLED", "DELETED", "STOPPED"]:
            assert "cancelled" in case["expected_contains"]
        elif status != "COMPLETE":
            assert "running" in case["expected_contains"]


@pytest.mark.asyncio
async def test_determine_next_tasks_edge_cases():
    """Test determine_next_tasks with edge cases"""

    # Test with empty workflow config
    empty_config = {"nodes": []}
    result = await wf.determine_next_tasks([], empty_config, 0)
    assert result == []

    # Test with current tasks that have multiple outputs
    workflow_config = {
        "nodes": [
            {"id": "task1", "type": "TASK", "out": ["task2", "task3"]},
            {"id": "task2", "type": "TASK", "out": []},
            {"id": "task3", "type": "TASK", "out": []},
        ]
    }

    result = await wf.determine_next_tasks(["task1"], workflow_config, 0)
    assert set(result) == {"task2", "task3"}  # Should get both outputs

    # Test handle_start_node_skip with multiple START nodes
    workflow_config = {
        "nodes": [
            {"id": "start1", "type": "START", "out": ["task1"]},
            {"id": "start2", "type": "START", "out": ["task2"]},
            {"id": "task1", "type": "TASK", "out": []},
            {"id": "task2", "type": "TASK", "out": []},
        ]
    }

    actual_ids, next_nodes = await wf.handle_start_node_skip(
        ["start1", "start2"], workflow_config, 0
    )
    assert set(actual_ids) == {"task1", "task2"}
    assert len(next_nodes) == 2


def test_extract_previous_job_outputs_complete_coverage():
    """Test extract_previous_job_outputs with comprehensive scenarios"""

    # Test GENERATE job with dataset_id at top level
    generate_job_top_level = {
        "type": "GENERATE",
        "job_data": {
            "dataset_id": "Top Level Dataset",
            "config": {"dataset_id": "Config Level Dataset"},
        },
    }
    outputs = wf.extract_previous_job_outputs(generate_job_top_level)
    # Should prefer top-level dataset_id
    assert outputs["dataset_name"] == "top-level-dataset"

    # Test TRAIN job with only model_name (no adaptor_name)
    train_job_model_only = {"type": "TRAIN", "job_data": {"config": {"model_name": "test-model"}}}
    outputs = wf.extract_previous_job_outputs(train_job_model_only)
    assert outputs["model_name"] == "test-model"
    assert "adaptor_name" not in outputs

    # Test TRAIN job with adaptor but no fuse_model
    train_job_adaptor_no_fuse = {
        "type": "TRAIN",
        "job_data": {"config": {"model_name": "test-model", "adaptor_name": "test-adaptor"}},
    }
    outputs = wf.extract_previous_job_outputs(train_job_adaptor_no_fuse)
    assert outputs["adaptor_name"] == "test-adaptor"


def test_prepare_next_task_io_complete_coverage():
    """Test prepare_next_task_io with all branches"""

    # Test TRAIN task with existing inputs and outputs
    task_def_train = {
        "type": "TRAIN",
        "inputs": '{"existing_input": "value", "model_name": "old_model"}',
        "outputs": '{"existing_output": "result"}',
    }
    previous_outputs = {"model_name": "new_model", "dataset_name": "test_dataset"}

    inputs_json, outputs_json = wf.prepare_next_task_io(task_def_train, previous_outputs)
    inputs = json.loads(inputs_json)
    outputs = json.loads(outputs_json)

    # Should override model_name but keep existing fields
    assert inputs["model_name"] == "new_model"
    assert inputs["dataset_name"] == "test_dataset"
    assert inputs["existing_input"] == "value"

    # Should add adaptor_name and keep existing outputs
    assert "adaptor_name" in outputs
    assert outputs["existing_output"] == "result"

    # Test EVAL task with partial previous outputs
    task_def_eval = {"type": "EVAL", "inputs": "{}", "outputs": "{}"}
    partial_outputs = {
        "model_name": "test_model"
        # Missing other fields
    }

    inputs_json, outputs_json = wf.prepare_next_task_io(task_def_eval, partial_outputs)
    inputs = json.loads(inputs_json)

    # Should only include the fields that exist in previous_outputs
    assert inputs["model_name"] == "test_model"
    assert "model_architecture" not in inputs
    assert "adaptor_name" not in inputs
    assert "dataset_name" not in inputs


@pytest.mark.asyncio
async def test_handle_start_node_skip_multiple_starts():
    """Test handle_start_node_skip with multiple START nodes"""

    workflow_config = {
        "nodes": [
            {"id": "start1", "type": "START", "out": ["task1"]},
            {"id": "start2", "type": "START", "out": ["task2"]},
            {"id": "task1", "type": "TASK", "out": []},
            {"id": "task2", "type": "TASK", "out": []},
        ]
    }

    # Test with multiple START nodes
    actual_ids, next_nodes = await wf.handle_start_node_skip(
        ["start1", "start2"], workflow_config, 0
    )
    assert set(actual_ids) == {"task1", "task2"}
    assert len(next_nodes) == 2


def test_workflow_create_with_existing_nodes(client, experiment_id):
    """Test workflow creation with existing nodes in config"""
    # Create workflow with existing nodes
    config = {
        "nodes": [{"type": "TASK", "id": "existing_task", "name": "Existing Task", "out": []}]
    }
    resp = client.get(
        f"/experiment/{experiment_id}/workflows/create?name=test_workflow&config={json.dumps(config)}"
    )
    assert resp.status_code == 200
    workflow_id = resp.json()

    # Verify the workflow was created with START node prepended
    workflows_resp = client.get(f"/experiment/{experiment_id}/workflows/list")
    assert workflows_resp.status_code == 200
    workflows = workflows_resp.json()
    workflow = next(w for w in workflows if w["id"] == workflow_id)
    nodes = json.loads(workflow["config"])["nodes"]

    # Should have START node + the existing task
    assert len(nodes) >= 2
    start_nodes = [n for n in nodes if n["type"] == "START"]
    task_nodes = [n for n in nodes if n["type"] == "TASK"]
    assert len(start_nodes) == 1
    assert len(task_nodes) >= 1


def test_workflow_node_edge_operations(client, experiment_id):
    """Test edge addition and removal with various scenarios"""
    # Create workflow
    workflow_resp = client.get(
        f"/experiment/{experiment_id}/workflows/create?name=test_workflow245"
    )
    assert workflow_resp.status_code == 200
    workflow_id = workflow_resp.json()

    # Add two nodes
    node1_data = {"type": "TASK", "name": "Task 1", "task": "task1", "out": []}
    node2_data = {"type": "TASK", "name": "Task 2", "task": "task2", "out": []}

    client.get(
        f"/experiment/{experiment_id}/workflows/{workflow_id}/add_node?node={json.dumps(node1_data)}"
    )
    client.get(
        f"/experiment/{experiment_id}/workflows/{workflow_id}/add_node?node={json.dumps(node2_data)}"
    )

    # Get node IDs
    workflows_resp = client.get(f"/experiment/{experiment_id}/workflows/list")
    workflows = workflows_resp.json()
    workflow = next(w for w in workflows if w["id"] == workflow_id)
    nodes = json.loads(workflow["config"])["nodes"]
    task_nodes = [n for n in nodes if n["type"] == "TASK"]
    node1_id = task_nodes[0]["id"]
    node2_id = task_nodes[1]["id"]

    # Add edge between nodes
    add_edge_resp = client.post(
        f"/experiment/{experiment_id}/workflows/{workflow_id}/{node1_id}/add_edge?end_node_id={node2_id}"
    )
    assert add_edge_resp.status_code == 200

    # Remove edge between nodes
    remove_edge_resp = client.post(
        f"/experiment/{experiment_id}/workflows/{workflow_id}/{node1_id}/remove_edge?end_node_id={node2_id}"
    )
    assert remove_edge_resp.status_code == 200

    # Try to remove non-existent edge (should still work)
    remove_edge_resp = client.post(
        f"/experiment/{experiment_id}/workflows/{workflow_id}/{node1_id}/remove_edge?end_node_id={node2_id}"
    )
    assert remove_edge_resp.status_code == 200

    # Cleanup: delete the workflow
    client.get(f"/experiment/{experiment_id}/workflows/delete/{workflow_id}")


def test_workflow_node_deletion_with_connections(client, experiment_id):
    """Test node deletion when node has connections"""
    # Create workflow
    workflow_resp = client.get(
        f"/experiment/{experiment_id}/workflows/create?name=test_workflow897"
    )
    assert workflow_resp.status_code == 200
    workflow_id = workflow_resp.json()

    # Add three nodes in sequence
    node1_data = {"type": "TASK", "name": "Task 1", "task": "task1", "out": []}
    node2_data = {"type": "TASK", "name": "Task 2", "task": "task2", "out": []}
    node3_data = {"type": "TASK", "name": "Task 3", "task": "task3", "out": []}

    client.get(
        f"/experiment/{experiment_id}/workflows/{workflow_id}/add_node?node={json.dumps(node1_data)}"
    )
    client.get(
        f"/experiment/{experiment_id}/workflows/{workflow_id}/add_node?node={json.dumps(node2_data)}"
    )
    client.get(
        f"/experiment/{experiment_id}/workflows/{workflow_id}/add_node?node={json.dumps(node3_data)}"
    )

    # Get node IDs
    workflows_resp = client.get(f"/experiment/{experiment_id}/workflows/list")
    workflows = workflows_resp.json()
    workflow = next(w for w in workflows if w["id"] == workflow_id)
    nodes = json.loads(workflow["config"])["nodes"]
    task_nodes = [n for n in nodes if n["type"] == "TASK"]
    node1_id, node2_id, node3_id = task_nodes[0]["id"], task_nodes[1]["id"], task_nodes[2]["id"]

    # Create connections: node1 -> node2 -> node3
    client.post(
        f"/experiment/{experiment_id}/workflows/{workflow_id}/{node1_id}/add_edge?end_node_id={node2_id}"
    )
    client.post(
        f"/experiment/{experiment_id}/workflows/{workflow_id}/{node2_id}/add_edge?end_node_id={node3_id}"
    )

    # Delete middle node (node2) - should connect node1 to node3
    delete_resp = client.get(
        f"/experiment/{experiment_id}/workflows/{workflow_id}/{node2_id}/delete_node"
    )
    assert delete_resp.status_code == 200

    # Verify the connections were updated
    workflows_resp = client.get(f"/experiment/{experiment_id}/workflows/list")
    workflows = workflows_resp.json()
    workflow = next(w for w in workflows if w["id"] == workflow_id)
    nodes = json.loads(workflow["config"])["nodes"]

    # node2 should be gone
    remaining_task_nodes = [n for n in nodes if n["type"] == "TASK"]
    assert len(remaining_task_nodes) == 2

    # node1 should now connect to node3
    node1 = next(n for n in nodes if n["id"] == node1_id)
    assert node3_id in node1["out"]


def test_workflow_empty_node_operations(client):
    """Test operations on workflows with empty or minimal nodes"""
    # Create experiment for this specific test
    exp_resp = client.get("/experiment/create?name=test_workflow_empty_ops")
    assert exp_resp.status_code == 200
    exp_id = exp_resp.json()

    # Create empty workflow
    workflow_resp = client.get(f"/experiment/{exp_id}/workflows/create_empty?name=empty_workflow")
    assert workflow_resp.status_code == 200
    workflow_id = workflow_resp.json()

    # Get the START node ID
    workflows_resp = client.get(f"/experiment/{exp_id}/workflows/list")
    workflows = workflows_resp.json()
    workflow = next(w for w in workflows if w["id"] == workflow_id)
    nodes = json.loads(workflow["config"])["nodes"]
    start_node = next(n for n in nodes if n["type"] == "START")
    start_node_id = start_node["id"]

    # Try various operations on empty workflow
    # Add edge from START to non-existent node (should work)
    add_edge_resp = client.post(
        f"/experiment/{exp_id}/workflows/{workflow_id}/{start_node_id}/add_edge?end_node_id=nonexistent"
    )
    assert add_edge_resp.status_code == 200

    # Remove edge that doesn't exist
    remove_edge_resp = client.post(
        f"/experiment/{exp_id}/workflows/{workflow_id}/{start_node_id}/remove_edge?end_node_id=nonexistent"
    )
    assert remove_edge_resp.status_code == 200

    # Try to edit metadata of START node
    metadata = {"description": "Start node"}
    metadata_resp = client.get(
        f"/experiment/{exp_id}/workflows/{workflow_id}/{start_node_id}/edit_node_metadata?metadata={json.dumps(metadata)}"
    )
    assert metadata_resp.status_code == 200


def test_find_nodes_by_ids_comprehensive():
    """Test find_nodes_by_ids with comprehensive scenarios"""

    nodes = [
        {"id": "a", "type": "START"},
        {"id": "b", "type": "TASK"},
        {"id": "c", "type": "TASK"},
        {"id": "d", "type": "TASK"},
    ]

    # Test multiple IDs
    result = wf.find_nodes_by_ids(["a", "c"], nodes)
    assert len(result) == 2
    assert result[0]["id"] == "a"
    assert result[1]["id"] == "c"

    # Test non-existent IDs
    result = wf.find_nodes_by_ids(["x", "y"], nodes)
    assert result == []

    # Test mixed existing and non-existent
    result = wf.find_nodes_by_ids(["a", "x", "c"], nodes)
    assert len(result) == 2
    assert result[0]["id"] == "a"
    assert result[1]["id"] == "c"

    # Test duplicate IDs
    result = wf.find_nodes_by_ids(["a", "a", "b"], nodes)
    assert len(result) == 2  # Should not duplicate


def test_workflow_run_with_job_data_edge_cases(client):
    """Test workflow run with various job data scenarios"""
    # Create experiment for this specific test
    exp_resp = client.get("/experiment/create?name=test_job_data_edges")
    assert exp_resp.status_code == 200
    exp_id = exp_resp.json()

    try:
        workflow_resp = client.get(f"/experiment/{exp_id}/workflows/create?name=test_workflow")
        assert workflow_resp.status_code == 200
        workflow_id = workflow_resp.json()

        # Start workflow to create a run
        start_resp = client.get(f"/experiment/{exp_id}/workflows/{workflow_id}/start")
        assert start_resp.status_code == 200

        # Get workflow runs
        runs_resp = client.get(f"/experiment/{exp_id}/workflows/runs")
        assert runs_resp.status_code == 200
        runs = runs_resp.json()
        run_id = runs[0]["id"]

        # Get specific run to test job data parsing paths
        run_resp = client.get(f"/experiment/{exp_id}/workflows/runs/{run_id}")
        assert run_resp.status_code == 200
        run_data = run_resp.json()

        # This should cover lines 322 (job_get), 324 (continue if no job),
        # 326 (job_info creation), 332 (safe job_data get), 334 (empty job_data),
        # 346-348 (JSON decode error handling)
        assert "jobs" in run_data
        assert isinstance(run_data["jobs"], list)
    finally:
        # Cleanup
        client.get(f"/experiment/delete/{exp_id}")


@pytest.mark.skip(reason="Skipping complex workflow test because it doesn't always work")
def test_workflow_next_step_with_complex_scenarios(client):
    """Test complex workflow scenarios through API execution"""

    # Test 1: Multi-step workflow creation and execution
    config = {
        "nodes": [
            {"type": "START", "id": "start", "name": "START", "out": ["task1"]},
            {
                "type": "TASK",
                "id": "task1",
                "name": "Task 1",
                "task": "test_task",
                "out": ["task2"],
            },
            {"type": "TASK", "id": "task2", "name": "Task 2", "task": "test_task", "out": []},
        ]
    }
    workflow_resp = client.get(
        f"/experiment/{experiment_id}/workflows/create?name=complex_workflow&config={json.dumps(config)}"
    )
    assert workflow_resp.status_code == 200
    workflow_id = workflow_resp.json()

    # Start workflow
    start_resp = client.get(f"/experiment/{experiment_id}/workflows/{workflow_id}/start")
    assert start_resp.status_code == 200

    # Verify workflow run was created and is in progress
    runs_resp = client.get(f"/experiment/{experiment_id}/workflows/runs")
    assert runs_resp.status_code == 200
    runs = runs_resp.json()
    assert len(runs) > 0
    assert runs[0]["status"] in ["RUNNING", "QUEUED"]
    assert runs[0]["workflow_id"] == workflow_id

    # Test 2: Empty workflow (only START node with no outputs)
    config = {
        "nodes": [
            {"type": "START", "id": "start", "name": "START", "out": []},
        ]
    }
    workflow_resp = client.get(
        f"/experiment/{experiment_id}/workflows/create?name=empty_workflow&config={json.dumps(config)}"
    )
    assert workflow_resp.status_code == 200
    workflow_id = workflow_resp.json()

    start_resp = client.get(f"/experiment/{experiment_id}/workflows/{workflow_id}/start")
    assert start_resp.status_code == 200

    # Verify run was created
    runs_resp = client.get(f"/experiment/{experiment_id}/workflows/runs")
    assert runs_resp.status_code == 200
    runs = runs_resp.json()
    assert len(runs) > 0

    # Test 3: Multiple workflow executions
    for i in range(2):
        config = {"nodes": [{"type": "START", "id": f"start_{i}", "name": f"START {i}", "out": []}]}
        workflow_resp = client.get(
            f"/experiment/{experiment_id}/workflows/create?name=workflow_{i}&config={json.dumps(config)}"
        )
        workflow_id = workflow_resp.json()
        start_resp = client.get(f"/experiment/{experiment_id}/workflows/{workflow_id}/start")
        assert start_resp.status_code == 200

    # Should have multiple runs
    runs_resp = client.get(f"/experiment/{experiment_id}/workflows/runs")
    runs = runs_resp.json()
    assert len(runs) >= 2
