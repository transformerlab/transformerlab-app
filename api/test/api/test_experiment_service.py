import json
import uuid
import pytest
import asyncio

from transformerlab.services import experiment_service
import lab.dirs as lab_dirs


@pytest.fixture(autouse=True)
def tmp_experiments_dir(monkeypatch, tmp_path):
    """
    Point the real experiments dir to a temporary directory so we exercise the real
    Experiment implementation without touching the user's workspace.
    """
    experiments_dir = tmp_path / "experiments"
    experiments_dir.mkdir()
    
    async def mock_get_experiments_dir():
        return str(experiments_dir)
    
    monkeypatch.setattr(lab_dirs, "get_experiments_dir", mock_get_experiments_dir)
    return str(experiments_dir)


@pytest.mark.asyncio
async def test_experiment_create_and_get_real(tmp_experiments_dir):
    name = f"real_exp_{uuid.uuid4().hex[:8]}"
    cfg = {"description": "integration test experiment"}
    exp_id = await experiment_service.experiment_create(name, cfg)
    assert exp_id == name

    data = await experiment_service.experiment_get(exp_id)
    assert data is not None
    # config may be stored as dict or string; normalize for assertion
    cfg_field = data.get("config", {})
    if isinstance(cfg_field, str):
        cfg_field = json.loads(cfg_field)
    assert cfg_field.get("description") == "integration test experiment"


@pytest.mark.asyncio
async def test_missing_experiment_returns_none(tmp_experiments_dir):
    # experiment_get should return None for non-existent id (FileNotFoundError handled)
    assert await experiment_service.experiment_get("no_such_experiment") is None


# Added test to hit the new FileNotFoundError except-clauses in experiment_service
@pytest.mark.asyncio
async def test_missing_experiment_operations_handle_FileNotFound(tmp_experiments_dir):
    """
    Call the service functions that now catch FileNotFoundError to ensure those
    branches are executed and no exceptions are raised.
    """
    # These calls should not raise even if the experiment does not exist
    await experiment_service.experiment_delete("no_such")
    await experiment_service.experiment_update("no_such", {"a": 1})
    await experiment_service.experiment_update_config("no_such", "k", "v")
    await experiment_service.experiment_save_prompt_template("no_such", "tmpl")
    await experiment_service.experiment_update_configs("no_such", {"x": 2})


@pytest.mark.asyncio
async def test_update_and_delete_flow_real(tmp_experiments_dir):
    name = f"cycle_exp_{uuid.uuid4().hex[:8]}"
    await experiment_service.experiment_create(name, {"a": 1})

    # update whole config
    await experiment_service.experiment_update(name, {"b": 2})
    data = await experiment_service.experiment_get(name)
    cfg = data.get("config", {})
    if isinstance(cfg, str):
        cfg = json.loads(cfg)
    assert cfg.get("b") == 2

    # update single field
    await experiment_service.experiment_update_config(name, "c", 3)
    data = await experiment_service.experiment_get(name)
    cfg = data.get("config", {})
    if isinstance(cfg, str):
        cfg = json.loads(cfg)
    assert cfg.get("c") == 3

    # save prompt template
    await experiment_service.experiment_save_prompt_template(name, "tmpl123")
    data = await experiment_service.experiment_get(name)
    cfg = data.get("config", {})
    if isinstance(cfg, str):
        cfg = json.loads(cfg)
    assert cfg.get("prompt_template") == "tmpl123"

    # update multiple fields
    await experiment_service.experiment_update_configs(name, {"m": 9, "n": 10})
    data = await experiment_service.experiment_get(name)
    cfg = data.get("config", {})
    if isinstance(cfg, str):
        cfg = json.loads(cfg)
    assert cfg.get("m") == 9 and cfg.get("n") == 10

    # delete and confirm gone
    await experiment_service.experiment_delete(name)
    assert await experiment_service.experiment_get(name) is None
