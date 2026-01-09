from typer.testing import CliRunner
from transformerlab_cli.main import app

runner = CliRunner()


def test_help():
    """Test the --help command."""
    result = runner.invoke(app, ["--help"])
    assert result.exit_code == 0
    assert "Transformer Lab CLI" in result.output
    assert "Usage:" in result.output
