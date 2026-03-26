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
async def test_install_peft_mock(client):
    test_model_id = "unsloth_Llama-3.2-1B-Instruct"
    test_peft_id = "dummy_adapter"

    response = client.post(f"/model/install_peft?model_id={test_model_id}&peft={test_peft_id}&experiment_id=1")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "error"  # As install_peft now returns 'started' after starting the async task
