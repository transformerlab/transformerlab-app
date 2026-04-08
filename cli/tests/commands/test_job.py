import json
from unittest.mock import MagicMock, patch

from typer.testing import CliRunner
from transformerlab_cli.main import app
from tests.helpers import strip_ansi

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
    out = strip_ansi(result.output)
    assert "Usage: lab job [OPTIONS] COMMAND [ARGS]..." in out
    assert "Job management commands" in out


@patch("transformerlab_cli.commands.job.api.get", return_value=_mock_api_response(SAMPLE_JOBS))
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
@patch("transformerlab_cli.commands.job.check_configs")
def test_job_list_all(mock_check, mock_require, mock_api):
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
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
@patch("transformerlab_cli.commands.job.check_configs")
def test_job_list_running_only(mock_check, mock_require, mock_api):
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
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
@patch("transformerlab_cli.commands.job.check_configs")
def test_job_list_running_no_short_flag(mock_check, mock_require, mock_api):
    """Test that -r is not a valid short flag for --running."""
    result = runner.invoke(app, ["job", "list", "-r"])
    assert result.exit_code != 0


@patch("transformerlab_cli.commands.job.api.get", return_value=_mock_api_response([SAMPLE_JOBS[1], SAMPLE_JOBS[3]]))
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
@patch("transformerlab_cli.commands.job.check_configs")
def test_job_list_running_no_matches(mock_check, mock_require, mock_api):
    """Test that --running with no running jobs shows an empty table."""
    result = runner.invoke(app, ["job", "list", "--running"])
    assert result.exit_code == 0
    # Neither completed nor failed jobs should appear
    assert "eval" not in result.output
    assert "export" not in result.output


@patch("transformerlab_cli.commands.job.api.get", return_value=_mock_api_response(SAMPLE_JOBS))
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
@patch("transformerlab_cli.commands.job.check_configs")
def test_job_list_json_output(mock_check, mock_get_config, mock_api):
    """job list --format json emits valid JSON array."""
    result = runner.invoke(app, ["--format", "json", "job", "list"])
    assert result.exit_code == 0
    data = json.loads(result.output.strip())
    assert isinstance(data, list)
    assert len(data) == 5
    assert all("id" in job for job in data)


@patch("transformerlab_cli.commands.job.api.get", return_value=_mock_api_response(SAMPLE_JOBS))
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
@patch("transformerlab_cli.commands.job.check_configs")
def test_job_list_json_no_spinner_text(mock_check, mock_get_config, mock_api):
    """job list --format json does not emit spinner/decoration text."""
    result = runner.invoke(app, ["--format", "json", "job", "list"])
    assert result.exit_code == 0
    json.loads(result.output.strip())


@patch("transformerlab_cli.commands.job.api.post")
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
def test_job_publish_dataset_success(mock_require, mock_post):
    """job publish dataset should call the dataset save endpoint."""
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"status": "started"}
    mock_post.return_value = mock_resp

    result = runner.invoke(
        app,
        [
            "--format",
            "json",
            "job",
            "publish",
            "dataset",
            "42",
            "my dataset",
            "--mode",
            "existing",
            "--group",
            "base-dataset",
            "--asset-name",
            "my-dataset-v2",
            "--tag",
            "production",
            "--version-label",
            "v2",
            "--description",
            "new run",
        ],
    )

    assert result.exit_code == 0
    called_endpoint = mock_post.call_args.args[0]
    assert "/experiment/exp1/jobs/42/datasets/my%20dataset/save_to_registry?" in called_endpoint
    assert "mode=existing" in called_endpoint
    assert "target_name=base-dataset" in called_endpoint
    assert "asset_name=my-dataset-v2" in called_endpoint
    assert "tag=production" in called_endpoint
    assert "version_label=v2" in called_endpoint
    assert "description=new+run" in called_endpoint


@patch("transformerlab_cli.commands.job.api.post")
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
def test_job_publish_model_existing_requires_group(mock_require, mock_post):
    """job publish model --mode existing should require --group in json mode (non-interactive)."""
    result = runner.invoke(
        app,
        [
            "--format",
            "json",
            "job",
            "publish",
            "model",
            "99",
            "llama-adapter",
            "--mode",
            "existing",
        ],
    )

    assert result.exit_code == 1
    assert "--group is required when --mode=existing" in strip_ansi(result.output)
    mock_post.assert_not_called()


@patch("transformerlab_cli.commands.job.api.post")
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
def test_job_publish_model_interactive_prompts(mock_require, mock_post):
    """job publish model should prompt for metadata in pretty mode."""
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"status": "started"}
    mock_post.return_value = mock_resp

    result = runner.invoke(
        app,
        ["job", "publish", "model", "10", "adapterA"],
        input="\n\nproduction\nv9\nPromoted build\n",
    )

    assert result.exit_code == 0
    called_endpoint = mock_post.call_args.args[0]
    assert "/experiment/exp1/jobs/10/models/adapterA/save_to_registry?" in called_endpoint
    assert "mode=new" in called_endpoint
    assert "tag=production" in called_endpoint
    assert "version_label=v9" in called_endpoint
    assert "description=Promoted+build" in called_endpoint


@patch("transformerlab_cli.commands.job.api.post")
@patch("transformerlab_cli.commands.job.api.get")
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
def test_job_publish_model_interactive_selects_model_from_job(mock_require, mock_get, mock_post):
    """job publish model without model name should list job models and let user pick one."""
    list_resp = MagicMock()
    list_resp.status_code = 200
    list_resp.json.return_value = {"models": [{"name": "adapter-a"}, {"name": "adapter-b"}]}

    publish_resp = MagicMock()
    publish_resp.status_code = 200
    publish_resp.json.return_value = {"status": "started"}

    mock_get.return_value = list_resp
    mock_post.return_value = publish_resp

    result = runner.invoke(
        app,
        ["job", "publish", "model", "10"],
        input="2\n\n\nlatest\nv1\n\n",
    )

    assert result.exit_code == 0
    mock_get.assert_called_once_with("/experiment/exp1/jobs/10/models")
    called_endpoint = mock_post.call_args.args[0]
    assert "/experiment/exp1/jobs/10/models/adapter-b/save_to_registry?" in called_endpoint
