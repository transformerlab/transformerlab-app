import json

import pytest

from transformerlab.routers.experiment.workflows import workflows_get_by_trigger_type

pytestmark = pytest.mark.skip("Skipping all workflow trigger tests due to database index conflicts")


def test_workflow_triggers_endpoint_basic_functionality(client, experiment_id):
    """Test basic workflow triggering functionality"""
    # Create a workflow with TRAIN trigger
    config = {
        "nodes": [{"type": "START", "id": "start", "name": "START", "out": []}],
        "triggers": ["TRAIN"],
    }
    resp = client.get(
        f"/experiment/{experiment_id}/workflows/create",
        params={"name": "test_trigger_workflow", "config": json.dumps(config)},
    )
    assert resp.status_code == 200

    # Test the function directly
    import asyncio

    workflows = asyncio.run(workflows_get_by_trigger_type(experiment_id, "TRAIN"))
    assert isinstance(workflows, list)
    assert len(workflows) == 1


def test_workflow_triggers_endpoint_export_model_mapping(client, experiment_id):
    """Test that EXPORT trigger works correctly"""
    # Create a workflow with EXPORT trigger
    config = {
        "nodes": [{"type": "START", "id": "start", "name": "START", "out": []}],
        "triggers": ["EXPORT"],
    }
    resp = client.get(
        f"/experiment/{experiment_id}/workflows/create",
        params={"name": "test_export_trigger", "config": json.dumps(config)},
    )
    assert resp.status_code == 200

    # Test the function directly
    import asyncio

    workflows = asyncio.run(workflows_get_by_trigger_type(experiment_id, "EXPORT"))
    assert isinstance(workflows, list)
    assert len(workflows) == 1


def test_workflow_triggers_endpoint_error_handling(client, experiment_id):
    """Test that malformed configs are handled gracefully"""
    # Create a workflow with malformed config directly in the database
    import asyncio

    from transformerlab.db.workflows import workflow_create

    async def create_malformed_workflow():
        return await workflow_create("test_malformed_trigger", "invalid json", experiment_id)

    workflow_id = asyncio.run(create_malformed_workflow())
    assert workflow_id is not None

    # Test that malformed config doesn't crash the function
    workflows = asyncio.run(workflows_get_by_trigger_type(experiment_id, "TRAIN"))
    assert isinstance(workflows, list)
    # Should not contain the malformed workflow


def test_workflow_triggers_endpoint_no_matching_triggers(client, experiment_id):
    """Test that no workflows are returned when no triggers match"""
    # Create a workflow with EVAL trigger
    config = {
        "nodes": [{"type": "START", "id": "start", "name": "START", "out": []}],
        "triggers": ["EVAL"],
    }
    resp = client.get(
        f"/experiment/{experiment_id}/workflows/create",
        params={"name": "test_eval_workflow", "config": json.dumps(config)},
    )
    assert resp.status_code == 200

    # Test with different trigger type
    import asyncio

    workflows = asyncio.run(workflows_get_by_trigger_type(experiment_id, "GENERATE"))
    assert isinstance(workflows, list)
    assert len(workflows) == 0


@pytest.fixture
def experiment_id():
    from transformerlab.services.experiment_service import experiment_create, experiment_delete

    exp_id = experiment_create("test_experiment", {})
    yield exp_id
    experiment_delete(exp_id)
