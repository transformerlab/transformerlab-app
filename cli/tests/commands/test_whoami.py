from typer.testing import CliRunner
from transformerlab_cli.main import app

runner = CliRunner()


def test_not_logged_in():
    """Test the whoami command when not logged in."""
    result = runner.invoke(app, ["whoami"])
    assert result.exit_code == 1  # Exit code 1 indicates an error
    assert "Error: Not logged in. Please run 'lab login' first." in result.output
