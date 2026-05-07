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
def test_login_success(_mock_load, _mock_set, _mock_set_key, _mock_user, _mock_teams):
    """Test successful login flow."""
    result = runner.invoke(app, ["login", "--server", "http://localhost:8338", "--api-key", "test-key"])
    assert result.exit_code == 0
    assert "Login successful" in result.output


@patch("transformerlab_cli.commands.login.set_api_key", return_value=False)
@patch("transformerlab_cli.commands.login.load_config", return_value={"server": "http://localhost:8338"})
def test_login_failure(_mock_load, _mock_set_key):
    """Test login failure."""
    result = runner.invoke(app, ["login", "--server", "http://localhost:8338", "--api-key", "bad-key"])
    assert result.exit_code == 1


@patch("transformerlab_cli.commands.logout.delete_api_key", return_value=True)
def test_logout_success(_mock_delete):
    """Test successful logout."""
    result = runner.invoke(app, ["logout"])
    assert result.exit_code == 0


@patch("transformerlab_cli.commands.logout.delete_api_key", return_value=True)
def test_logout_clears_user_and_team_keys_but_not_server(_mock_delete):
    """Regression: logout must only clear session-scoped keys, keep server.

    And, via the autouse isolation fixture, must never touch the real
    ~/.lab/config.json on the developer's machine.
    """
    import json

    from transformerlab_cli.util.shared import CONFIG_FILE

    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        f.write(
            json.dumps(
                {
                    "server": "http://localhost:8338",
                    "team_id": "abc-123",
                    "team_name": "Team Name",
                    "user_email": "user@example.com",
                    "current_experiment": "alpha",
                }
            )
        )

    result = runner.invoke(app, ["logout"])
    assert result.exit_code == 0

    with open(CONFIG_FILE, "r", encoding="utf-8") as f:
        data = json.loads(f.read())
    assert data == {"server": "http://localhost:8338"}, data


@patch(
    "transformerlab_cli.commands.login.fetch_user_teams",
    return_value={"teams": [{"id": "t1", "name": "team1", "role": "OWNER"}]},
)
@patch("transformerlab_cli.commands.login.fetch_user_info", return_value={"email": "u@example.com", "id": 1})
@patch("transformerlab_cli.commands.login.set_api_key", return_value=True)
@patch("transformerlab_cli.commands.login.set_config")
@patch("transformerlab_cli.commands.login.load_config", return_value={"server": "http://localhost:8338"})
@patch(
    "transformerlab_cli.commands.login.run_browser_login",
    return_value={"api_key": "tlab_browser", "team_id": "t1", "team_name": "team1"},
)
def test_login_browser_flow_success(_mock_browser, _mock_load, _mock_set, _mock_set_key, _mock_user, _mock_teams):
    """Default `lab login` (no --api-key) uses the browser flow."""
    result = runner.invoke(app, ["login", "--server", "http://localhost:8338"])
    assert result.exit_code == 0
    assert "Login successful" in result.output
    _mock_browser.assert_called_once()
    # set_api_key gets the key produced by the browser flow.
    _mock_set_key.assert_called_once_with("tlab_browser")


@patch("transformerlab_cli.commands.login.load_config", return_value={"server": "http://localhost:8338"})
@patch(
    "transformerlab_cli.commands.login.run_browser_login",
    side_effect=__import__("transformerlab_cli.util.browser_login", fromlist=["BrowserLoginError"]).BrowserLoginError(
        "Login timed out waiting for browser callback."
    ),
)
def test_login_browser_flow_timeout(_mock_browser, _mock_load):
    """Browser timeout exits 1 with a helpful tip."""
    result = runner.invoke(app, ["login", "--server", "http://localhost:8338"])
    assert result.exit_code == 1
    assert "timed out" in result.output.lower()
    assert "--api-key" in result.output


@patch(
    "transformerlab_cli.commands.login.fetch_user_teams",
    return_value={"teams": [{"id": "t1", "name": "team1", "role": "OWNER"}]},
)
@patch("transformerlab_cli.commands.login.fetch_user_info", return_value={"email": "u@example.com", "id": 1})
@patch("transformerlab_cli.commands.login.set_api_key", return_value=True)
@patch("transformerlab_cli.commands.login.set_config")
@patch("transformerlab_cli.commands.login.load_config", return_value={"server": "http://localhost:8338"})
@patch(
    "transformerlab_cli.commands.login.run_browser_login",
    return_value={"api_key": "tlab_x", "team_id": "t1", "team_name": "team1"},
)
def test_login_no_browser_flag_passed_through(
    mock_browser, _mock_load, _mock_set, _mock_set_key, _mock_user, _mock_teams
):
    """`--no-browser` is forwarded to run_browser_login as open_browser=False."""
    result = runner.invoke(app, ["login", "--server", "http://localhost:8338", "--no-browser"])
    assert result.exit_code == 0
    _, kwargs = mock_browser.call_args
    assert kwargs.get("open_browser") is False
