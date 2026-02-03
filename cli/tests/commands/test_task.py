from typer.testing import CliRunner
from transformerlab_cli.main import app

runner = CliRunner()


def test_task_help():
    """Test the task command help."""
    result = runner.invoke(app, ["task", "--help"])
    assert result.exit_code == 0
    assert "Usage: lab task [OPTIONS] COMMAND [ARGS]..." in result.output
    assert "Task management commands" in result.output
