from typer.testing import CliRunner
from transformerlab_cli.main import app

runner = CliRunner()


def test_job_help():
    """Test the job command help."""
    result = runner.invoke(app, ["job", "--help"])
    assert result.exit_code == 0
    assert "Usage: lab job [OPTIONS] COMMAND [ARGS]..." in result.output
    assert "Job management commands" in result.output
