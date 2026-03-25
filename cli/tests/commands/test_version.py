from typer.testing import CliRunner
from transformerlab_cli.main import app
from importlib.metadata import version

runner = CliRunner()


def test_version():
    """Test the version command."""
    result = runner.invoke(app, ["version"])
    assert result.exit_code == 0
    assert f"v{version('transformerlab-cli')}" in result.output
