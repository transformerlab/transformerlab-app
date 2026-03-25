from unittest.mock import AsyncMock, patch
import pytest
from unittest.mock import MagicMock


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
async def test_install_peft_mock(mock_get_details, client):
    mock_get_details.return_value = {"name": "dummy_adapter"}

    test_model_id = "unsloth_Llama-3.2-1B-Instruct"
    test_peft_id = "dummy_adapter"

    response = client.post(f"/model/install_peft?model_id={test_model_id}&peft={test_peft_id}&experiment_id=1")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "error"  # As install_peft now returns 'started' after starting the async task


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
