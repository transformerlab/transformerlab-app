from typer.testing import CliRunner
from transformerlab_cli.main import app
from tests.helpers import strip_ansi

runner = CliRunner()


def test_status_help():
    """Test the status command help."""
    result = runner.invoke(app, ["status", "--help"])
    assert result.exit_code == 0
    out = strip_ansi(result.output)
    assert "Usage: lab status [OPTIONS]" in out
    assert "Check the status of the server." in out
