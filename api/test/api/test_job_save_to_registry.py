import pytest

import lab.dirs as lab_dirs


@pytest.fixture()
def tmp_workspace(monkeypatch, tmp_path):
    """Point workspace dirs to a temporary directory for isolation."""
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    jobs_dir = workspace / "jobs"
    jobs_dir.mkdir()
    datasets_dir = workspace / "datasets"
    datasets_dir.mkdir()
    models_dir = workspace / "models"
    models_dir.mkdir()

    async def mock_get_workspace_dir():
        return str(workspace)

    async def mock_get_jobs_dir(experiment_id: str):
        return str(jobs_dir)

    async def mock_get_datasets_dir():
        return str(datasets_dir)

    async def mock_get_models_dir():
        return str(models_dir)

    monkeypatch.setattr(lab_dirs, "get_workspace_dir", mock_get_workspace_dir)
    monkeypatch.setattr(lab_dirs, "get_jobs_dir", mock_get_jobs_dir)
    monkeypatch.setattr(lab_dirs, "get_datasets_dir", mock_get_datasets_dir)
    monkeypatch.setattr(lab_dirs, "get_models_dir", mock_get_models_dir)

    return {
        "workspace": workspace,
        "jobs_dir": jobs_dir,
        "datasets_dir": datasets_dir,
        "models_dir": models_dir,
    }


def _seed_job_dataset(tmp_workspace, job_id: str, dataset_name: str, content: str = '{"text":"hello"}'):
    """Create a dataset directory inside a job's datasets folder with a sample file."""
    dataset_dir = tmp_workspace["jobs_dir"] / job_id / "datasets" / dataset_name
    dataset_dir.mkdir(parents=True, exist_ok=True)
    (dataset_dir / "data.jsonl").write_text(content)
    return dataset_dir


def _seed_job_model(tmp_workspace, job_id: str, model_name: str, content: str = "fake-model-weights"):
    """Create a model directory inside a job's models folder with a sample file."""
    model_dir = tmp_workspace["jobs_dir"] / job_id / "models" / model_name
    model_dir.mkdir(parents=True, exist_ok=True)
    (model_dir / "model.safetensors").write_text(content)
    return model_dir


# ---------------------------------------------------------------------------
# Dataset listing
# ---------------------------------------------------------------------------


def test_list_job_datasets_returns_dataset(client, tmp_workspace):
    """After seeding a dataset in a job dir, the list endpoint returns it."""
    job_id = "42"
    _seed_job_dataset(tmp_workspace, job_id, "my-dataset")

    resp = client.get(f"/experiment/alpha/jobs/{job_id}/datasets")
    assert resp.status_code == 200

    data = resp.json()
    assert "datasets" in data
    names = [d["name"] for d in data["datasets"]]
    assert "my-dataset" in names


def test_list_job_datasets_empty_when_no_datasets(client, tmp_workspace):
    """When the job has no datasets directory the endpoint returns an empty list."""
    resp = client.get("/experiment/alpha/jobs/99/datasets")
    assert resp.status_code == 200
    assert resp.json()["datasets"] == []


def test_list_job_datasets_invalid_job_id(client, tmp_workspace):
    """Passing a sentinel job id returns an empty list."""
    resp = client.get("/experiment/alpha/jobs/-1/datasets")
    assert resp.status_code == 200
    assert resp.json()["datasets"] == []


# ---------------------------------------------------------------------------
# Save dataset to registry
# ---------------------------------------------------------------------------


def test_save_dataset_to_registry_copies_files(client, tmp_workspace):
    """Saving a dataset triggers the background copy to the global datasets registry."""
    job_id = "42"
    dataset_name = "my-dataset"
    _seed_job_dataset(tmp_workspace, job_id, dataset_name, content='{"row":1}')

    resp = client.post(f"/experiment/alpha/jobs/{job_id}/datasets/{dataset_name}/save_to_registry")
    assert resp.status_code == 200
    assert resp.json()["status"] == "started"


def test_save_dataset_to_registry_duplicate_gets_timestamped_name(client, tmp_workspace):
    """Duplicate dataset name: endpoint still returns started (copy runs in background)."""
    job_id = "42"
    dataset_name = "dup-dataset"

    _seed_job_dataset(tmp_workspace, job_id, dataset_name, content="v2")

    # Pre-create same name in the registry
    existing = tmp_workspace["datasets_dir"] / dataset_name
    existing.mkdir()
    (existing / "data.jsonl").write_text("v1")

    resp = client.post(f"/experiment/alpha/jobs/{job_id}/datasets/{dataset_name}/save_to_registry")
    assert resp.status_code == 200

    body = resp.json()
    assert body["status"] == "started"


def test_save_nonexistent_dataset_returns_404(client, tmp_workspace):
    """Saving a dataset that doesn't exist in the job returns 404."""
    job_id = "42"
    (tmp_workspace["jobs_dir"] / job_id / "datasets").mkdir(parents=True, exist_ok=True)

    resp = client.post(f"/experiment/alpha/jobs/{job_id}/datasets/ghost-dataset/save_to_registry")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Model listing
# ---------------------------------------------------------------------------


def test_list_job_models_returns_model(client, tmp_workspace):
    """After seeding a model in a job dir, the list endpoint returns it."""
    job_id = "42"
    _seed_job_model(tmp_workspace, job_id, "my-model")

    resp = client.get(f"/experiment/alpha/jobs/{job_id}/models")
    assert resp.status_code == 200

    data = resp.json()
    assert "models" in data
    names = [m["name"] for m in data["models"]]
    assert "my-model" in names


def test_list_job_models_empty_when_no_models(client, tmp_workspace):
    """When the job has no models directory the endpoint returns an empty list."""
    resp = client.get("/experiment/alpha/jobs/99/models")
    assert resp.status_code == 200
    assert resp.json()["models"] == []


def test_list_job_models_invalid_job_id(client, tmp_workspace):
    """Passing a sentinel job id returns an empty list."""
    resp = client.get("/experiment/alpha/jobs/-1/models")
    assert resp.status_code == 200
    assert resp.json()["models"] == []


# ---------------------------------------------------------------------------
# Save model to registry
# ---------------------------------------------------------------------------


def test_save_model_to_registry_copies_files(client, tmp_workspace):
    """Saving a model triggers the background copy to the global models registry."""
    job_id = "42"
    model_name = "my-model"
    _seed_job_model(tmp_workspace, job_id, model_name, content="weights-v1")

    resp = client.post(f"/experiment/alpha/jobs/{job_id}/models/{model_name}/save_to_registry")
    assert resp.status_code == 200
    assert resp.json()["status"] == "started"


def test_save_model_to_registry_duplicate_gets_timestamped_name(client, tmp_workspace):
    """Duplicate model name: endpoint still returns started (copy runs in background)."""
    job_id = "42"
    model_name = "dup-model"

    _seed_job_model(tmp_workspace, job_id, model_name, content="weights-v2")

    existing = tmp_workspace["models_dir"] / model_name
    existing.mkdir()
    (existing / "model.safetensors").write_text("weights-v1")

    resp = client.post(f"/experiment/alpha/jobs/{job_id}/models/{model_name}/save_to_registry")
    assert resp.status_code == 200

    body = resp.json()
    assert body["status"] == "started"


def test_save_nonexistent_model_returns_404(client, tmp_workspace):
    """Saving a model that doesn't exist in the job returns 404."""
    job_id = "42"
    (tmp_workspace["jobs_dir"] / job_id / "models").mkdir(parents=True, exist_ok=True)

    resp = client.post(f"/experiment/alpha/jobs/{job_id}/models/ghost-model/save_to_registry")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# End-to-end: dataset AND model in one job, both saved to registry
# ---------------------------------------------------------------------------


def test_save_dataset_and_model_from_same_job(client, tmp_workspace):
    """A job with both a dataset and model can trigger saves to the registry."""
    job_id = "100"
    dataset_name = "generated-ds"
    model_name = "finetuned-model"

    # Seed both artifacts in the job directory
    _seed_job_dataset(tmp_workspace, job_id, dataset_name, content='{"prompt":"hi"}')
    _seed_job_model(tmp_workspace, job_id, model_name, content="trained-weights")

    # List and verify they show up in job artifacts
    ds_resp = client.get(f"/experiment/alpha/jobs/{job_id}/datasets")
    assert ds_resp.status_code == 200
    assert dataset_name in [d["name"] for d in ds_resp.json()["datasets"]]

    model_resp = client.get(f"/experiment/alpha/jobs/{job_id}/models")
    assert model_resp.status_code == 200
    assert model_name in [m["name"] for m in model_resp.json()["models"]]

    # Save both to registry — both should start successfully
    ds_save = client.post(f"/experiment/alpha/jobs/{job_id}/datasets/{dataset_name}/save_to_registry")
    assert ds_save.status_code == 200
    assert ds_save.json()["status"] == "started"

    model_save = client.post(f"/experiment/alpha/jobs/{job_id}/models/{model_name}/save_to_registry")
    assert model_save.status_code == 200
    assert model_save.json()["status"] == "started"


# ---------------------------------------------------------------------------
# Save dataset to registry with custom name (mode='new', target_name)
# ---------------------------------------------------------------------------


def test_save_dataset_to_registry_with_custom_name(client, tmp_workspace):
    """Saving a dataset with a custom target_name starts the background copy."""
    job_id = "42"
    dataset_name = "my-dataset"
    custom_name = "custom-dataset"
    _seed_job_dataset(tmp_workspace, job_id, dataset_name, content='{"row":1}')

    resp = client.post(
        f"/experiment/alpha/jobs/{job_id}/datasets/{dataset_name}/save_to_registry",
        params={"target_name": custom_name, "mode": "new"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "started"


def test_save_dataset_to_registry_custom_name_duplicate_gets_timestamp(client, tmp_workspace):
    """Saving with a custom name that already exists: endpoint still returns started."""
    job_id = "42"
    dataset_name = "my-dataset"
    custom_name = "existing-ds"
    _seed_job_dataset(tmp_workspace, job_id, dataset_name, content="v2")

    # Pre-create the custom name in the registry
    existing = tmp_workspace["datasets_dir"] / custom_name
    existing.mkdir()
    (existing / "data.jsonl").write_text("v1")

    resp = client.post(
        f"/experiment/alpha/jobs/{job_id}/datasets/{dataset_name}/save_to_registry",
        params={"target_name": custom_name, "mode": "new"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "started"


# ---------------------------------------------------------------------------
# Save dataset to registry with mode='existing'
# ---------------------------------------------------------------------------


def test_save_dataset_to_existing_registry_entry(client, tmp_workspace):
    """mode='existing' triggers background merge into an existing registry dataset."""
    job_id = "42"
    dataset_name = "my-dataset"
    existing_name = "registry-dataset"
    _seed_job_dataset(tmp_workspace, job_id, dataset_name, content='{"row":"new"}')

    # Pre-create the target in the registry
    existing = tmp_workspace["datasets_dir"] / existing_name
    existing.mkdir()
    (existing / "old_file.jsonl").write_text("old")

    resp = client.post(
        f"/experiment/alpha/jobs/{job_id}/datasets/{dataset_name}/save_to_registry",
        params={"target_name": existing_name, "mode": "existing"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "started"


def test_save_dataset_to_existing_requires_target_name(client, tmp_workspace):
    """mode='existing' without target_name returns 400."""
    job_id = "42"
    dataset_name = "my-dataset"
    _seed_job_dataset(tmp_workspace, job_id, dataset_name)

    resp = client.post(
        f"/experiment/alpha/jobs/{job_id}/datasets/{dataset_name}/save_to_registry",
        params={"mode": "existing"},
    )
    assert resp.status_code == 400


def test_save_dataset_to_nonexistent_existing_returns_404(client, tmp_workspace):
    """mode='existing' with a target_name that doesn't exist returns 404."""
    job_id = "42"
    dataset_name = "my-dataset"
    _seed_job_dataset(tmp_workspace, job_id, dataset_name)

    resp = client.post(
        f"/experiment/alpha/jobs/{job_id}/datasets/{dataset_name}/save_to_registry",
        params={"target_name": "nonexistent", "mode": "existing"},
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Save model to registry with custom name (mode='new', target_name)
# ---------------------------------------------------------------------------


def test_save_model_to_registry_with_custom_name(client, tmp_workspace):
    """Saving a model with a custom target_name starts the background copy."""
    job_id = "42"
    model_name = "my-model"
    custom_name = "custom-model"
    _seed_job_model(tmp_workspace, job_id, model_name, content="weights-v1")

    resp = client.post(
        f"/experiment/alpha/jobs/{job_id}/models/{model_name}/save_to_registry",
        params={"target_name": custom_name, "mode": "new"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "started"


def test_save_model_to_registry_custom_name_duplicate_gets_timestamp(client, tmp_workspace):
    """Saving with a custom name that already exists: endpoint still returns started."""
    job_id = "42"
    model_name = "my-model"
    custom_name = "existing-model"
    _seed_job_model(tmp_workspace, job_id, model_name, content="weights-v2")

    existing = tmp_workspace["models_dir"] / custom_name
    existing.mkdir()
    (existing / "model.safetensors").write_text("weights-v1")

    resp = client.post(
        f"/experiment/alpha/jobs/{job_id}/models/{model_name}/save_to_registry",
        params={"target_name": custom_name, "mode": "new"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "started"


# ---------------------------------------------------------------------------
# Save model to registry with mode='existing'
# ---------------------------------------------------------------------------


def test_save_model_to_existing_registry_entry(client, tmp_workspace):
    """mode='existing' triggers background merge into an existing registry model."""
    job_id = "42"
    model_name = "my-model"
    existing_name = "registry-model"
    _seed_job_model(tmp_workspace, job_id, model_name, content="new-weights")

    existing = tmp_workspace["models_dir"] / existing_name
    existing.mkdir()
    (existing / "old_model.safetensors").write_text("old-weights")

    resp = client.post(
        f"/experiment/alpha/jobs/{job_id}/models/{model_name}/save_to_registry",
        params={"target_name": existing_name, "mode": "existing"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "started"


def test_save_model_to_existing_requires_target_name(client, tmp_workspace):
    """mode='existing' without target_name returns 400."""
    job_id = "42"
    model_name = "my-model"
    _seed_job_model(tmp_workspace, job_id, model_name)

    resp = client.post(
        f"/experiment/alpha/jobs/{job_id}/models/{model_name}/save_to_registry",
        params={"mode": "existing"},
    )
    assert resp.status_code == 400


def test_save_model_to_nonexistent_existing_returns_404(client, tmp_workspace):
    """mode='existing' with a target_name that doesn't exist returns 404."""
    job_id = "42"
    model_name = "my-model"
    _seed_job_model(tmp_workspace, job_id, model_name)

    resp = client.post(
        f"/experiment/alpha/jobs/{job_id}/models/{model_name}/save_to_registry",
        params={"target_name": "nonexistent", "mode": "existing"},
    )
    assert resp.status_code == 404
