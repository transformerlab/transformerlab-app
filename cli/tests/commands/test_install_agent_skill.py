"""Tests for the install-agent-skill command."""

from unittest.mock import MagicMock, patch

from typer.testing import CliRunner

from transformerlab_cli.main import app

runner = CliRunner()

_MODULE = "transformerlab_cli.commands.install_agent_skill"


def test_install_agent_skill_success():
    """Successful skill install exits 0 and invokes npx with the expected args."""
    mock_proc = MagicMock(returncode=0)
    with (
        patch(f"{_MODULE}.shutil.which", return_value="/usr/local/bin/npx"),
        patch(f"{_MODULE}.subprocess.run", return_value=mock_proc) as mock_run,
    ):
        result = runner.invoke(app, ["install-agent-skill"])

    assert result.exit_code == 0
    args, _ = mock_run.call_args
    cmd = args[0]
    assert cmd[:3] == ["npx", "skills", "add"]
    assert "transformerlab/transformerlab-app" in cmd
    assert cmd[-2:] == ["--skill", "transformerlab-cli"]
    assert "successfully" in result.output.lower()


def test_install_agent_skill_npx_missing():
    """Missing `npx` exits 1 with a helpful message and never spawns a subprocess."""
    with (
        patch(f"{_MODULE}.shutil.which", return_value=None),
        patch(f"{_MODULE}.subprocess.run") as mock_run,
    ):
        result = runner.invoke(app, ["install-agent-skill"])

    assert result.exit_code == 1
    assert "npx" in result.output.lower()
    mock_run.assert_not_called()


def test_install_agent_skill_propagates_failure_exit_code():
    """A non-zero exit from npx is surfaced to the user."""
    mock_proc = MagicMock(returncode=2)
    with (
        patch(f"{_MODULE}.shutil.which", return_value="/usr/local/bin/npx"),
        patch(f"{_MODULE}.subprocess.run", return_value=mock_proc),
    ):
        result = runner.invoke(app, ["install-agent-skill"])

    assert result.exit_code == 2
    assert "exited with code 2" in result.output


def test_install_agent_skill_initializes_and_flushes_telemetry():
    """Telemetry must be initialized and flushed; otherwise incr/breadcrumb are no-ops."""
    mock_proc = MagicMock(returncode=0)
    with (
        patch(f"{_MODULE}.shutil.which", return_value="/usr/local/bin/npx"),
        patch(f"{_MODULE}.subprocess.run", return_value=mock_proc),
        patch(f"{_MODULE}.telemetry") as mock_telemetry,
    ):
        result = runner.invoke(app, ["install-agent-skill"])

    assert result.exit_code == 0
    mock_telemetry.init.assert_called_once()
    assert mock_telemetry.flush.called


def test_install_agent_skill_flushes_telemetry_when_npx_missing():
    """The npx-missing exit path must also flush telemetry."""
    with (
        patch(f"{_MODULE}.shutil.which", return_value=None),
        patch(f"{_MODULE}.telemetry") as mock_telemetry,
    ):
        result = runner.invoke(app, ["install-agent-skill"])

    assert result.exit_code == 1
    mock_telemetry.init.assert_called_once()
    assert mock_telemetry.flush.called
