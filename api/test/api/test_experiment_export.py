import json
import os

import pytest
from lab import storage

from transformerlab.services import experiment_service
from transformerlab.services.tasks_service import tasks_service


@pytest.mark.skip(reason="Test needs to be updated for org-based workspace")
async def test_export_experiment(client):
    """Test exporting an experiment to JSON format"""
    # Create a test experiment
    test_experiment_name = f"test_export_{os.getpid()}"
    config = {"description": "Test experiment"}
    experiment_id = experiment_service.experiment_create(test_experiment_name, config)

    # Add a training task
    train_config = {
        "template_name": "TestTemplate",
        "plugin_name": "test_trainer",
        "model_name": "test-model",
        "dataset_name": "test-dataset",
        "batch_size": "4",
        "learning_rate": "0.0001",
    }
    tasks_service.add_task(
        name="test_train_task",
        task_type="TRAIN",
        inputs={"model_name": "test-model", "dataset_name": "test-dataset"},
        config=train_config,
        plugin="test_trainer",
        outputs={},
        experiment_id=experiment_id,
    )

    # Add an evaluation task
    eval_config = {
        "template_name": "TestEval",
        "plugin_name": "test_evaluator",
        "model_name": "test-model-2",
        "eval_type": "basic",
        "script_parameters": {"tasks": ["mmlu"], "limit": 0.5},
        "eval_dataset": "test-eval-dataset",
    }
    tasks_service.add_task(
        name="test_eval_task",
        task_type="EVAL",
        inputs={"model_name": "test-model-2", "dataset_name": "test-eval-dataset"},
        config=eval_config,
        plugin="test_evaluator",
        outputs={"eval_results": "{}"},
        experiment_id=experiment_id,
    )

    # Add a workflow - COMMENTED OUT due to workflow migration issues
    # workflow_config = {
    #     "nodes": [{"id": "1", "task": "test_train_task"}, {"id": "2", "task": "test_eval_task"}],
    #     "edges": [{"source": "1", "target": "2"}],
    # }
    # await db_workflows.workflow_create(
    #     name="test_workflow", config=json.dumps(workflow_config), experiment_id=experiment_id
    # )

    # Call the export endpoint
    response = client.get(f"/experiment/{experiment_id}/export_to_recipe")
    assert response.status_code == 200

    # The response should be a JSON file
    assert response.headers["content-type"] == "application/json"

    # Get the workspace_dir using team_id from the client (org-based workspace)
    from lab import HOME_DIR

    workspace_dir = storage.join(HOME_DIR, "orgs", client._team_id, "workspace")

    # Read the exported file from workspace directory
    export_file = storage.join(workspace_dir, f"{test_experiment_name}_export.json")
    assert storage.exists(export_file)

    with storage.open(export_file, "r") as f:
        exported_data = json.load(f)

    # Verify the exported data structure
    assert exported_data["title"] == test_experiment_name
    assert "dependencies" in exported_data
    assert "tasks" in exported_data
    # assert "workflows" in exported_data

    # Verify dependencies were collected correctly
    dependencies = {(d["type"], d["name"]) for d in exported_data["dependencies"]}
    assert ("model", "test-model") in dependencies
    assert ("model", "test-model-2") in dependencies
    assert ("dataset", "test-dataset") in dependencies
    assert ("plugin", "test_trainer") in dependencies
    assert ("plugin", "test_evaluator") in dependencies

    # Verify tasks were exported correctly
    tasks = {t["name"]: t for t in exported_data["tasks"]}
    assert "test_train_task" in tasks
    assert "test_eval_task" in tasks
    assert tasks["test_train_task"]["task_type"] == "TRAIN"
    assert tasks["test_eval_task"]["task_type"] == "EVAL"

    # Verify workflow was exported correctly - COMMENTED OUT due to workflow migration issues
    # workflows = {w["name"]: w for w in exported_data["workflows"]}
    # assert "test_workflow" in workflows
    # assert len(workflows["test_workflow"]["config"]["nodes"]) == 2
    # assert len(workflows["test_workflow"]["config"]["edges"]) == 1

    # Clean up
    experiment_service.experiment_delete(experiment_id)
    if storage.exists(export_file):
        storage.rm(export_file)
