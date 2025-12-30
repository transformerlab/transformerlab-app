from unittest.mock import AsyncMock, patch
import pytest
import os
from unittest.mock import MagicMock, mock_open
from datetime import date


def test_model_gallery(client):
    resp = client.get("/model/gallery")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    if data:
        model = data[0]
        assert "name" in model or "uniqueID" in model


@pytest.mark.skip(reason="Skipping test_model_list_local_uninstalled because it is taking 23 seconds to load??!!")
def test_model_list_local_uninstalled(client):
    resp = client.get("/model/list_local_uninstalled")
    assert resp.status_code == 200
    assert "data" in resp.json() or "status" in resp.json()


def test_model_group_gallery(client):
    resp = client.get("/model/model_groups_list")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    if data:
        model = data[0]
        assert "name" in model or "models" in model


def test_model_gallery_new_badge_uses_dates(client):
    mock_gallery = [
        {"uniqueID": "m1", "added": "2025-01-15"},
        {"uniqueID": "m2", "added": "2024-12-01"},
        {"uniqueID": "m3", "added": "not-a-date"},
        {"uniqueID": "m4"},
    ]

    with (
        patch("transformerlab.routers.model.galleries.get_models_gallery", return_value=mock_gallery),
        patch("transformerlab.routers.model.model_helper.list_installed_models", new_callable=AsyncMock, return_value=[]),
        patch("transformerlab.routers.model.datetime.date.today", return_value=date(2025, 1, 31)),
    ):
        resp = client.get("/model/gallery")
        assert resp.status_code == 200
        data = resp.json()

        assert {m["uniqueID"]: m["new"] for m in data} == {
            "m1": True,
            "m2": False,
            "m3": False,
            "m4": False,
        }


def test_model_group_gallery_new_badge_uses_dates(client):
    mock_groups = [
        {
            "name": "g1",
            "models": [
                {"uniqueID": "m1", "added": "2025-01-15"},
                {"uniqueID": "m2", "added": "2024-12-01"},
            ],
        }
    ]

    with (
        patch("transformerlab.routers.model.galleries.get_model_groups_gallery", return_value=mock_groups),
        patch("transformerlab.routers.model.model_helper.list_installed_models", new_callable=AsyncMock, return_value=[]),
        patch("transformerlab.routers.model.datetime.date.today", return_value=date(2025, 1, 31)),
    ):
        resp = client.get("/model/model_groups_list")
        assert resp.status_code == 200
        data = resp.json()
        assert data[0]["models"][0]["new"] is True
        assert data[0]["models"][1]["new"] is False


def make_mock_adapter_info(overrides={}):
    return MagicMock(
        modelId="mock/model",
        tags=["tag1", "tag2"],
        cardData={
            "description": "mock desc",
            "base_model": "unsloth/Llama-3.2-1B-Instruct",
            **overrides.get("cardData", {}),
        },
        config={"architectures": "MockArch", "model_type": "MockType", **overrides.get("config", {})},
        downloads=123,
    )


@pytest.mark.skip(reason="")
@pytest.mark.asyncio
@patch("transformerlab.routers.model.huggingfacemodel.get_model_details_from_huggingface", new_callable=AsyncMock)
@patch("transformerlab.routers.model.shared.async_run_python_script_and_update_status", new_callable=AsyncMock)
async def test_install_peft_mock(mock_run_script, mock_get_details, client):
    mock_get_details.return_value = {"name": "dummy_adapter"}
    mock_process = AsyncMock()
    mock_process.returncode = 0
    mock_run_script.return_value = mock_process

    test_model_id = "unsloth_Llama-3.2-1B-Instruct"
    test_peft_id = "dummy_adapter"

    response = client.post(f"/model/install_peft?model_id={test_model_id}&peft={test_peft_id}&experiment_id=1")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "error"  # As install_peft now returns 'started' after starting the async task


@pytest.mark.asyncio
@patch("transformerlab.routers.model.snapshot_download")
@patch("transformerlab.routers.model.huggingfacemodel.get_model_details_from_huggingface", new_callable=AsyncMock)
@patch("transformerlab.routers.model.shared.async_run_python_script_and_update_status", new_callable=AsyncMock)
async def test_install_peft_base_model_adaptor_not_found(mock_run_script, mock_get_details, mock_snapshot, client):
    mock_snapshot.return_value = "/tmp/empty_folder"
    os.makedirs("/tmp/empty_folder", exist_ok=True)

    mock_get_details.return_value = {"name": "dummy_adapter"}
    mock_run_script.return_value = AsyncMock()

    response = client.post("/model/install_peft?model_id=broken_model&peft=dummy_adapter&experiment_id=1")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "error"
    assert "adapter not found" in data["message"]


@pytest.mark.asyncio
async def test_install_peft_success(client):
    adapter_id = "tcotter/Llama-3.2-1B-Instruct-Mojo-Adapter"
    model_id = "unsloth/Llama-3.2-1B-Instruct"

    with (
        patch("transformerlab.routers.model.snapshot_download", return_value="/tmp/mock"),
        patch("builtins.open", mock_open(read_data='{"architectures": "MockArch", "model_type": "MockType"}')),
        patch("json.load", return_value={"architectures": "MockArch", "model_type": "MockType"}),
        patch("huggingface_hub.HfApi.model_info", return_value=make_mock_adapter_info()),
        patch("transformerlab.routers.model.huggingfacemodel.get_model_details_from_huggingface", return_value={}),
        patch("transformerlab.routers.model.job_service.job_create", return_value=123),
    ):
        response = client.post(
            "/model/install_peft", params={"peft": adapter_id, "model_id": model_id, "experiment_id": 1}
        )
        assert response.status_code == 200
        result = response.json()
        assert result["status"] == "started"
        assert result["check_status"]["base_model_name"] in ["success", "fail"]
        assert result["check_status"]["architectures_status"] in ["success", "fail", "unknown"]


def test_install_peft_model_config_fail(client):
    with (
        patch("transformerlab.routers.model.snapshot_download", side_effect=FileNotFoundError()),
    ):
        response = client.post(
            "/model/install_peft", params={"peft": "dummy", "model_id": "invalid-model", "experiment_id": 1}
        )
        assert response.status_code == 200
        assert response.json()["check_status"]["error"] == "not found"


def test_install_peft_adapter_info_fail(client):
    with (
        patch("transformerlab.routers.model.snapshot_download", return_value="/tmp/mock"),
        patch("builtins.open", mock_open(read_data="{}")),
        patch("json.load", return_value={}),
        patch("huggingface_hub.HfApi.model_info", side_effect=RuntimeError("not found")),
    ):
        response = client.post(
            "/model/install_peft", params={"peft": "dummy", "model_id": "valid_model", "experiment_id": 1}
        )
        assert response.status_code == 200
        assert response.json()["check_status"]["error"] == "not found"


@pytest.mark.asyncio
async def test_install_peft_architecture_detection_unknown(client):
    adapter_info = make_mock_adapter_info()
    with (
        patch("transformerlab.routers.model.snapshot_download", return_value="/tmp/mock"),
        patch("builtins.open", mock_open(read_data="{}")),
        patch("json.load", return_value={"architectures": "A", "model_type": "B"}),
        patch("huggingface_hub.HfApi.model_info", return_value=adapter_info),
        patch("transformerlab.routers.model.huggingfacemodel.get_model_details_from_huggingface", return_value={}),
        patch("transformerlab.routers.model.job_service.job_create", return_value=123),
    ):
        response = client.post(
            "/model/install_peft", params={"peft": "dummy", "model_id": "valid_model", "experiment_id": 1}
        )
        assert response.status_code == 200
        assert response.json()["check_status"]["architectures_status"] == "unknown"


@pytest.mark.asyncio
async def test_install_peft_unknown_field_status(client):
    adapter_info = make_mock_adapter_info(overrides={"config": {}})
    with (
        patch("transformerlab.routers.model.snapshot_download", return_value="/tmp/mock"),
        patch("builtins.open", mock_open(read_data="{}")),
        patch("json.load", return_value={}),
        patch("huggingface_hub.HfApi.model_info", return_value=adapter_info),
        patch("transformerlab.routers.model.huggingfacemodel.get_model_details_from_huggingface", return_value={}),
        patch("transformerlab.routers.model.job_service.job_create", return_value=123),
    ):
        response = client.post(
            "/model/install_peft", params={"peft": "dummy", "model_id": "valid_model", "experiment_id": 1}
        )
        status = response.json()["check_status"]
        assert status["architectures_status"] == "unknown"
        assert status["model_type_status"] == "unknown"


def test_chat_template_success(client):
    mock_tokenizer = MagicMock()
    mock_tokenizer.chat_template = "<|user|>{{ message }}<|/user|>"

    with (
        patch("transformers.AutoTokenizer.from_pretrained", return_value=mock_tokenizer),
    ):
        response = client.get("/model/chat_template", params={"model_name": "valid_model"})
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["data"] == mock_tokenizer.chat_template


def test_chat_template_invalid_model(client):
    with (
        patch("transformers.AutoTokenizer.from_pretrained", side_effect=OSError("model not found")),
    ):
        response = client.get("/model/chat_template", params={"model_name": "invalid_model"})
        assert response.status_code == 200

        data = response.json()
        assert data["status"] == "error"
        assert "Invalid model name" in data["message"]
        assert data["data"] is None


def test_logout_from_huggingface_success(client):
    """Test successful logout from Hugging Face"""
    with (
        patch("huggingface_hub.logout") as mock_logout,
        patch("os.path.exists", return_value=True),
        patch("os.remove") as mock_remove,
    ):
        response = client.get("/model/logout_from_huggingface")
        assert response.status_code == 200

        data = response.json()
        assert data["message"] == "OK"

        # Verify logout was called
        mock_logout.assert_called_once()
        # Verify token file removal was attempted
        mock_remove.assert_called_once()
