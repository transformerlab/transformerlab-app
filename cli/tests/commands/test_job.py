from unittest.mock import MagicMock, patch

from typer.testing import CliRunner
from transformerlab_cli.main import app

runner = CliRunner()

SAMPLE_JOBS = [
    {
        "id": 1,
        "experiment_id": "exp1",
        "status": "RUNNING",
        "progress": 50,
        "job_data": {"task_name": "train", "completion_status": "N/A"},
    },
    {
        "id": 2,
        "experiment_id": "exp1",
        "status": "COMPLETE",
        "progress": 100,
        "job_data": {"task_name": "eval", "completion_status": "SUCCESS"},
    },
    {
        "id": 3,
        "experiment_id": "exp1",
        "status": "LAUNCHING",
        "progress": 0,
        "job_data": {"task_name": "generate", "completion_status": "N/A"},
    },
    {
        "id": 4,
        "experiment_id": "exp1",
        "status": "FAILED",
        "progress": 0,
        "job_data": {"task_name": "export", "completion_status": "FAILED"},
    },
    {
        "id": 5,
        "experiment_id": "exp1",
        "status": "INTERACTIVE",
        "progress": 10,
        "job_data": {"task_name": "chat", "completion_status": "N/A"},
    },
]


def _mock_api_response(jobs):
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = jobs
    return mock_resp


def test_job_help():
    """Test the job command help."""
    result = runner.invoke(app, ["job", "--help"])
    assert result.exit_code == 0
    assert "Usage: lab job [OPTIONS] COMMAND [ARGS]..." in result.output
    assert "Job management commands" in result.output


@patch("transformerlab_cli.commands.job.api.get", return_value=_mock_api_response(SAMPLE_JOBS))
@patch("transformerlab_cli.commands.job.get_config", return_value="exp1")
@patch("transformerlab_cli.commands.job.check_configs")
def test_job_list_all(mock_check, mock_get_config, mock_api):
    """Test that job list without --running shows all jobs."""
    result = runner.invoke(app, ["job", "list"])
    assert result.exit_code == 0
    # All 5 jobs should appear
    assert "train" in result.output
    assert "eval" in result.output
    assert "generate" in result.output
    assert "export" in result.output
    assert "chat" in result.output


@patch("transformerlab_cli.commands.job.api.get", return_value=_mock_api_response(SAMPLE_JOBS))
@patch("transformerlab_cli.commands.job.get_config", return_value="exp1")
@patch("transformerlab_cli.commands.job.check_configs")
def test_job_list_running_only(mock_check, mock_get_config, mock_api):
    """Test that job list --running shows only RUNNING, LAUNCHING, and INTERACTIVE jobs."""
    result = runner.invoke(app, ["job", "list", "--running"])
    assert result.exit_code == 0
    # Running jobs should appear
    assert "train" in result.output  # RUNNING
    assert "generate" in result.output  # LAUNCHING
    assert "chat" in result.output  # INTERACTIVE
    # Completed/failed jobs should not appear
    assert "eval" not in result.output
    assert "export" not in result.output


@patch("transformerlab_cli.commands.job.api.get", return_value=_mock_api_response(SAMPLE_JOBS))
@patch("transformerlab_cli.commands.job.get_config", return_value="exp1")
@patch("transformerlab_cli.commands.job.check_configs")
def test_job_list_running_no_short_flag(mock_check, mock_get_config, mock_api):
    """Test that -r is not a valid short flag for --running."""
    result = runner.invoke(app, ["job", "list", "-r"])
    assert result.exit_code != 0


@patch("transformerlab_cli.commands.job.api.get", return_value=_mock_api_response([SAMPLE_JOBS[1], SAMPLE_JOBS[3]]))
@patch("transformerlab_cli.commands.job.get_config", return_value="exp1")
@patch("transformerlab_cli.commands.job.check_configs")
def test_job_list_running_no_matches(mock_check, mock_get_config, mock_api):
    """Test that --running with no running jobs shows an empty table."""
    result = runner.invoke(app, ["job", "list", "--running"])
    assert result.exit_code == 0
    # Neither completed nor failed jobs should appear
    assert "eval" not in result.output
    assert "export" not in result.output
