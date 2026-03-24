"""Tests for login and logout commands."""

from unittest.mock import patch

from typer.testing import CliRunner
from transformerlab_cli.main import app

runner = CliRunner()


def test_login_help():
    """Test the login command help."""
    result = runner.invoke(app, ["login", "--help"])
    assert result.exit_code == 0
    assert "Log in to Transformer Lab" in result.output


def test_logout_help():
    """Test the logout command help."""
    result = runner.invoke(app, ["logout", "--help"])
    assert result.exit_code == 0
    assert "Log out from Transformer Lab" in result.output


@patch(
    "transformerlab_cli.commands.login.fetch_user_teams",
    return_value={"teams": [{"id": "t1", "name": "team1", "role": "OWNER"}]},
)
@patch("transformerlab_cli.commands.login.fetch_user_info", return_value={"email": "test@example.com", "id": 1})
@patch("transformerlab_cli.commands.login.set_api_key", return_value=True)
@patch("transformerlab_cli.commands.login.set_config")
@patch("transformerlab_cli.commands.login.load_config", return_value={"server": "http://localhost:8338"})
def test_login_success(mock_load, mock_set, mock_set_key, mock_user, mock_teams):
    """Test successful login flow."""
    result = runner.invoke(app, ["login", "--api-key", "test-key"])
    assert result.exit_code == 0
    assert "Login successful" in result.output


@patch("transformerlab_cli.commands.login.set_api_key", return_value=False)
@patch("transformerlab_cli.commands.login.load_config", return_value={"server": "http://localhost:8338"})
def test_login_failure(mock_load, mock_set_key):
    """Test login failure."""
    result = runner.invoke(app, ["login", "--api-key", "bad-key"])
    assert result.exit_code == 1


@patch("transformerlab_cli.commands.logout.delete_api_key", return_value=True)
def test_logout_success(mock_delete):
    """Test successful logout."""
    result = runner.invoke(app, ["logout"])
    assert result.exit_code == 0
