import importlib
import os

import pytest


@pytest.mark.asyncio
async def test_get_jobs_dir_uses_experiment(tmp_path, monkeypatch):
    ws = tmp_path / "ws"
    ws.mkdir()
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    # Reload module so env var changes take effect
    import lab.dirs

    importlib.reload(lab.dirs)
    from lab.dirs import get_jobs_dir

    result = await get_jobs_dir("my_exp")
    assert result.endswith("experiments/my_exp/jobs")
    assert os.path.isdir(result)


@pytest.mark.asyncio
async def test_get_job_dir_uses_experiment(tmp_path, monkeypatch):
    ws = tmp_path / "ws"
    ws.mkdir()
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    import lab.dirs

    importlib.reload(lab.dirs)
    from lab.dirs import get_job_dir

    result = await get_job_dir("abc-123", "my_exp")
    assert result.endswith("experiments/my_exp/jobs/abc-123")


@pytest.mark.asyncio
async def test_get_job_checkpoints_dir(tmp_path, monkeypatch):
    ws = tmp_path / "ws"
    ws.mkdir()
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    import lab.dirs

    importlib.reload(lab.dirs)
    from lab.dirs import get_job_checkpoints_dir

    result = await get_job_checkpoints_dir("abc-123", "my_exp")
    assert result.endswith("experiments/my_exp/jobs/abc-123/checkpoints")
    assert os.path.isdir(result)


def test_get_trackio_dir_sanitizes_job_id():
    import lab.dirs

    importlib.reload(lab.dirs)
    from lab.dirs import get_trackio_dir

    result = get_trackio_dir("../abc 123")
    assert result == "/tmp/trackio/abc_123"
