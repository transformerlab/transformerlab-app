from unittest.mock import patch

from typer.testing import CliRunner
from transformerlab_cli.main import app

runner = CliRunner()


def test_not_logged_in():
    """Test the whoami command when not logged in."""
    with patch("transformerlab_cli.commands.whoami.get_api_key", return_value=None):
        result = runner.invoke(app, ["whoami"])
    assert result.exit_code == 1  # Exit code 1 indicates an error
    assert "Not logged in" in result.output
