from unittest.mock import AsyncMock, Mock, patch

RECIPES = [
    {
        "id": "1",
        "title": "Test Recipe",
        "dependencies": [
            {"type": "model", "name": "model-a"},
            {"type": "dataset", "name": "dataset-x"},
            {"type": "plugin", "name": "plugin-1"},
            {"type": "workflow", "name": "wf-should-be-skipped"},
        ],
    },
    {
        "id": "2",
        "title": "No Deps",
        "dependencies": [],
    },
]


def test_check_dependencies_all_installed(client):
    models = [{"model_id": "mlx-community/Llama-3.2-1B-Instruct-4bit"}]
    datasets = [{"dataset_id": "spencer/samsum_reformat"}]
    plugins = [
        {"uniqueId": "llama-trainer", "installed": True},
        {"uniqueId": "eleuther-ai-lm-evaluation-harness-mlx", "installed": True},
    ]
    with (
        patch(
            "transformerlab.shared.galleries.get_exp_recipe_gallery",
            return_value=[
                {
                    "id": "1",
                    "dependencies": [
                        {"type": "model", "name": "mlx-community/Llama-3.2-1B-Instruct-4bit"},
                        {"type": "plugin", "name": "llama-trainer"},
                        {"type": "dataset", "name": "spencer/samsum_reformat"},
                        {"type": "plugin", "name": "eleuther-ai-lm-evaluation-harness-mlx"},
                        {"type": "workflow", "name": "eval-and-deploy"},
                    ],
                }
            ],
        ),
        patch(
            "transformerlab.models.model_helper.list_installed_models",
            AsyncMock(return_value=models),
        ),
        patch("transformerlab.routers.recipes.Dataset.list_all", Mock(return_value=datasets)),
        patch("transformerlab.routers.plugins.plugin_gallery", AsyncMock(return_value=plugins)),
    ):
        resp = client.get("/recipes/1/check_dependencies")
        assert resp.status_code == 200
        data = resp.json()
        deps = data["dependencies"]
        assert {d["name"]: d["installed"] for d in deps} == {
            "mlx-community/Llama-3.2-1B-Instruct-4bit": True,
            "llama-trainer": True,
            "spencer/samsum_reformat": True,
            "eleuther-ai-lm-evaluation-harness-mlx": True,
        }


def test_check_dependencies_some_missing(client):
    models = []
    datasets = []
    plugins = [
        {"uniqueId": "llama-trainer", "installed": False},
        {"uniqueId": "eleuther-ai-lm-evaluation-harness-mlx", "installed": True},
    ]
    with (
        patch(
            "transformerlab.shared.galleries.get_exp_recipe_gallery",
            return_value=[
                {
                    "id": "1",
                    "dependencies": [
                        {"type": "model", "name": "mlx-community/Llama-3.2-1B-Instruct-4bit"},
                        {"type": "plugin", "name": "llama-trainer"},
                        {"type": "dataset", "name": "spencer/samsum_reformat"},
                        {"type": "plugin", "name": "eleuther-ai-lm-evaluation-harness-mlx"},
                        {"type": "workflow", "name": "eval-and-deploy"},
                    ],
                }
            ],
        ),
        patch(
            "transformerlab.models.model_helper.list_installed_models",
            AsyncMock(return_value=models),
        ),
        patch("transformerlab.routers.recipes.Dataset.list_all", Mock(return_value=datasets)),
        patch("transformerlab.routers.plugins.plugin_gallery", AsyncMock(return_value=plugins)),
    ):
        resp = client.get("/recipes/1/check_dependencies")
        assert resp.status_code == 200
        data = resp.json()
        deps = data["dependencies"]
        assert {d["name"]: d["installed"] for d in deps} == {
            "mlx-community/Llama-3.2-1B-Instruct-4bit": False,
            "llama-trainer": False,
            "spencer/samsum_reformat": False,
            "eleuther-ai-lm-evaluation-harness-mlx": True,
        }


def test_check_dependencies_no_deps(client):
    with patch(
        "transformerlab.shared.galleries.get_exp_recipe_gallery",
        return_value=[{"id": "2", "dependencies": []}],
    ):
        resp = client.get("/recipes/2/check_dependencies")
        assert resp.status_code == 200
        data = resp.json()
        assert data["dependencies"] == []


def test_check_dependencies_not_found(client):
    with patch("transformerlab.shared.galleries.get_exp_recipe_gallery", return_value=[]):
        resp = client.get("/recipes/999/check_dependencies")
        assert resp.status_code == 200
        data = resp.json()
        assert "error" in data and "not found" in data["error"]
