import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from transformerlab.shared.shared import get_job_output_file_name as get_output_file_name

pytestmark = pytest.mark.skip("skipping these as they need to be fixed")


def test_export_jobs(client):
    resp = client.get("/experiment/1/export/jobs")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_export_job(client):
    resp = client.get("/experiment/1/export/job?jobId=job123")
    assert resp.status_code == 200


@patch("transformerlab.db.experiment_get")
@patch("transformerlab.services.job_service.job_create")
@patch("asyncio.create_subprocess_exec")
@patch("transformerlab.routers.experiment.export.get_output_file_name")
@patch("transformerlab.db.job_update_status")
@patch("os.makedirs")
@patch("os.path.join")
@patch("json.dump")
@patch("builtins.open")
def test_run_exporter_script_success(
    client,
    mock_open,
    mock_json_dump,
    mock_path_join,
    mock_makedirs,
    mock_job_update,
    mock_get_output_file,
    mock_subprocess,
    mock_job_create,
    mock_experiment_get,
):
    # Setup mocks
    mock_experiment_get.return_value = {
        "config": json.dumps(
            {"foundation": "huggingface/model1", "foundation_model_architecture": "pytorch"}
        )
    }
    mock_job_create.return_value = "job123"
    mock_get_output_file.return_value = "/tmp/output_job123.txt"

    # Mock for file opening
    mock_file = MagicMock()
    mock_open.return_value.__enter__.return_value = mock_file

    # Mock subprocess
    mock_process = AsyncMock()
    mock_process.returncode = 0
    mock_process.communicate.return_value = (None, b"")
    mock_subprocess.return_value = mock_process

    # Mock path join to return predictable paths
    mock_path_join.side_effect = lambda *args: "/".join(args)

    resp = client.get(
        "/experiment/1/export/run_exporter_script?plugin_name=test_plugin&plugin_architecture=GGUF&plugin_params=%7B%22q_bits%22%3A%224%22%7D"
    )
    assert resp.status_code == 200
    result = resp.json()
    assert result["status"] == "success"
    assert result["job_id"] == "job123"

    # Verify that status was updated to COMPLETE
    mock_job_update.assert_called_with(job_id="job123", status="COMPLETE")


@patch("transformerlab.db.experiment_get")
def test_run_exporter_script_invalid_experiment(client, mock_experiment_get):
    # Setup mock to simulate experiment not found
    mock_experiment_get.return_value = None

    resp = client.get(
        "/experiment/999/export/run_exporter_script?plugin_name=test_plugin&plugin_architecture=GGUF"
    )
    assert resp.status_code == 200
    result = resp.json()
    assert result["message"] == "Experiment 999 does not exist"


@patch("transformerlab.db.experiment_get")
@patch("transformerlab.services.job_service.job_create")
@patch("asyncio.create_subprocess_exec")
@patch("transformerlab.routers.experiment.export.get_output_file_name")
@patch("transformerlab.db.job_update_status")
@patch("os.makedirs")
def test_run_exporter_script_process_error(
    client,
    mock_makedirs,
    mock_job_update,
    mock_get_output_file,
    mock_subprocess,
    mock_job_create,
    mock_experiment_get,
):
    # Setup mocks
    mock_experiment_get.return_value = {
        "config": json.dumps(
            {"foundation": "huggingface/model1", "foundation_model_architecture": "pytorch"}
        )
    }
    mock_job_create.return_value = "job123"
    mock_get_output_file.return_value = "/tmp/output_job123.txt"

    # Mock subprocess with error
    mock_process = AsyncMock()
    mock_process.returncode = 1
    mock_process.communicate.return_value = (None, b"Error")
    mock_subprocess.return_value = mock_process

    resp = client.get(
        "/experiment/1/export/run_exporter_script?plugin_name=test_plugin&plugin_architecture=GGUF"
    )
    assert resp.status_code == 200
    result = resp.json()
    assert "Export failed" in result["message"]

    # Verify that status was updated to FAILED
    mock_job_update.assert_called_with(job_id="job123", status="FAILED")


@patch("transformerlab.db.experiment_get")
@patch("transformerlab.services.job_service.job_create")
@patch("asyncio.create_subprocess_exec")
@patch("transformerlab.routers.experiment.export.get_output_file_name")
@patch("transformerlab.db.job_update_status")
@patch("os.makedirs")
def test_run_exporter_script_stderr_decode_error(
    client,
    mock_makedirs,
    mock_job_update,
    mock_get_output_file,
    mock_subprocess,
    mock_job_create,
    mock_experiment_get,
):
    # Setup mocks
    mock_experiment_get.return_value = {
        "config": json.dumps(
            {"foundation": "huggingface/model1", "foundation_model_architecture": "pytorch"}
        )
    }
    mock_job_create.return_value = "job123"
    mock_get_output_file.return_value = "/tmp/output_job123.txt"

    # Mock subprocess with stderr decode error
    mock_process = AsyncMock()
    mock_process.returncode = 1
    mock_process.communicate.return_value = (None, b"\xff\xfe")  # Invalid UTF-8 sequence
    mock_subprocess.return_value = mock_process

    resp = client.get(
        "/experiment/1/export/run_exporter_script?plugin_name=test_plugin&plugin_architecture=GGUF"
    )
    assert resp.status_code == 200
    result = resp.json()
    assert "Export failed due to an internal error" in result["message"]

    # Verify that status was updated to FAILED
    mock_job_update.assert_called_with(job_id="job123", status="FAILED")


@patch("transformerlab.db.job_get")
@patch("transformerlab.routers.experiment.export.dirs.plugin_dir_by_name")
@patch("os.path.exists")
def test_get_output_file_name_with_custom_path(mock_exists, mock_plugin_dir, mock_job_get):
    # Setup mocks
    mock_job_get.return_value = {
        "job_data": {"output_file_path": "/custom/path/output.txt", "plugin": "test_plugin"}
    }
    mock_plugin_dir.return_value = "/plugins/test_plugin"
    mock_exists.return_value = True

    result = asyncio.run(get_output_file_name("job123"))
    assert result == "/custom/path/output.txt"


@patch("transformerlab.db.job_get")
@patch("transformerlab.routers.experiment.export.dirs.plugin_dir_by_name")
@patch("os.path.exists")
def test_get_output_file_name_without_plugin(mock_exists, mock_plugin_dir, mock_job_get):
    # Setup mocks
    mock_job_get.return_value = {
        "job_data": {}  # No plugin specified
    }

    with pytest.raises(ValueError, match="Plugin not found in job data"):
        asyncio.run(get_output_file_name("job123"))


@patch("transformerlab.db.job_get")
@patch("transformerlab.routers.experiment.export.dirs.plugin_dir_by_name")
@patch("os.path.exists")
def test_get_output_file_name_with_plugin(mock_exists, mock_plugin_dir, mock_job_get):
    # Setup mocks
    mock_job_get.return_value = {"job_data": {"plugin": "test_plugin"}}
    mock_plugin_dir.return_value = "/plugins/test_plugin"
    mock_exists.return_value = True

    result = asyncio.run(get_output_file_name("job123"))
    assert "jobs/job123/output_job123.txt" in result


@patch("transformerlab.routers.experiment.export.get_output_file_name")
def test_watch_export_log_value_error(client, mock_get_output_file):
    mock_get_output_file.side_effect = ValueError("File not found for job")

    resp = client.get("/experiment/1/export/job/job123/stream_output")
    assert resp.status_code == 200
    response_text = resp.text.strip('"')
    assert response_text == "An internal error has occurred!"


@patch("transformerlab.routers.experiment.export.get_output_file_name")
def test_watch_export_log_other_error(client, mock_get_output_file):
    # Setup mock to raise a different ValueError
    mock_get_output_file.side_effect = ValueError("Some other error")

    resp = client.get("/experiment/1/export/job/job123/stream_output")
    assert resp.status_code == 200
    response_text = resp.text.strip('"')
    assert response_text == "An internal error has occurred!"


@patch("transformerlab.db.job_get")
@patch("transformerlab.routers.experiment.export.dirs.plugin_dir_by_name")
@patch("os.path.exists")
def test_get_output_file_name_no_existing_file(client, mock_exists, mock_plugin_dir, mock_job_get):
    """
    When the job has a plugin but no bespoke output_file_path and
    the file doesn't exist yet, export.get_output_file_name should
    still return the *constructed* path.
    """
    mock_job_get.return_value = {"job_data": {"plugin": "test_plugin"}}
    mock_plugin_dir.return_value = "/plugins/test_plugin"
    mock_exists.return_value = False  # force the “else” branch

    result = asyncio.run(get_output_file_name("job123"))
    assert result == "/plugins/test_plugin/output_job123.txt"


@patch("transformerlab.routers.experiment.export.watch_file")
@patch("transformerlab.routers.experiment.export.asyncio.sleep")
@patch("transformerlab.routers.experiment.export.get_output_file_name")
def test_watch_export_log_retry_success(client, mock_get_output_file, mock_sleep, mock_watch_file):
    """
    First call to get_output_file_name raises the special ValueError.
    async sleep is awaited, then the second call succeeds and the route
    returns a StreamingResponse built from watch_file().
    """
    # 1️⃣ make get_output_file_name fail once, then succeed
    mock_get_output_file.side_effect = [
        ValueError("No output file found for job 123"),
        "/tmp/output_job123.txt",
    ]

    # 2️⃣ avoid a real 4-second wait
    mock_sleep.return_value = AsyncMock()

    # 3️⃣ provide an iterator so FastAPI can stream something
    mock_watch_file.return_value = iter(["line1\n"])

    resp = client.get("/experiment/1/export/job/job123/stream_output")
    assert resp.status_code == 200
    # because watch_file yielded “line1”, the body must contain it
    assert "line1" in resp.text

    # ensure the retry actually happened
    assert mock_get_output_file.call_count >= 2

    # make sure sleep was awaited with 4 seconds at least once
    assert any(call.args == (4,) for call in mock_sleep.await_args_list)


@patch("transformerlab.db.experiment_get")
@patch("transformerlab.services.job_service.job_create")
@patch("asyncio.create_subprocess_exec")
@patch("transformerlab.routers.experiment.export.get_output_file_name")
@patch("builtins.open")
def test_stderr_decode_fallback(
    client, mock_open, mock_get_outfile, mock_subproc, mock_job_create, mock_exp_get
):
    # minimal fixtures
    mock_exp_get.return_value = {
        "config": '{"foundation":"hf/x","foundation_model_architecture":"pt"}'
    }
    mock_job_create.return_value = "j1"
    mock_get_outfile.return_value = "/tmp/out.txt"

    # make stderr.decode() raise
    bad_stderr = MagicMock()
    bad_stderr.decode.side_effect = UnicodeDecodeError("utf-8", b"", 0, 1, "boom")
    proc = AsyncMock(returncode=0)
    proc.communicate.return_value = (None, bad_stderr)
    mock_subproc.return_value = proc

    fake_file = MagicMock()
    mock_open.return_value.__enter__.return_value = fake_file

    resp = client.get(
        "/experiment/1/export/run_exporter_script?plugin_name=p&plugin_architecture=GGUF"
    )
    assert resp.status_code == 200

    # confirm fallback string was written
    written = "".join(call.args[0] for call in fake_file.write.call_args_list)
    assert "[stderr decode error]" in written
