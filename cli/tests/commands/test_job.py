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
        "job_data": {
            "task_name": "train",
            "completion_status": "N/A",
            "description": "Bumped lr to 3e-5",
            "start_time": "2026-04-24 10:00:00",
        },
    },
    {
        "id": 2,
        "experiment_id": "exp1",
        "status": "COMPLETE",
        "progress": 100,
        "job_data": {
            "task_name": "eval",
            "completion_status": "SUCCESS",
            "description": "Eval on test split",
            "score": {"eval/loss": 2.1, "accuracy": 0.95, "discard": True},
            "start_time": "2026-04-24 10:00:00",
            "end_time": "2026-04-24 10:05:30",
        },
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
        "job_data": {
            "task_name": "export",
            "completion_status": "FAILED",
            "score": {"eval/loss": 3.5},
            "start_time": "2026-04-24 08:00:00",
            "end_time": "2026-04-24 09:30:00",
        },
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
def test_job_list_all(_mock_check, _mock_require, _mock_api):
    """Test that job list without --running shows all jobs."""
    result = runner.invoke(app, ["job", "list"])
    assert result.exit_code == 0
    # All 5 jobs should appear
    assert "train" in result.output
    assert "eval" in result.output
    assert "gener" in result.output
    assert "export" in result.output
    assert "chat" in result.output


@patch("transformerlab_cli.commands.job.api.get", return_value=_mock_api_response(SAMPLE_JOBS))
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
@patch("transformerlab_cli.commands.job.check_configs")
def test_job_list_shows_description(_mock_check, _mock_require, _mock_api):
    """Test that job list table includes the Description column with values."""
    result = runner.invoke(app, ["job", "list"])
    assert result.exit_code == 0
    out = strip_ansi(result.output)
    assert "Descr" in out
    assert "Bumped" in out
    assert "Eval" in out


@patch("transformerlab_cli.commands.job.api.get", return_value=_mock_api_response(SAMPLE_JOBS))
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
@patch("transformerlab_cli.commands.job.check_configs")
def test_job_list_running_only(_mock_check, _mock_require, _mock_api):
    """Test that job list --running shows only RUNNING, LAUNCHING, and INTERACTIVE jobs."""
    result = runner.invoke(app, ["job", "list", "--running"])
    assert result.exit_code == 0
    # Running jobs should appear
    assert "train" in result.output  # RUNNING
    assert "gener" in result.output  # LAUNCHING
    assert "chat" in result.output  # INTERACTIVE
    # Completed/failed jobs should not appear
    assert "eval" not in result.output
    assert "export" not in result.output


@patch("transformerlab_cli.commands.job.api.get", return_value=_mock_api_response(SAMPLE_JOBS))
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
@patch("transformerlab_cli.commands.job.check_configs")
def test_job_list_running_no_short_flag(_mock_check, _mock_require, _mock_api):
    """Test that -r is not a valid short flag for --running."""
    result = runner.invoke(app, ["job", "list", "-r"])
    assert result.exit_code != 0


@patch("transformerlab_cli.commands.job.api.get", return_value=_mock_api_response([SAMPLE_JOBS[1], SAMPLE_JOBS[3]]))
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
@patch("transformerlab_cli.commands.job.check_configs")
def test_job_list_running_no_matches(_mock_check, _mock_require, _mock_api):
    """Test that --running with no running jobs shows an empty table."""
    result = runner.invoke(app, ["job", "list", "--running"])
    assert result.exit_code == 0
    # Neither completed nor failed jobs should appear
    assert "eval" not in result.output
    assert "export" not in result.output


@patch("transformerlab_cli.commands.job.api.get", return_value=_mock_api_response(SAMPLE_JOBS))
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
@patch("transformerlab_cli.commands.job.check_configs")
def test_job_list_json_output(_mock_check, _mock_get_config, _mock_api):
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
def test_job_list_json_no_spinner_text(_mock_check, _mock_get_config, _mock_api):
    """job list --format json does not emit spinner/decoration text."""
    result = runner.invoke(app, ["--format", "json", "job", "list"])
    assert result.exit_code == 0
    json.loads(result.output.strip())


@patch("transformerlab_cli.commands.job.api.get", return_value=_mock_api_response(SAMPLE_JOBS))
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
@patch("transformerlab_cli.commands.job.check_configs")
def test_job_list_shows_duration(_mock_check, _mock_require, _mock_api):
    """Test that job list table shows duration for jobs with start/end times."""
    result = runner.invoke(app, ["job", "list"])
    assert result.exit_code == 0
    out = strip_ansi(result.output)
    assert "Duration" in out
    # Job 2: 5m 30s
    assert "5m 30s" in out
    # Job 4: 1h 30m
    assert "1h 30m" in out


def test_compute_duration_helper():
    """Test the _compute_duration helper with various inputs."""
    from transformerlab_cli.commands.job import _compute_duration

    # Completed job
    assert _compute_duration({"start_time": "2026-01-01 10:00:00", "end_time": "2026-01-01 10:00:45"}) == "45s"
    assert _compute_duration({"start_time": "2026-01-01 10:00:00", "end_time": "2026-01-01 10:05:30"}) == "5m 30s"
    assert _compute_duration({"start_time": "2026-01-01 10:00:00", "end_time": "2026-01-01 12:15:00"}) == "2h 15m"
    # No start_time
    assert _compute_duration({}) == ""
    # Bad format
    assert _compute_duration({"start_time": "invalid"}) == ""


@patch("transformerlab_cli.commands.job.api.get", return_value=_mock_api_response(SAMPLE_JOBS))
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
@patch("transformerlab_cli.commands.job.check_configs")
def test_job_list_shows_score(_mock_check, _mock_require, _mock_api):
    """Test that job list table shows score values for jobs that have them."""
    result = runner.invoke(app, ["job", "list"])
    assert result.exit_code == 0
    out = strip_ansi(result.output)
    # Job 2 has score with eval/loss=2.1 (may be truncated by Rich table)
    assert "eval/" in out
    # Job 1 (no score) should have empty score column — just verify Score header is present
    assert "Score" in out
    # discard flag should not be shown as a score metric
    assert "discard" not in out.lower()


@patch("transformerlab_cli.commands.job.api.get", return_value=_mock_api_response(SAMPLE_JOBS))
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
def test_job_info_pretty_shows_discarded(_mock_require, _mock_api):
    """job info pretty output should include discarded status."""
    result = runner.invoke(app, ["job", "info", "2"])
    assert result.exit_code == 0
    out = strip_ansi(result.output)
    assert "discarded" in out.lower()


@patch("transformerlab_cli.commands.job.api.get", return_value=_mock_api_response(SAMPLE_JOBS))
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
def test_job_info_pretty_shows_score_without_discard(_mock_require, _mock_api):
    """job info pretty output should show score metrics and hide score.discard."""
    result = runner.invoke(app, ["job", "info", "2"])
    assert result.exit_code == 0
    out = strip_ansi(result.output)
    assert "Score:" in out
    assert "eval/loss" in out
    assert "accuracy" in out
    assert "discard: True" not in out


@patch("transformerlab_cli.commands.job.api.get", return_value=_mock_api_response(SAMPLE_JOBS))
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
@patch("transformerlab_cli.commands.job.check_configs")
def test_job_list_sort_by_metric_desc_default(_mock_check, _mock_require, _mock_api):
    """Test that score sorting defaults to descending and missing metric jobs are last."""
    result = runner.invoke(app, ["--format", "json", "job", "list", "--score-metric", "eval/loss"])
    assert result.exit_code == 0
    data = json.loads(result.output.strip())
    # Job 4 (eval/loss=3.5) should come before Job 2 (eval/loss=2.1),
    # and jobs without the metric should be at the end.
    ids = [j["id"] for j in data]
    assert ids.index(4) < ids.index(2)
    # Jobs without eval/loss (1, 3, 5) should be after jobs with it
    assert ids.index(2) < ids.index(1)
    assert ids.index(4) < ids.index(1)


@patch("transformerlab_cli.commands.job.api.get", return_value=_mock_api_response(SAMPLE_JOBS))
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
@patch("transformerlab_cli.commands.job.check_configs")
def test_job_list_sort_by_metric_asc(_mock_check, _mock_require, _mock_api):
    """Test that score sorting can be switched to ascending."""
    result = runner.invoke(
        app,
        ["--format", "json", "job", "list", "--score-metric", "eval/loss", "--score-order", "asc"],
    )
    assert result.exit_code == 0
    data = json.loads(result.output.strip())
    ids = [j["id"] for j in data]
    assert ids.index(2) < ids.index(4)


# ---------------------------------------------------------------------------
# Info command tests
# ---------------------------------------------------------------------------


def _info_api_get(jobs, files):
    """Build a fake api.get that routes /jobs/list → jobs and /files → {'files': files}."""

    def _get(path, *args, **kwargs):
        if path.endswith("/files"):
            return _mock_api_response({"files": files})
        return _mock_api_response(jobs)

    return _get


@patch(
    "transformerlab_cli.commands.job.api.get",
    side_effect=_info_api_get(SAMPLE_JOBS, [{"name": "out.log", "is_dir": False, "size": 42}]),
)
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
def test_job_info_json_output(_mock_require, _mock_api):
    """job info --format json emits the job dict with a files key."""
    result = runner.invoke(app, ["--format", "json", "job", "info", "1"])
    assert result.exit_code == 0
    data = json.loads(result.output.strip())
    assert data["id"] == 1
    assert data["status"] == "RUNNING"
    assert data["files"] == [{"name": "out.log", "is_dir": False, "size": 42}]
    assert data["discarded"] is False


@patch("transformerlab_cli.commands.job.api.get", return_value=_mock_api_response(SAMPLE_JOBS))
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
@patch("transformerlab_cli.commands.job.check_configs")
def test_job_list_json_output_includes_discarded(_mock_check, _mock_require, _mock_api):
    """job list --format json should include explicit discarded flag per job."""
    result = runner.invoke(app, ["--format", "json", "job", "list"])
    assert result.exit_code == 0
    data = json.loads(result.output.strip())
    assert isinstance(data, list)
    assert all("discarded" in job for job in data)


@patch(
    "transformerlab_cli.commands.job.api.get",
    side_effect=_info_api_get(SAMPLE_JOBS, []),
)
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
def test_job_info_json_not_found(_mock_require, _mock_api):
    """job info --format json emits an error object when the job is missing."""
    result = runner.invoke(app, ["--format", "json", "job", "info", "999"])
    assert result.exit_code == 0
    data = json.loads(result.output.strip())
    assert "error" in data
    assert "999" in data["error"]


@patch(
    "transformerlab_cli.commands.job.api.get",
    side_effect=_info_api_get(SAMPLE_JOBS, []),
)
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
def test_job_info_pretty_still_works(_mock_require, _mock_api):
    """Pretty `job info` still renders the panel and does not regress."""
    result = runner.invoke(app, ["job", "info", "1"])
    assert result.exit_code == 0
    out = strip_ansi(result.output)
    assert "Job Details for ID 1" in out
    assert "RUNNING" in out


# ---------------------------------------------------------------------------
# Stop command tests
# ---------------------------------------------------------------------------


@patch("transformerlab_cli.commands.job.api.post")
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
@patch("transformerlab_cli.commands.job.api.get")
def test_job_stop_also_sends_cluster_stop_when_provider_metadata_exists(_mock_get, _mock_require, mock_post):
    """job stop should mirror GUI behavior and request provider cluster stop when possible."""
    stop_response = MagicMock()
    stop_response.status_code = 200
    stop_response.json.return_value = {"message": "OK"}

    job_response = MagicMock()
    job_response.status_code = 200
    job_response.json.return_value = {
        "id": "42",
        "job_data": {"provider_id": "provider-1", "cluster_name": "cluster-a"},
    }

    _mock_get.side_effect = [stop_response, job_response]

    cluster_stop_response = MagicMock()
    cluster_stop_response.status_code = 200
    mock_post.return_value = cluster_stop_response

    result = runner.invoke(app, ["job", "stop", "42"])
    assert result.exit_code == 0, result.output
    assert _mock_get.call_args_list[0].args[0] == "/experiment/exp1/jobs/42/stop"
    assert _mock_get.call_args_list[1].args[0] == "/experiment/exp1/jobs/42"
    mock_post.assert_called_once_with("/compute_provider/providers/provider-1/clusters/cluster-a/stop?job_id=42")


@patch("transformerlab_cli.commands.job.api.post")
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
@patch("transformerlab_cli.commands.job.api.get")
def test_job_stop_skips_cluster_stop_without_provider_metadata(_mock_get, _mock_require, mock_post):
    """job stop should not call cluster-stop when provider metadata is missing."""
    stop_response = MagicMock()
    stop_response.status_code = 200
    stop_response.json.return_value = {"message": "OK"}

    job_response = MagicMock()
    job_response.status_code = 200
    job_response.json.return_value = {"id": "42", "job_data": {}}

    _mock_get.side_effect = [stop_response, job_response]

    result = runner.invoke(app, ["job", "stop", "42"])
    assert result.exit_code == 0, result.output
    mock_post.assert_not_called()


# ---------------------------------------------------------------------------
# Log command tests
# ---------------------------------------------------------------------------


def _mock_logs_response(logs_text="line1\nline2\nline3"):
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"logs": logs_text}
    return mock_resp


def _mock_error_response(status_code=500):
    mock_resp = MagicMock()
    mock_resp.status_code = status_code
    mock_resp.json.return_value = {"detail": "something went wrong"}
    return mock_resp


@patch("transformerlab_cli.commands.job.fetch_logs", return_value=_mock_logs_response())
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
def test_machine_logs_pretty(_mock_require, _mock_fetch):
    """machine-logs prints log text in pretty mode."""
    result = runner.invoke(app, ["job", "machine-logs", "42"])
    assert result.exit_code == 0
    assert "line1" in result.output
    assert "line3" in result.output


@patch("transformerlab_cli.commands.job.fetch_logs", return_value=_mock_logs_response())
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
def test_machine_logs_json(_mock_require, _mock_fetch):
    """machine-logs --format json emits valid JSON with logs field."""
    result = runner.invoke(app, ["--format", "json", "job", "machine-logs", "42"])
    assert result.exit_code == 0
    data = json.loads(result.output.strip())
    assert data["job_id"] == "42"
    assert "line1" in data["logs"]
    assert data["line_count"] == 3


@patch("transformerlab_cli.commands.job.fetch_logs", return_value=_mock_error_response(502))
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
def test_machine_logs_error(_mock_require, _mock_fetch):
    """machine-logs returns non-zero exit on API error."""
    result = runner.invoke(app, ["job", "machine-logs", "42"])
    assert result.exit_code == 1


@patch(
    "transformerlab_cli.commands.job.fetch_logs",
    return_value=_mock_logs_response(""),
)
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
def test_machine_logs_not_ready_message_pretty(_mock_require, _mock_fetch):
    """machine-logs shows retry message from API and exits cleanly when logs are not ready yet."""
    _mock_fetch.return_value.json.return_value = {
        "logs": "",
        "message": "Machine logs are not available yet while the job is still launching. Please try again shortly.",
        "retryable": True,
        "retry_after_seconds": 10,
    }
    result = runner.invoke(app, ["job", "machine-logs", "42"])
    assert result.exit_code == 0
    assert "not available yet" in strip_ansi(result.output)


@patch(
    "transformerlab_cli.commands.job.fetch_logs",
    return_value=_mock_logs_response(""),
)
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
def test_machine_logs_not_ready_message_json(_mock_require, _mock_fetch):
    """machine-logs --format json preserves retry metadata when logs are not ready yet."""
    _mock_fetch.return_value.json.return_value = {
        "logs": "",
        "message": "Machine logs are not available yet while the job is still launching. Please try again shortly.",
        "retryable": True,
        "retry_after_seconds": 10,
    }
    result = runner.invoke(app, ["--format", "json", "job", "machine-logs", "42"])
    assert result.exit_code == 0
    data = json.loads(result.output.strip())
    assert data["job_id"] == "42"
    assert data["line_count"] == 0
    assert data["retryable"] is True
    assert "not available yet" in data["message"]


@patch(
    "transformerlab_cli.commands.job.fetch_task_logs",
    return_value=_mock_logs_response("sdk output line 1\nsdk output line 2"),
)
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
def test_task_logs_pretty(_mock_require, _mock_fetch):
    """task-logs prints task output in pretty mode."""
    result = runner.invoke(app, ["job", "task-logs", "42"])
    assert result.exit_code == 0
    assert "sdk output line 1" in result.output


@patch("transformerlab_cli.commands.job.fetch_task_logs", return_value=_mock_logs_response("sdk line"))
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
def test_task_logs_json(_mock_require, _mock_fetch):
    """task-logs --format json emits valid JSON."""
    result = runner.invoke(app, ["--format", "json", "job", "task-logs", "42"])
    assert result.exit_code == 0
    data = json.loads(result.output.strip())
    assert "sdk line" in data["logs"]


@patch("transformerlab_cli.commands.job.fetch_task_logs", return_value=_mock_logs_response(""))
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
def test_task_logs_not_ready_message_json(_mock_require, _mock_fetch):
    """task-logs --format json preserves retry metadata when logs are not ready yet."""
    _mock_fetch.return_value.json.return_value = {
        "logs": "",
        "message": "Task logs are not available yet while the job is still launching. Please try again shortly.",
        "retryable": True,
        "retry_after_seconds": 10,
    }
    result = runner.invoke(app, ["--format", "json", "job", "task-logs", "42"])
    assert result.exit_code == 0
    data = json.loads(result.output.strip())
    assert data["job_id"] == "42"
    assert data["retryable"] is True
    assert "not available yet" in data["message"]


@patch("transformerlab_cli.commands.job.api.get", return_value=_mock_logs_response("sdk line"))
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
def test_task_logs_hits_task_logs_endpoint(_mock_require, mock_get):
    """`fetch_task_logs` must hit the one-shot /task_logs endpoint, not the SSE /stream_output."""
    result = runner.invoke(app, ["job", "task-logs", "42"])
    assert result.exit_code == 0
    called_url = mock_get.call_args.args[0] if mock_get.call_args.args else mock_get.call_args.kwargs.get("url", "")
    assert called_url.endswith("/jobs/42/task_logs"), f"expected /task_logs endpoint, got: {called_url}"


@patch("transformerlab_cli.commands.job.fetch_task_logs", return_value=_mock_error_response(404))
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
def test_task_logs_error(_mock_require, _mock_fetch):
    """task-logs returns non-zero exit on API error."""
    result = runner.invoke(app, ["job", "task-logs", "42"])
    assert result.exit_code == 1


@patch(
    "transformerlab_cli.commands.job.fetch_request_logs",
    return_value=_mock_logs_response("Provisioning cluster...\nDone."),
)
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
def test_request_logs_pretty(_mock_require, _mock_fetch):
    """request-logs prints request/launch logs in pretty mode."""
    result = runner.invoke(app, ["job", "request-logs", "42"])
    assert result.exit_code == 0
    assert "Provisioning cluster" in result.output


@patch("transformerlab_cli.commands.job.fetch_request_logs", return_value=_mock_logs_response("launch log"))
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
def test_request_logs_json(_mock_require, _mock_fetch):
    """request-logs --format json emits valid JSON."""
    result = runner.invoke(app, ["--format", "json", "job", "request-logs", "42"])
    assert result.exit_code == 0
    data = json.loads(result.output.strip())
    assert "launch log" in data["logs"]


@patch("transformerlab_cli.commands.job.fetch_request_logs", return_value=_mock_logs_response(""))
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
def test_request_logs_not_ready_message_json(_mock_require, _mock_fetch):
    """request-logs --format json preserves retry metadata when logs are not ready yet."""
    _mock_fetch.return_value.json.return_value = {
        "logs": "",
        "message": "Request logs are not available yet while the job is still launching. Please try again shortly.",
        "retryable": True,
        "retry_after_seconds": 10,
    }
    result = runner.invoke(app, ["--format", "json", "job", "request-logs", "42"])
    assert result.exit_code == 0
    data = json.loads(result.output.strip())
    assert data["job_id"] == "42"
    assert data["retryable"] is True
    assert "not available yet" in data["message"]


@patch("transformerlab_cli.commands.job.fetch_request_logs", return_value=_mock_error_response(400))
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
def test_request_logs_error(_mock_require, _mock_fetch):
    """request-logs returns non-zero exit on API error."""
    result = runner.invoke(app, ["job", "request-logs", "42"])
    assert result.exit_code == 1


@patch("transformerlab_cli.commands.job.fetch_logs", return_value=_mock_logs_response())
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
def test_deprecated_logs_still_works(_mock_require, _mock_fetch):
    """The deprecated 'logs' command should still work and delegate to machine-logs."""
    result = runner.invoke(app, ["job", "logs", "42"])
    assert result.exit_code == 0
    assert "line1" in result.output


# ---------------------------------------------------------------------------
# Discard command tests
# ---------------------------------------------------------------------------


@patch("transformerlab_cli.commands.job.api.put")
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
def test_job_discard_sets_discard_true(_mock_require, mock_put):
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_put.return_value = mock_resp

    result = runner.invoke(app, ["job", "discard", "42"])
    assert result.exit_code == 0
    mock_put.assert_called_once_with(
        "/experiment/exp1/jobs/42/job_data",
        json={"updates": {"discard": True}},
    )


@patch("transformerlab_cli.commands.job.api.put")
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
def test_job_discard_undo_sets_discard_false(_mock_require, mock_put):
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_put.return_value = mock_resp

    result = runner.invoke(app, ["job", "discard", "42", "--undo"])
    assert result.exit_code == 0
    mock_put.assert_called_once_with(
        "/experiment/exp1/jobs/42/job_data",
        json={"updates": {"discard": False}},
    )


# ---------------------------------------------------------------------------
# Publish command tests
# ---------------------------------------------------------------------------


@patch("transformerlab_cli.commands.job.api.post")
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
def test_job_publish_dataset_success(_mock_require, mock_post):
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
            "--tag",
            "production",
            "--description",
            "new run",
        ],
    )

    assert result.exit_code == 0
    called_endpoint = mock_post.call_args.args[0]
    assert "/experiment/exp1/jobs/42/datasets/my%20dataset/save_to_registry?" in called_endpoint
    assert "mode=existing" in called_endpoint
    assert "target_name=base-dataset" in called_endpoint
    assert "tag=production" in called_endpoint
    assert "description=new+run" in called_endpoint


@patch("transformerlab_cli.commands.job.api.post")
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
def test_job_publish_model_existing_requires_group(_mock_require, mock_post):
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
def test_job_publish_model_interactive_prompts(_mock_require, mock_post):
    """job publish model should prompt for metadata in pretty mode."""
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"status": "started"}
    mock_post.return_value = mock_resp

    # Prompts in order: mode (default=new), tag, description
    result = runner.invoke(
        app,
        ["job", "publish", "model", "10", "adapterA"],
        input="\nproduction\nPromoted build\n",
    )

    assert result.exit_code == 0
    called_endpoint = mock_post.call_args.args[0]
    assert "/experiment/exp1/jobs/10/models/adapterA/save_to_registry?" in called_endpoint
    assert "mode=new" in called_endpoint
    assert "tag=production" in called_endpoint
    assert "description=Promoted+build" in called_endpoint


@patch("transformerlab_cli.commands.job.api.post")
@patch("transformerlab_cli.commands.job.api.get")
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
def test_job_publish_model_interactive_selects_model_from_job(_mock_require, mock_get, mock_post):
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
        input="2\n\nlatest\n\n",
    )

    assert result.exit_code == 0
    mock_get.assert_called_once_with("/experiment/exp1/jobs/10/models")
    called_endpoint = mock_post.call_args.args[0]
    assert "/experiment/exp1/jobs/10/models/adapter-b/save_to_registry?" in called_endpoint


# ---------------------------------------------------------------------------
# Delete command tests
# ---------------------------------------------------------------------------


@patch("transformerlab_cli.commands.job.api.delete", return_value=_mock_api_response({"message": "OK"}))
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
@patch("transformerlab_cli.commands.job.check_configs")
def test_job_delete_no_interactive(_mock_check, _mock_require, mock_delete):
    """`job delete <id> --no-interactive` deletes without prompting."""
    result = runner.invoke(app, ["job", "delete", "42", "--no-interactive"])
    assert result.exit_code == 0, result.output
    out = strip_ansi(result.output)
    assert "deleted" in out
    mock_delete.assert_called_once_with("/experiment/exp1/jobs/42")


@patch("transformerlab_cli.commands.job.api.delete", return_value=_mock_api_response({"message": "OK"}))
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
@patch("transformerlab_cli.commands.job.check_configs")
def test_job_delete_interactive_aborts_on_no(_mock_check, _mock_require, mock_delete):
    """Without `--no-interactive`, replying 'n' aborts the deletion."""
    result = runner.invoke(app, ["job", "delete", "42"], input="n\n")
    assert result.exit_code != 0
    mock_delete.assert_not_called()


@patch("transformerlab_cli.commands.job.api.delete")
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
@patch("transformerlab_cli.commands.job.check_configs")
def test_job_delete_not_found(_mock_check, _mock_require, mock_delete):
    """A 404 from the API should produce a non-zero exit and a helpful message."""
    not_found = MagicMock()
    not_found.status_code = 404
    not_found.json.return_value = {"detail": "Job not found"}
    not_found.text = ""
    mock_delete.return_value = not_found

    result = runner.invoke(app, ["job", "delete", "999", "--no-interactive"])
    assert result.exit_code == 1
    out = strip_ansi(result.output)
    assert "999" in out


@patch("transformerlab_cli.commands.job.api.delete", return_value=_mock_api_response({"message": "OK"}))
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
@patch("transformerlab_cli.commands.job.check_configs")
def test_job_delete_json_output(_mock_check, _mock_require, _mock_delete):
    """`job delete --format json` returns {"deleted": <id>}."""
    result = runner.invoke(
        app,
        ["--format", "json", "job", "delete", "42", "--no-interactive"],
    )
    assert result.exit_code == 0, result.output
    data = json.loads(result.output.strip())
    assert data == {"deleted": "42"}


@patch("transformerlab_cli.commands.job.api.delete")
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
@patch("transformerlab_cli.commands.job.check_configs")
def test_job_delete_json_error(_mock_check, _mock_require, mock_delete):
    """`job delete --format json` emits {"error": ...} on API failure."""
    err = MagicMock()
    err.status_code = 500
    err.json.return_value = {"detail": "boom"}
    err.text = ""
    mock_delete.return_value = err

    result = runner.invoke(
        app,
        ["--format", "json", "job", "delete", "42", "--no-interactive"],
    )
    assert result.exit_code == 1
    data = json.loads(result.output.strip())
    assert "error" in data


# ---------------------------------------------------------------------------
# Delete-all command tests
# ---------------------------------------------------------------------------


@patch("transformerlab_cli.commands.job.api.get")
@patch("transformerlab_cli.commands.job.api.delete", return_value=_mock_api_response({"message": "OK"}))
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
@patch("transformerlab_cli.commands.job.check_configs")
def test_job_delete_all_no_interactive(_mock_check, _mock_require, mock_delete, mock_get):
    """`job delete-all --no-interactive` deletes all jobs in the current experiment."""
    mock_get.return_value = _mock_api_response(SAMPLE_JOBS)

    result = runner.invoke(app, ["job", "delete-all", "--no-interactive"])
    assert result.exit_code == 0, result.output
    out = strip_ansi(result.output)
    assert "5" in out
    mock_delete.assert_called_once_with("/experiment/exp1/jobs/delete_all")


@patch("transformerlab_cli.commands.job.api.get", return_value=_mock_api_response([]))
@patch("transformerlab_cli.commands.job.api.delete", return_value=_mock_api_response({"message": "OK"}))
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
@patch("transformerlab_cli.commands.job.check_configs")
def test_job_delete_all_interactive_aborts_on_no(_mock_check, _mock_require, mock_delete, _mock_get):
    """Without `--no-interactive`, replying 'n' aborts delete-all."""
    result = runner.invoke(app, ["job", "delete-all"], input="n\n")
    assert result.exit_code != 0
    mock_delete.assert_not_called()


@patch("transformerlab_cli.commands.job.api.get")
@patch("transformerlab_cli.commands.job.api.delete", return_value=_mock_api_response({"message": "OK", "deleted": 5}))
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
@patch("transformerlab_cli.commands.job.check_configs")
def test_job_delete_all_json_output(_mock_check, _mock_require, _mock_delete, mock_get):
    """`job delete-all --format json` returns {"deleted": N}."""
    mock_get.return_value = _mock_api_response(SAMPLE_JOBS)

    result = runner.invoke(
        app,
        ["--format", "json", "job", "delete-all", "--no-interactive"],
    )
    assert result.exit_code == 0, result.output
    data = json.loads(result.output.strip())
    assert data == {"deleted": 5}


@patch("transformerlab_cli.commands.job.api.get", return_value=_mock_api_response([]))
@patch("transformerlab_cli.commands.job.api.delete", return_value=_mock_api_response({"message": "OK", "deleted": 0}))
@patch("transformerlab_cli.commands.job.require_current_experiment", return_value="exp1")
@patch("transformerlab_cli.commands.job.check_configs")
def test_job_delete_all_zero_jobs(_mock_check, _mock_require, _mock_delete, _mock_get):
    """`job delete-all` on an empty experiment reports 0 and exits cleanly."""
    result = runner.invoke(
        app,
        ["--format", "json", "job", "delete-all", "--no-interactive"],
    )
    assert result.exit_code == 0
    data = json.loads(result.output.strip())
    assert data == {"deleted": 0}
