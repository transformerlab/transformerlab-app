from typer.testing import CliRunner
from transformerlab_cli.main import app
from transformerlab_cli import __version__

runner = CliRunner()


def test_version():
    """Test the version command."""
    result = runner.invoke(app, ["version"])
    assert result.exit_code == 0
    assert f"v{__version__}" in result.output
