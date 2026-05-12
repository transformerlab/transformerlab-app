"""Tests for experiment commands."""

from unittest.mock import patch, MagicMock

from typer.testing import CliRunner
from transformerlab_cli.main import app

runner = CliRunner()

SAMPLE_EXPERIMENTS = [
    {"id": "alpha", "name": "alpha"},
    {"id": "beta", "name": "beta"},
]


def _mock_response(status_code: int = 200, json_data=None):
    mock = MagicMock()
    mock.status_code = status_code
    mock.json.return_value = json_data if json_data is not None else {}
    mock.text = ""
    return mock


def test_experiment_help():
    result = runner.invoke(app, ["experiment", "--help"])
    assert result.exit_code == 0
    assert "Experiment management commands" in result.output


@patch("transformerlab_cli.commands.experiment.get_config", return_value="alpha")
@patch("transformerlab_cli.commands.experiment.api.get", return_value=_mock_response(200, SAMPLE_EXPERIMENTS))
@patch("transformerlab_cli.commands.experiment.check_configs")
def test_experiment_list_marks_default(_mock_check, _mock_api, _mock_get_config):
    result = runner.invoke(app, ["experiment", "list"])
    assert result.exit_code == 0
    assert "alpha" in result.output
    assert "beta" in result.output
    assert "*" in result.output


@patch("transformerlab_cli.commands.experiment.set_config")
@patch("transformerlab_cli.commands.experiment.api.get", return_value=_mock_response(200, "my-exp"))
@patch("transformerlab_cli.commands.experiment.check_configs")
def test_experiment_create(_mock_check, mock_api, mock_set_config):
    result = runner.invoke(app, ["experiment", "create", "my-exp"])
    assert result.exit_code == 0
    assert "my-exp" in result.output
    mock_api.assert_called_once()
    assert "name=my-exp" in mock_api.call_args[0][0]
    mock_set_config.assert_not_called()


@patch("transformerlab_cli.commands.experiment.set_config")
@patch("transformerlab_cli.commands.experiment.api.get", return_value=_mock_response(200, "my-exp"))
@patch("transformerlab_cli.commands.experiment.check_configs")
def test_experiment_create_with_set_default(_mock_check, _mock_api, mock_set_config):
    result = runner.invoke(app, ["experiment", "create", "my-exp", "--set-default"])
    assert result.exit_code == 0
    mock_set_config.assert_called_once_with("current_experiment", "my-exp", "pretty")


@patch("transformerlab_cli.commands.experiment.get_config", return_value="other")
@patch(
    "transformerlab_cli.commands.experiment.api.get",
    return_value=_mock_response(200, {"message": "Experiment beta deleted"}),
)
@patch("transformerlab_cli.commands.experiment.check_configs")
def test_experiment_delete(_mock_check, _mock_api, _mock_get_config):
    result = runner.invoke(app, ["experiment", "delete", "beta", "--no-interactive"])
    assert result.exit_code == 0
    assert "deleted" in result.output.lower()


@patch("transformerlab_cli.commands.experiment.get_config", return_value="beta")
@patch(
    "transformerlab_cli.commands.experiment.api.get",
    return_value=_mock_response(200, {"message": "Experiment beta deleted"}),
)
@patch("transformerlab_cli.commands.experiment.check_configs")
def test_experiment_delete_current_warns(_mock_check, _mock_api, _mock_get_config):
    result = runner.invoke(app, ["experiment", "delete", "beta", "--no-interactive"])
    assert result.exit_code == 0
    assert "default experiment" in result.output


@patch("transformerlab_cli.commands.experiment.set_config")
@patch("transformerlab_cli.commands.experiment.check_configs")
def test_experiment_set_default(_mock_check, mock_set_config):
    result = runner.invoke(app, ["experiment", "set-default", "beta"])
    assert result.exit_code == 0
    mock_set_config.assert_called_once_with("current_experiment", "beta", "pretty")


SAMPLE_EXPERIMENTS_WITH_TAGS = [
    {"id": "alpha", "name": "alpha", "config": {"tags": ["foo", "bar"]}},
    {"id": "beta", "name": "beta", "config": {"tags": ["bar"]}},
    {"id": "gamma", "name": "gamma", "config": {"tags": []}},
    {"id": "delta", "name": "delta", "config": {}},
]


@patch("transformerlab_cli.commands.experiment.get_config", return_value="alpha")
@patch(
    "transformerlab_cli.commands.experiment.api.get",
    return_value=_mock_response(200, SAMPLE_EXPERIMENTS_WITH_TAGS),
)
@patch("transformerlab_cli.commands.experiment.check_configs")
def test_experiment_list_shows_tags_column(_check, _api, _cfg):
    result = runner.invoke(app, ["experiment", "list"])
    assert result.exit_code == 0
    assert "foo" in result.output
    assert "bar" in result.output


@patch("transformerlab_cli.commands.experiment.get_config", return_value="alpha")
@patch(
    "transformerlab_cli.commands.experiment.api.get",
    return_value=_mock_response(200, SAMPLE_EXPERIMENTS_WITH_TAGS),
)
@patch("transformerlab_cli.commands.experiment.check_configs")
def test_experiment_list_filters_by_single_tag(_check, _api, _cfg):
    result = runner.invoke(app, ["experiment", "list", "--tag", "bar"])
    assert result.exit_code == 0
    assert "alpha" in result.output
    assert "beta" in result.output
    assert "gamma" not in result.output
    assert "delta" not in result.output


@patch("transformerlab_cli.commands.experiment.get_config", return_value="alpha")
@patch(
    "transformerlab_cli.commands.experiment.api.get",
    return_value=_mock_response(200, SAMPLE_EXPERIMENTS_WITH_TAGS),
)
@patch("transformerlab_cli.commands.experiment.check_configs")
def test_experiment_list_multi_tag_is_AND(_check, _api, _cfg):
    result = runner.invoke(app, ["experiment", "list", "--tag", "foo", "--tag", "bar"])
    assert result.exit_code == 0
    assert "alpha" in result.output
    # beta only has 'bar', not 'foo' — must be excluded
    assert "beta" not in result.output


@patch("transformerlab_cli.commands.experiment.get_config", return_value="alpha")
@patch(
    "transformerlab_cli.commands.experiment.api.get",
    return_value=_mock_response(200, SAMPLE_EXPERIMENTS_WITH_TAGS),
)
@patch("transformerlab_cli.commands.experiment.check_configs")
def test_experiment_list_no_match_prints_message(_check, _api, _cfg):
    result = runner.invoke(app, ["experiment", "list", "--tag", "nothing"])
    assert result.exit_code == 0
    assert "No experiments match tag(s)" in result.output


@patch(
    "transformerlab_cli.commands.experiment.api.post_json",
    return_value=_mock_response(200, {"tags": ["foo", "bar"]}),
)
@patch("transformerlab_cli.commands.experiment.check_configs")
def test_experiment_tag_add(_check, mock_post):
    result = runner.invoke(app, ["experiment", "tag", "add", "alpha", "foo", "bar"])
    assert result.exit_code == 0
    assert "foo" in result.output
    assert "bar" in result.output
    mock_post.assert_called_once()
    url, payload = mock_post.call_args[0][0], mock_post.call_args[0][1]
    assert url == "/experiment/alpha/tags/add"
    assert payload == {"tags": ["foo", "bar"]}


@patch(
    "transformerlab_cli.commands.experiment.api.post_json",
    return_value=_mock_response(200, {"tags": ["bar"]}),
)
@patch("transformerlab_cli.commands.experiment.check_configs")
def test_experiment_tag_remove(_check, mock_post):
    result = runner.invoke(app, ["experiment", "tag", "remove", "alpha", "foo"])
    assert result.exit_code == 0
    assert "bar" in result.output
    url, payload = mock_post.call_args[0][0], mock_post.call_args[0][1]
    assert url == "/experiment/alpha/tags/remove"
    assert payload == {"tags": ["foo"]}


@patch(
    "transformerlab_cli.commands.experiment.api.post_json",
    return_value=_mock_response(422, {"detail": "Tag 'bad!' contains invalid characters"}),
)
@patch("transformerlab_cli.commands.experiment.check_configs")
def test_experiment_tag_add_surfaces_server_error(_check, _mock_post):
    result = runner.invoke(app, ["experiment", "tag", "add", "alpha", "bad!"])
    assert result.exit_code == 1
    assert "invalid characters" in result.output


@patch(
    "transformerlab_cli.commands.experiment.api.get",
    return_value=_mock_response(200, {"tags": ["alpha", "bar", "foo"]}),
)
@patch("transformerlab_cli.commands.experiment.check_configs")
def test_experiment_tags_lists_all(_check, _api):
    result = runner.invoke(app, ["experiment", "tags"])
    assert result.exit_code == 0
    assert "alpha" in result.output
    assert "bar" in result.output
    assert "foo" in result.output


@patch(
    "transformerlab_cli.commands.experiment.api.get",
    return_value=_mock_response(200, {"tags": []}),
)
@patch("transformerlab_cli.commands.experiment.check_configs")
def test_experiment_tags_empty(_check, _api):
    result = runner.invoke(app, ["experiment", "tags"])
    assert result.exit_code == 0
    assert "No tags" in result.output
