import json
from unittest.mock import MagicMock, patch

from typer.testing import CliRunner
from transformerlab_cli.main import app

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
    assert "Usage: lab task [OPTIONS] COMMAND [ARGS]..." in result.output
    assert "Task management commands" in result.output


@patch("transformerlab_cli.commands.task.api.get", return_value=_mock_resp(SAMPLE_TASKS))
@patch("transformerlab_cli.commands.task.require_current_experiment", return_value="exp1")
def test_task_list_json_output(mock_exp, mock_api):
    """task list --format json emits valid JSON array."""
    result = runner.invoke(app, ["--format", "json", "task", "list"])
    assert result.exit_code == 0
    data = json.loads(result.output.strip())
    assert isinstance(data, list)
    assert any(t["name"] == "finetune" for t in data)


@patch("transformerlab_cli.commands.task.api.get", return_value=_mock_resp(SAMPLE_TASKS))
@patch("transformerlab_cli.commands.task.require_current_experiment", return_value="exp1")
def test_task_list_json_no_spinner(mock_exp, mock_api):
    """task list --format json does not mix spinner text with JSON."""
    result = runner.invoke(app, ["--format", "json", "task", "list"])
    json.loads(result.output.strip())  # must not raise
