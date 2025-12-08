import os

import pytest

# skip all tests in this file
pytestmark = pytest.mark.skip("skipping these as they need to be fixed")

TEST_EXP_RECIPES = [
    {
        "id": "1",
        "title": "Test Recipe - With Notes",
        "description": "A test recipe with notes to test notes creation",
        "notes": "# Test Recipe Notes\n\nThis is a test recipe for unit testing.\n\n## Features\n- Notes creation\n- Task generation\n\n## Usage\nThis should create a readme.md file in the experiment.",
        "dependencies": [
            {"type": "model", "name": "test-model"},
            {"type": "dataset", "name": "test-dataset"},
        ],
    },
    {
        "id": "2",
        "title": "Test Recipe - With Tasks and Notes",
        "description": "A test recipe that includes both notes and tasks",
        "notes": "# Training Recipe\n\nThis recipe includes training tasks.\n\n## Training Configuration\n- Uses LoRA training\n- Batch size: 4\n- Learning rate: 0.0001",
        "dependencies": [
            {"type": "model", "name": "test-model-2"},
            {"type": "dataset", "name": "test-dataset-for-training"},
        ],
        "tasks": [
            {
                "name": "test_train_task",
                "task_type": "TRAIN",
                "type": "LoRA",
                "plugin": "test_trainer",
                "formatting_template": "{{prompt}}\n{{completion}}",
                "config_json": '{"template_name":"TestTemplate","plugin_name":"test_trainer","model_name":"test-model-2","dataset_name":"test-dataset-for-training","batch_size":"4","learning_rate":"0.0001"}',
            }
        ],
    },
    {
        "id": "3",
        "title": "Test Recipe - Tasks Only",
        "description": "A test recipe with only tasks, no notes",
        "dependencies": [
            {"type": "model", "name": "test-model-3"},
            {"type": "dataset", "name": "test-dataset-3"},
        ],
        "tasks": [
            {
                "name": "single_train_task",
                "task_type": "TRAIN",
                "type": "LoRA",
                "plugin": "mlx_lora_trainer",
                "formatting_template": "{{text}}",
                "config_json": '{"template_name":"NoNotesTemplate","plugin_name":"mlx_lora_trainer","model_name":"test-model-3","dataset_name":"test-dataset-3","batch_size":"8","learning_rate":"0.001"}',
            }
        ],
    },
    {
        "id": "4",
        "title": "Test Recipe - With Adaptor Name",
        "description": "A test recipe that includes adaptor_name in config to test line 281",
        "dependencies": [
            {"type": "model", "name": "test-model-4"},
            {"type": "dataset", "name": "test-dataset-4"},
        ],
        "tasks": [
            {
                "name": "adaptor_train_task",
                "task_type": "TRAIN",
                "type": "LoRA",
                "plugin": "test_trainer",
                "formatting_template": "{{prompt}}\n{{completion}}",
                "config_json": '{"template_name":"AdaptorTest","plugin_name":"test_trainer","model_name":"test-model-4","dataset_name":"test-dataset-4","adaptor_name":"test_adaptor","batch_size":"4","learning_rate":"0.0001"}',
            }
        ],
    },
    {
        "id": "5",
        "title": "Test Recipe - Invalid JSON Config",
        "description": "A test recipe with invalid JSON to test exception handling",
        "dependencies": [
            {"type": "model", "name": "test-model-5"},
            {"type": "dataset", "name": "test-dataset-5"},
        ],
        "tasks": [
            {
                "name": "invalid_json_task",
                "task_type": "TRAIN",
                "type": "LoRA",
                "plugin": "test_trainer",
                "formatting_template": "{{prompt}}\n{{completion}}",
                "config_json": "{invalid json syntax to trigger exception",
            }
        ],
    },
    {
        "id": "6",
        "title": "Test Recipe - With Multiple Task Types",
        "description": "A test recipe that includes training, evaluation and generation tasks",
        "dependencies": [
            {"type": "model", "name": "test-model-6"},
            {"type": "dataset", "name": "test-dataset-6"},
        ],
        "tasks": [
            {
                "name": "multi_train_task",
                "task_type": "TRAIN",
                "type": "LoRA",
                "plugin": "test_trainer",
                "formatting_template": "{{prompt}}\n{{completion}}",
                "config_json": '{"template_name":"TestTemplate","plugin_name":"test_trainer","model_name":"test-model-6","dataset_name":"test-dataset-6","batch_size":"4","learning_rate":"0.0001"}',
            },
            {
                "name": "multi_eval_task",
                "task_type": "EVAL",
                "plugin": "test_evaluator",
                "config_json": '{"template_name":"TestEval","plugin_name":"test_evaluator","model_name":"test-model-6","eval_type":"basic","script_parameters":{"tasks":["mmlu","hellaswag"],"limit":0.5,"device_map":{"model":"auto","tensor_parallel":true}},"eval_dataset":"test-eval-dataset"}',
            },
            {
                "name": "multi_generate_task",
                "task_type": "GENERATE",
                "plugin": "test_generator",
                "config_json": '{"template_name":"TestGen","plugin_name":"test_generator","model_name":"test-model-6","prompt_template":"Generate a response: {{input}}","generation_params":{"max_length":100,"temperature":0.7}}',
            },
        ],
    },
    {
        "id": "7",
        "title": "Test Recipe - With Multiple Workflows",
        "description": "A test recipe that includes multiple workflows",
        "dependencies": [
            {"type": "model", "name": "test-model-8"},
            {"type": "dataset", "name": "test-dataset-8"},
        ],
        "tasks": [
            {
                "name": "workflow_train_task",
                "task_type": "TRAIN",
                "type": "LoRA",
                "plugin": "test_trainer",
                "formatting_template": "{{prompt}}\n{{completion}}",
                "config_json": '{"template_name":"MultiWorkflowTrain","plugin_name":"test_trainer","model_name":"test-model-8","dataset_name":"test-dataset-8","batch_size":"4","learning_rate":"0.0001"}',
            },
            {
                "name": "workflow_eval_task",
                "task_type": "EVAL",
                "plugin": "test_evaluator",
                "config_json": '{"template_name":"MultiWorkflowEval","plugin_name":"test_evaluator","model_name":"test-model-8","tasks":"mmlu","limit":"0.5","run_name":"MultiWorkflowEval"}',
            },
        ],
        "workflows": [
            {
                "name": "Train_Only_Workflow",
                "config": {
                    "nodes": [
                        {
                            "id": "node_train",
                            "type": "TRAIN",
                            "task": "workflow_train_task",
                            "name": "Training Task",
                            "out": [],
                        }
                    ]
                },
            },
            {
                "name": "Train_Eval_Workflow",
                "config": {
                    "nodes": [
                        {
                            "id": "node_train",
                            "type": "TRAIN",
                            "task": "workflow_train_task",
                            "name": "Training Task",
                            "out": ["node_eval"],
                        },
                        {
                            "id": "node_eval",
                            "type": "EVAL",
                            "task": "workflow_eval_task",
                            "name": "Evaluation Task",
                            "out": [],
                        },
                    ]
                },
            },
        ],
    },
    {
        "id": "8",
        "title": "Test Recipe - With Invalid Workflow Config",
        "description": "A test recipe with invalid workflow config to test error handling",
        "dependencies": [
            {"type": "model", "name": "test-model-9"},
            {"type": "dataset", "name": "test-dataset-9"},
        ],
        "tasks": [
            {
                "name": "invalid_workflow_train_task",
                "task_type": "TRAIN",
                "type": "LoRA",
                "plugin": "test_trainer",
                "formatting_template": "{{prompt}}\n{{completion}}",
                "config_json": '{"template_name":"InvalidWorkflowTrain","plugin_name":"test_trainer","model_name":"test-model-9","dataset_name":"test-dataset-9","batch_size":"4","learning_rate":"0.0001"}',
            }
        ],
        "workflows": [{"name": "Invalid_Workflow", "config": "invalid_config_format"}],
    },
    {
        "id": "9",
        "title": "Test Recipe - With Named Tasks",
        "description": "A test recipe with explicitly named tasks",
        "dependencies": [
            {"type": "model", "name": "test-model-10"},
            {"type": "dataset", "name": "test-dataset-10"},
        ],
        "tasks": [
            {
                "name": "custom_train_task",
                "task_type": "TRAIN",
                "type": "LoRA",
                "plugin": "test_trainer",
                "formatting_template": "{{prompt}}\n{{completion}}",
                "config_json": '{"template_name":"NamedTaskTrain","plugin_name":"test_trainer","model_name":"test-model-10","dataset_name":"test-dataset-10","batch_size":"4","learning_rate":"0.0001"}',
            },
            {
                "name": "custom_eval_task",
                "task_type": "EVAL",
                "plugin": "test_evaluator",
                "config_json": '{"template_name":"NamedTaskEval","plugin_name":"test_evaluator","model_name":"test-model-10","tasks":"mmlu","limit":"0.5","run_name":"NamedTaskEval"}',
            },
        ],
    },
]


def test_recipes_list(client):
    resp = client.get("/recipes/list")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 6  # Should have our test recipes (updated count)


def test_recipes_get_by_id_with_notes(client):
    resp = client.get("/recipes/1")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == "1"
    assert data["title"] == "Test Recipe - With Notes"
    assert "notes" in data
    assert "# Test Recipe Notes" in data["notes"]


def test_recipes_get_by_id_with_tasks(client):
    resp = client.get("/recipes/2")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == "2"
    assert "tasks" in data
    assert len(data["tasks"]) == 1
    assert data["tasks"][0]["task_type"] == "TRAIN"


def test_create_experiment_with_notes(client):
    test_experiment_name = f"test_notes_exp_{os.getpid()}"
    resp = client.post(f"/recipes/1/create_experiment?experiment_name={test_experiment_name}")
    assert resp.status_code == 200
    data = resp.json()
    assert "status" in data or "message" in data


def test_create_experiment_with_tasks(client):
    test_experiment_name = f"test_tasks_exp_{os.getpid()}"
    resp = client.post(f"/recipes/2/create_experiment?experiment_name={test_experiment_name}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert "data" in data
    assert "task_results" in data["data"]
    task_results = data["data"]["task_results"]
    assert len(task_results) == 1
    assert task_results[0]["task_name"] == "test_train_task"
    assert task_results[0]["task_type"] == "TRAIN"


def test_create_experiment_tasks_only(client):
    test_experiment_name = f"test_tasks_only_{os.getpid()}"
    resp = client.post(f"/recipes/3/create_experiment?experiment_name={test_experiment_name}")
    assert resp.status_code == 200
    data = resp.json()
    assert "status" in data or "message" in data


def test_create_experiment_duplicate_name(client):
    test_experiment_name = f"duplicate_test_{os.getpid()}"

    # First creation
    resp1 = client.post(f"/recipes/1/create_experiment?experiment_name={test_experiment_name}")
    assert resp1.status_code == 200

    # Second creation with same name should fail
    resp2 = client.post(f"/recipes/1/create_experiment?experiment_name={test_experiment_name}")
    assert resp2.status_code == 200
    data = resp2.json()
    assert data.get("status") == "error"
    assert "already exists" in data.get("message", "")


def test_create_experiment_invalid_recipe_id(client):
    test_experiment_name = f"invalid_recipe_test_{os.getpid()}"
    resp = client.post(f"/recipes/999/create_experiment?experiment_name={test_experiment_name}")
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("status") == "error"
    assert "not found" in data.get("message", "")


def test_create_experiment_with_adaptor_name(client):
    """Test creating experiment with recipe that has adaptor_name in config (covers line 281)"""
    test_experiment_name = f"test_adaptor_{os.getpid()}"
    resp = client.post(f"/recipes/4/create_experiment?experiment_name={test_experiment_name}")
    assert resp.status_code == 200
    data = resp.json()
    assert "status" in data or "message" in data
    if data.get("status") == "success":
        assert "data" in data
        assert "task_results" in data["data"]


def test_create_experiment_with_invalid_json_config(client):
    """Test creating experiment with invalid JSON config to trigger exception handling (covers lines 306-307)"""
    test_experiment_name = f"test_invalid_json_{os.getpid()}"
    resp = client.post(f"/recipes/5/create_experiment?experiment_name={test_experiment_name}")
    assert resp.status_code == 200
    data = resp.json()
    assert "status" in data or "message" in data
    if data.get("status") == "success" and "data" in data and "task_results" in data["data"]:
        task_results = data["data"]["task_results"]
        assert len(task_results) > 0
        has_error = any("error" in result.get("status", "") for result in task_results)
        assert has_error


def test_recipes_get_by_id_with_multiple_task_types(client):
    """Test that a recipe with multiple task types (TRAIN, EVAL, GENERATE) is handled correctly"""
    resp = client.get("/recipes/6")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == "6"
    assert "tasks" in data
    assert len(data["tasks"]) == 3
    task_types = [task["task_type"] for task in data["tasks"]]
    assert "TRAIN" in task_types
    assert "EVAL" in task_types
    assert "GENERATE" in task_types


def test_create_experiment_with_multiple_task_types(client):
    """Test creating an experiment with multiple task types"""
    test_experiment_name = f"test_multi_tasks_{os.getpid()}"
    resp = client.post(f"/recipes/6/create_experiment?experiment_name={test_experiment_name}")
    assert resp.status_code == 200
    data = resp.json()
    assert "status" in data
    if data.get("status") == "success":
        assert "data" in data
        assert "task_results" in data["data"]
        task_results = data["data"]["task_results"]
        assert len(task_results) == 3

        # Verify task names and types
        task_names = [result["task_name"] for result in task_results]
        assert "multi_train_task" in task_names
        assert "multi_eval_task" in task_names
        assert "multi_generate_task" in task_names

        # Verify task types
        task_types = [result["task_type"] for result in task_results]
        assert "TRAIN" in task_types
        assert "EVAL" in task_types
        assert "GENERATE" in task_types


def test_create_experiment_with_script_parameters_list_dict(client):
    """Test creating experiment with recipe that has list and dict values in script_parameters (covers line 276)"""
    test_experiment_name = f"test_script_params_{os.getpid()}"
    resp = client.post(f"/recipes/10/create_experiment?experiment_name={test_experiment_name}")
    assert resp.status_code == 200
    data = resp.json()
    assert "status" in data or "message" in data
    if data.get("status") == "success":
        assert "data" in data
        assert "task_results" in data["data"]
        task_results = data["data"]["task_results"]
        assert len(task_results) == 1
        task_result = task_results[0]
        assert task_result.get("task_type") == "EVAL"
        assert task_result.get("action") == "create_task"


def test_recipes_get_by_id_with_workflows(client):
    """Test that a recipe with workflows is handled correctly"""
    resp = client.get("/recipes/7")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == "7"
    assert "workflows" in data
    assert len(data["workflows"]) == 2  # Recipe 7 has 2 workflows
    workflow_names = [wf["name"] for wf in data["workflows"]]
    assert "Train_Only_Workflow" in workflow_names
    assert "Train_Eval_Workflow" in workflow_names
    for workflow in data["workflows"]:
        assert "config" in workflow
        assert "nodes" in workflow["config"]
        assert len(workflow["config"]["nodes"]) > 0


def test_create_experiment_with_workflows(client):
    """Test creating an experiment with workflows"""
    test_experiment_name = f"test_workflows_{os.getpid()}"
    resp = client.post(f"/recipes/7/create_experiment?experiment_name={test_experiment_name}")
    assert resp.status_code == 200
    data = resp.json()
    assert "status" in data
    if data.get("status") == "success":
        assert "data" in data
        assert "workflow_creation_results" in data["data"]
        workflow_results = data["data"]["workflow_creation_results"]
        assert len(workflow_results) == 2  # Recipe 7 has 2 workflows
        workflow_names = [result.get("workflow_name") for result in workflow_results]
        assert "Train_Only_Workflow" in workflow_names
        assert "Train_Eval_Workflow" in workflow_names
        for result in workflow_results:
            assert result.get("action") == "create_workflow"
            assert result.get("status") == "success"
            assert "workflow_id" in result


def test_create_experiment_with_multiple_workflows(client):
    """Test creating an experiment with multiple workflows"""
    test_experiment_name = f"test_multi_workflows_{os.getpid()}"
    resp = client.post(f"/recipes/7/create_experiment?experiment_name={test_experiment_name}")
    assert resp.status_code == 200
    data = resp.json()
    assert "status" in data
    if data.get("status") == "success":
        # Verify tasks were created with correct names
        task_results = data["data"]["task_results"]
        assert len(task_results) == 2
        task_names = [result["task_name"] for result in task_results]
        assert "workflow_train_task" in task_names
        assert "workflow_eval_task" in task_names

        # Verify workflows were created with correct task references
        workflow_results = data["data"]["workflow_creation_results"]
        assert len(workflow_results) == 2
        assert all(result["status"] == "success" for result in workflow_results)

        # Get the workflows to verify their task references
        workflows_resp = client.get("/recipes/7")
        workflows_data = workflows_resp.json()
        for workflow in workflows_data["workflows"]:
            if workflow["name"] == "Train_Only_Workflow":
                assert workflow["config"]["nodes"][0]["task"] == "workflow_train_task"
            elif workflow["name"] == "Train_Eval_Workflow":
                assert workflow["config"]["nodes"][0]["task"] == "workflow_train_task"
                assert workflow["config"]["nodes"][1]["task"] == "workflow_eval_task"


def test_create_experiment_with_invalid_workflow_config(client):
    """Test creating experiment with invalid workflow config to test error handling"""
    test_experiment_name = f"test_invalid_workflow_{os.getpid()}"
    resp = client.post(f"/recipes/8/create_experiment?experiment_name={test_experiment_name}")
    assert resp.status_code == 200
    data = resp.json()
    assert "status" in data
    if data.get("status") == "success":
        assert "data" in data
        assert "workflow_creation_results" in data["data"]
        workflow_results = data["data"]["workflow_creation_results"]
        assert len(workflow_results) == 1  # Recipe 8 has 1 invalid workflow
        workflow_result = workflow_results[0]
        assert workflow_result.get("workflow_name") == "Invalid_Workflow"
        assert workflow_result.get("action") == "create_workflow"
        assert "error" in workflow_result.get("status", "")


def test_create_experiment_without_workflows(client):
    """Test creating an experiment from a recipe without workflows"""
    test_experiment_name = f"test_no_workflows_{os.getpid()}"
    resp = client.post(f"/recipes/6/create_experiment?experiment_name={test_experiment_name}")
    assert resp.status_code == 200
    data = resp.json()
    assert "status" in data
    if data.get("status") == "success":
        assert "data" in data
        assert "workflow_creation_results" in data["data"]
        workflow_results = data["data"]["workflow_creation_results"]
        assert len(workflow_results) == 0


def test_recipes_get_by_id_with_multiple_workflows(client):
    """Test that a recipe with multiple workflows is handled correctly"""
    resp = client.get("/recipes/7")  # Changed to recipe 7 which has 2 workflows
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == "7"
    assert "workflows" in data
    assert len(data["workflows"]) == 2  # Recipe 7 has 2 workflows
    workflow_names = [wf["name"] for wf in data["workflows"]]
    assert "Train_Only_Workflow" in workflow_names
    assert "Train_Eval_Workflow" in workflow_names
    for workflow in data["workflows"]:
        assert "config" in workflow
        assert "nodes" in workflow["config"]
        assert len(workflow["config"]["nodes"]) > 0
