import pytest


@pytest.mark.asyncio
async def test_gguf_model_detection_requires_file_selection(client):
    """Test that GGUF models return requires_file_selection status"""
    # Test with a known GGUF model that has config.json but should be detected as GGUF
    response = client.get(
        "/model/download_from_huggingface?model=MaziyarPanahi/gemma-3-1b-it-GGUF&experiment_id=1"
    )

    assert response.status_code == 200
    data = response.json()

    # Should detect as GGUF and return file selection requirement
    assert data["status"] == "requires_file_selection"
    assert data["model_id"] == "MaziyarPanahi/gemma-3-1b-it-GGUF"
    assert "available_files" in data
    assert isinstance(data["available_files"], list)
    assert len(data["available_files"]) > 0

    # All files should be GGUF files
    for file in data["available_files"]:
        assert file.endswith(".gguf")


def test_gguf_model_without_config_detection(client):
    """Test GGUF model that doesn't have config.json"""
    # Test with a GGUF model known to not have config.json
    response = client.get(
        "/model/download_from_huggingface?model=Qwen/Qwen3-Embedding-0.6B-GGUF&experiment_id=1"
    )

    assert response.status_code == 200
    data = response.json()

    # Should detect as GGUF and return file selection requirement
    assert data["status"] == "requires_file_selection"
    assert data["model_id"] == "Qwen/Qwen3-Embedding-0.6B-GGUF"
    assert "available_files" in data
    assert isinstance(data["available_files"], list)
    assert len(data["available_files"]) > 0


@pytest.mark.skip()
def test_download_gguf_file_success(client):
    """Test downloading a specific GGUF file"""
    # First get the available files
    response = client.get(
        "/model/download_from_huggingface?model=MaziyarPanahi/gemma-3-1b-it-GGUF&experiment_id=1"
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "requires_file_selection"

    # Pick the first available GGUF file
    available_files = data["available_files"]
    assert len(available_files) > 0
    selected_file = available_files[0]

    # Now download that specific file
    download_response = client.get(
        f"/model/download_gguf_file?model=MaziyarPanahi/gemma-3-1b-it-GGUF&filename={selected_file}&experiment_id=1"
    )

    assert download_response.status_code == 200
    download_data = download_response.json()

    # Should initiate download
    assert download_data["status"] == "success"
    assert "job_id" in download_data


def test_download_gguf_file_invalid_filename(client):
    """Test downloading with invalid filename"""
    response = client.get(
        "/model/download_gguf_file?model=MaziyarPanahi/gemma-3-1b-it-GGUF&filename=nonexistent.gguf&experiment_id=1"
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "error"
    assert "not found in repository" in data["message"]


def test_download_gguf_file_invalid_model(client):
    """Test downloading GGUF file from invalid model"""
    response = client.get(
        "/model/download_gguf_file?model=invalid/nonexistent-model&filename=model.gguf&experiment_id=1"
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "error"


def test_regular_model_still_works(client):
    """Test that regular (non-GGUF) models still work normally"""
    # Test with a regular model that should work normally
    response = client.get(
        "/model/download_from_huggingface?model=microsoft/DialoGPT-small&experiment_id=1"
    )

    assert response.status_code == 200
    data = response.json()

    # Should NOT require file selection (which is the key test)
    # Status can be success, started, or error (if model access fails)
    # but should not be requires_file_selection for regular models
    assert data["status"] != "requires_file_selection"


def test_model_gallery_includes_gguf(client):
    """Test that model gallery can handle GGUF models"""
    response = client.get("/model/gallery")

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)

    # Gallery should still work and return models
    # Individual models in gallery might be GGUF or regular


def test_gguf_download_with_job_id(client):
    """Test GGUF file download with custom job_id"""
    # First get available files
    response = client.get(
        "/model/download_from_huggingface?model=MaziyarPanahi/gemma-3-1b-it-GGUF&experiment_id=1"
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "requires_file_selection"

    available_files = data["available_files"]
    if available_files:
        selected_file = available_files[0]

        # Download with custom job_id
        download_response = client.get(
            f"/model/download_gguf_file?model=MaziyarPanahi/gemma-3-1b-it-GGUF&filename={selected_file}&job_id=999&experiment_id=1"
        )

        assert download_response.status_code == 200
        download_data = download_response.json()

        if download_data and download_data["status"] == "success":
            assert download_data["job_id"] == 999


def test_gguf_detection_edge_cases(client):
    """Test GGUF detection with various edge cases"""
    # Test various GGUF models to ensure detection works
    gguf_models = [
        "MaziyarPanahi/gemma-3-1b-it-GGUF",  # Has config.json but is GGUF
        "Qwen/Qwen3-Embedding-0.6B-GGUF",  # No config.json, is GGUF
    ]

    for model in gguf_models:
        response = client.get(f"/model/download_from_huggingface?model={model}&experiment_id=1")

        if response.status_code == 200:
            data = response.json()

            # Should either be detected as GGUF (requires_file_selection)
            # or fail with a clear error (but not the old "Error reading config" message)
            if data["status"] == "requires_file_selection":
                assert "available_files" in data
                assert isinstance(data["available_files"], list)
            elif data["status"] == "error":
                # Should not be the old "Error reading config" error
                assert "Error reading config for model" not in data.get("message", "")


@pytest.mark.skip(reason="This test requires network access and may be flaky")
def test_gguf_large_model_file_listing(client):
    """Test that large GGUF repositories can list files properly"""
    # Test with a larger GGUF model
    response = client.get(
        "/model/download_from_huggingface?model=MaziyarPanahi/gemma-3-1b-it-GGUF&experiment_id=1"
    )

    if response.status_code == 200:
        data = response.json()
        if data["status"] == "requires_file_selection":
            # Should have multiple quantization levels
            available_files = data["available_files"]
            assert len(available_files) > 5  # Should have multiple quantizations

            # Should have different quantization types
            has_q4 = any("Q4" in f for f in available_files)
            has_q8 = any("Q8" in f for f in available_files)
            assert has_q4 or has_q8  # Should have at least one common quantization
