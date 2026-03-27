"""
Tests for transformerlab.services.model_service.list_installed_models
"""

import pytest
from unittest.mock import AsyncMock


def make_model(model_id, source="", model_filename=""):
    return {
        "model_id": model_id,
        "json_data": {
            "source": source,
            "model_filename": model_filename,
        },
    }


@pytest.mark.asyncio
async def test_list_installed_models_empty(monkeypatch):
    """When the SDK returns no models, the service returns an empty list."""
    from transformerlab.services import model_service

    monkeypatch.setattr(model_service.ModelService, "list_all", AsyncMock(return_value=[]))
    monkeypatch.setattr(model_service, "get_models_dir", AsyncMock(return_value="/models"))

    result = await model_service.list_installed_models()
    assert result == []


@pytest.mark.asyncio
@pytest.mark.parametrize("bad_entry", [{}, ""])
async def test_list_installed_models_skips_empty_entries(bad_entry, monkeypatch):
    """Empty-dict and empty-string entries from the SDK are silently dropped."""
    from transformerlab.services import model_service

    monkeypatch.setattr(
        model_service.ModelService,
        "list_all",
        AsyncMock(return_value=[bad_entry]),
    )
    monkeypatch.setattr(model_service, "get_models_dir", AsyncMock(return_value="/models"))

    result = await model_service.list_installed_models()
    assert result == []


@pytest.mark.asyncio
async def test_list_installed_models_non_hf_with_model_filename(monkeypatch):
    """A non-HuggingFace model that has model_filename set is marked as local."""
    from transformerlab.services import model_service

    model = make_model("MyOrg/my-model", source="local", model_filename="model.bin")
    monkeypatch.setattr(model_service.ModelService, "list_all", AsyncMock(return_value=[model]))
    monkeypatch.setattr(model_service, "get_models_dir", AsyncMock(return_value="/models"))

    # Patch storage so the path appears to exist
    monkeypatch.setattr(model_service.storage, "join", lambda *parts: "/".join(parts))
    monkeypatch.setattr(model_service.storage, "exists", AsyncMock(return_value=True))
    monkeypatch.setattr(model_service.storage, "isdir", AsyncMock(return_value=False))

    result = await model_service.list_installed_models()
    assert len(result) == 1
    assert result[0]["stored_in_filesystem"] is True
    assert "local_path" in result[0]


@pytest.mark.asyncio
async def test_list_installed_models_non_hf_directory_model(monkeypatch):
    """A non-HuggingFace directory-based model (no model_filename) with files is marked local."""
    from transformerlab.services import model_service

    model = make_model("MyOrg/dir-model", source="local", model_filename="")
    monkeypatch.setattr(model_service.ModelService, "list_all", AsyncMock(return_value=[model]))
    monkeypatch.setattr(model_service, "get_models_dir", AsyncMock(return_value="/models"))

    monkeypatch.setattr(model_service.storage, "join", lambda *parts: "/".join(parts))
    monkeypatch.setattr(model_service.storage, "exists", AsyncMock(return_value=True))
    monkeypatch.setattr(model_service.storage, "isdir", AsyncMock(return_value=True))
    monkeypatch.setattr(
        model_service.storage,
        "ls",
        AsyncMock(return_value=["/models/dir-model/weights.bin", "/models/dir-model/index.json"]),
    )

    result = await model_service.list_installed_models()
    assert len(result) == 1
    assert result[0]["stored_in_filesystem"] is True


@pytest.mark.asyncio
async def test_list_installed_models_non_hf_directory_only_index(monkeypatch):
    """A non-HuggingFace directory with only index.json is NOT marked as local."""
    from transformerlab.services import model_service

    model = make_model("MyOrg/index-only-model", source="local", model_filename="")
    monkeypatch.setattr(model_service.ModelService, "list_all", AsyncMock(return_value=[model]))
    monkeypatch.setattr(model_service, "get_models_dir", AsyncMock(return_value="/models"))

    monkeypatch.setattr(model_service.storage, "join", lambda *parts: "/".join(parts))
    monkeypatch.setattr(model_service.storage, "exists", AsyncMock(return_value=True))
    monkeypatch.setattr(model_service.storage, "isdir", AsyncMock(return_value=True))
    monkeypatch.setattr(
        model_service.storage,
        "ls",
        AsyncMock(return_value=["/models/index-only-model/index.json"]),
    )

    result = await model_service.list_installed_models()
    assert len(result) == 1
    assert "stored_in_filesystem" not in result[0]


@pytest.mark.asyncio
async def test_list_installed_models_hf_model_no_local_path(monkeypatch):
    """A HuggingFace model without a local directory is NOT marked as filesystem-stored."""
    from transformerlab.services import model_service

    model = make_model("huggingface-org/some-model", source="huggingface", model_filename="")
    monkeypatch.setattr(model_service.ModelService, "list_all", AsyncMock(return_value=[model]))
    monkeypatch.setattr(model_service, "get_models_dir", AsyncMock(return_value="/models"))

    monkeypatch.setattr(model_service.storage, "join", lambda *parts: "/".join(parts))
    monkeypatch.setattr(model_service.storage, "exists", AsyncMock(return_value=False))

    result = await model_service.list_installed_models()
    assert len(result) == 1
    assert "stored_in_filesystem" not in result[0]


@pytest.mark.asyncio
async def test_list_installed_models_hf_gguf_model_stored_locally(monkeypatch):
    """A HuggingFace GGUF model with a matching local file is marked as filesystem-stored."""
    from transformerlab.services import model_service

    model = make_model("huggingface-org/gguf-model", source="huggingface", model_filename="model.gguf")
    monkeypatch.setattr(model_service.ModelService, "list_all", AsyncMock(return_value=[model]))
    monkeypatch.setattr(model_service, "get_models_dir", AsyncMock(return_value="/models"))

    monkeypatch.setattr(model_service.storage, "join", lambda *parts: "/".join(parts))
    monkeypatch.setattr(model_service.storage, "exists", AsyncMock(return_value=True))
    monkeypatch.setattr(model_service.storage, "isdir", AsyncMock(return_value=False))
    monkeypatch.setattr(model_service.storage, "ls", AsyncMock(return_value=[]))

    result = await model_service.list_installed_models()
    assert len(result) == 1
    assert result[0]["stored_in_filesystem"] is True


@pytest.mark.asyncio
async def test_list_installed_models_non_hf_dot_model_filename(monkeypatch):
    """A non-HuggingFace model with model_filename='.' uses the directory path as local_path."""
    from transformerlab.services import model_service

    model = make_model("MyOrg/dot-model", source="local", model_filename=".")
    monkeypatch.setattr(model_service.ModelService, "list_all", AsyncMock(return_value=[model]))
    monkeypatch.setattr(model_service, "get_models_dir", AsyncMock(return_value="/models"))

    monkeypatch.setattr(model_service.storage, "join", lambda *parts: "/".join(parts))
    monkeypatch.setattr(model_service.storage, "exists", AsyncMock(return_value=True))
    monkeypatch.setattr(model_service.storage, "isdir", AsyncMock(return_value=False))

    result = await model_service.list_installed_models()
    assert len(result) == 1
    assert result[0]["stored_in_filesystem"] is True
    # local_path should be the directory itself (no extra filename appended)
    assert not result[0]["local_path"].endswith("/.")
