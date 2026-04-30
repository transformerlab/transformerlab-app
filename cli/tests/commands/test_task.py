import json
from pathlib import Path
from unittest.mock import MagicMock, patch

from typer.testing import CliRunner
from transformerlab_cli.commands.task import build_launch_payload
from transformerlab_cli.main import app
from tests.helpers import strip_ansi

runner = CliRunner()


SAMPLE_TASKS = [
    {
        "id": "t1",
        "name": "finetune",
        "type": "REMOTE",
        "created_at": "2026-01-01T00:00:00",
        "updated_at": "2026-01-01T00:00:00",
    },
    {
        "id": "t2",
        "name": "eval",
        "type": "REMOTE",
        "created_at": "2026-01-02T00:00:00",
        "updated_at": "2026-01-02T00:00:00",
    },
]


def _mock_resp(data, status=200):
    m = MagicMock()
    m.status_code = status
    m.json.return_value = data
    return m


def test_task_help():
    """Test the task command help."""
    result = runner.invoke(app, ["task", "--help"])
    assert result.exit_code == 0
    out = strip_ansi(result.output)
    assert "Usage: lab task [OPTIONS] COMMAND [ARGS]..." in out
    assert "Task management commands" in out


@patch("transformerlab_cli.commands.task.api.get", return_value=_mock_resp(SAMPLE_TASKS))
@patch("transformerlab_cli.commands.task.require_current_experiment", return_value="exp1")
def test_task_list_json_output(_mock_exp, _mock_api):
    """task list --format json emits valid JSON array."""
    result = runner.invoke(app, ["--format", "json", "task", "list"])
    assert result.exit_code == 0
    data = json.loads(result.output.strip())
    assert isinstance(data, list)
    assert any(t["name"] == "finetune" for t in data)


@patch("transformerlab_cli.commands.task.api.get", return_value=_mock_resp(SAMPLE_TASKS))
@patch("transformerlab_cli.commands.task.require_current_experiment", return_value="exp1")
def test_task_list_json_no_spinner(_mock_exp, _mock_api):
    """task list --format json does not mix spinner text with JSON."""
    result = runner.invoke(app, ["--format", "json", "task", "list"])
    json.loads(result.output.strip())  # must not raise


def test_build_launch_payload_includes_description():
    """build_launch_payload forwards the description to the launch API body."""
    task = {"id": "t1", "name": "finetune", "experiment_id": "exp1", "run": "python main.py"}
    payload = build_launch_payload(task, "Local", description="Bump lr to 3e-5; expecting faster convergence.")
    assert payload["description"] == "Bump lr to 3e-5; expecting faster convergence."


def test_build_launch_payload_omits_description_by_default():
    """When --description is not passed, the payload carries description=None (backend treats as absent)."""
    task = {"id": "t1", "name": "finetune", "experiment_id": "exp1", "run": "python main.py"}
    payload = build_launch_payload(task, "Local")
    assert payload["description"] is None


SAMPLE_TASK = {
    "id": "t1",
    "name": "finetune",
    "experiment_id": "exp1",
    "run": "python main.py",
    "parameters": {},
    "config": {},
}
SAMPLE_PROVIDERS = [{"id": "p1", "name": "Local"}]


@patch("transformerlab_cli.commands.task.api.post_json", return_value=_mock_resp({"job_id": "j1"}))
@patch("transformerlab_cli.commands.task.fetch_providers", return_value=SAMPLE_PROVIDERS)
@patch("transformerlab_cli.commands.task.api.get", return_value=_mock_resp(SAMPLE_TASK))
@patch("transformerlab_cli.commands.task.require_current_experiment", return_value="exp1")
def test_task_queue_sends_description(_mock_exp, _mock_get, _mock_providers, mock_post):
    """`lab task queue -m "..." --no-interactive` sends description in the launch body."""
    result = runner.invoke(app, ["task", "queue", "t1", "--no-interactive", "-m", "hypothesis: larger batch"])
    assert result.exit_code == 0, result.output
    _path, body = mock_post.call_args.args
    assert body["description"] == "hypothesis: larger batch"


@patch(
    "transformerlab_cli.commands.task.api.post_json",
    side_effect=[
        _mock_resp({"detail": "task.yaml not found in repository"}, status=404),
        _mock_resp({"id": "t1"}, status=200),
    ],
)
@patch("transformerlab_cli.commands.task.require_current_experiment", return_value="exp1")
def test_task_add_from_git_no_interactive_skips_prompt_and_retries_create_if_missing(_mock_exp, mock_post):
    """`lab task add --from-git ... --no-interactive` should avoid prompts and retry with default task.yaml."""
    result = runner.invoke(app, ["task", "add", "--from-git", "https://github.com/example/repo", "--no-interactive"])
    assert result.exit_code == 0, result.output
    assert mock_post.call_count == 2
    retry_payload = mock_post.call_args.kwargs["json_data"]
    assert retry_payload["create_if_missing"] is True


@patch("transformerlab_cli.commands.task.api.post_text", return_value=_mock_resp({"valid": True}))
@patch("transformerlab_cli.commands.task.api.put", return_value=_mock_resp({"message": "OK"}))
@patch(
    "transformerlab_cli.commands.task.api.get",
    return_value=MagicMock(status_code=200, text="name: demo\nrun: echo hi\n"),
)
@patch("transformerlab_cli.commands.task.require_current_experiment", return_value="exp1")
def test_task_edit_updates_yaml_from_file(_mock_exp, _mock_get, mock_put, _mock_post_text):
    """`lab task edit --from-file` validates YAML and updates task.yaml."""
    with runner.isolated_filesystem():
        task_yaml = Path("task.yaml")
        task_yaml.write_text("name: demo\nrun: echo edited\n", encoding="utf-8")
        result = runner.invoke(app, ["task", "edit", "t1", "--from-file", str(task_yaml), "--no-interactive"])
    assert result.exit_code == 0, result.output
    submit_path = mock_put.call_args.args[0]
    assert submit_path == "/experiment/exp1/task/t1/yaml"


@patch("transformerlab_cli.commands.task.api.put", return_value=_mock_resp({"received": [0]}))
@patch("transformerlab_cli.commands.task.api.get", return_value=_mock_resp({"received": []}))
@patch("transformerlab_cli.commands.task.api.post_json")
@patch("transformerlab_cli.commands.task.require_current_experiment", return_value="exp1")
def test_task_upload_calls_upload_endpoint(_mock_exp, mock_post_json, _mock_get, _mock_put):
    """`lab task upload` uses upload pipeline then task upload endpoint."""
    mock_post_json.side_effect = [
        _mock_resp({"upload_id": "up-1"}),  # /upload/init
        _mock_resp({"status": "ok"}),  # /upload/{id}/complete
        _mock_resp({"id": "t1"}),  # /task/{id}/upload?upload_id=...
    ]

    with runner.isolated_filesystem():
        payload_file = Path("extra.txt")
        payload_file.write_text("hello", encoding="utf-8")
        result = runner.invoke(app, ["task", "upload", "t1", str(payload_file), "--no-interactive"])

    assert result.exit_code == 0, result.output
    submit_path = mock_post_json.call_args_list[-1].args[0]
    assert submit_path == "/experiment/exp1/task/t1/upload?upload_id=up-1"
