from typer.testing import CliRunner
from transformerlab_cli.main import app

runner = CliRunner()


def test_status_help():
    """Test the status command help."""
    result = runner.invoke(app, ["status", "--help"])
    assert result.exit_code == 0
    assert "Usage: lab status [OPTIONS]" in result.output
    assert "Check the status of the server." in result.output
