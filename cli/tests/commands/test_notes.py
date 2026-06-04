from unittest.mock import MagicMock, patch

from typer.testing import CliRunner

from tests.helpers import strip_ansi
from transformerlab_cli.main import app

runner = CliRunner()


def _mock_resp(text: str = "", status: int = 200):
    m = MagicMock()
    m.status_code = status
    m.text = f'"{text}"'  # FastAPI JSON-encodes plain string returns
    m.json.return_value = text  # what response.json() returns
    return m


# ── show ──────────────────────────────────────────────────────────────────────


@patch("transformerlab_cli.commands.notes.api.get", return_value=_mock_resp("# My Notes\n\nHello"))
@patch("transformerlab_cli.util.config.require_current_experiment", return_value="exp1")
def test_notes_show_renders_output(_mock_exp, _mock_api):
    result = runner.invoke(app, ["notes", "show"])
    assert result.exit_code == 0
    out = strip_ansi(result.output)
    assert "My Notes" in out


@patch("transformerlab_cli.commands.notes.api.get", return_value=_mock_resp("# My Notes"))
@patch("transformerlab_cli.util.config.require_current_experiment", return_value="exp1")
def test_notes_show_raw_flag(_mock_exp, _mock_api):
    result = runner.invoke(app, ["notes", "show", "--raw"])
    assert result.exit_code == 0
    assert "# My Notes" in result.output


@patch("transformerlab_cli.commands.notes.api.get", return_value=_mock_resp("", status=500))
@patch("transformerlab_cli.util.config.require_current_experiment", return_value="exp1")
def test_notes_show_api_error(_mock_exp, _mock_api):
    result = runner.invoke(app, ["notes", "show"])
    assert result.exit_code != 0


# ── append ────────────────────────────────────────────────────────────────────


@patch("transformerlab_cli.commands.notes.api.post_json", return_value=_mock_resp('{"message": "OK"}'))
@patch("transformerlab_cli.commands.notes.api.get", return_value=_mock_resp("existing content"))
@patch("transformerlab_cli.util.config.require_current_experiment", return_value="exp1")
def test_notes_append_adds_text(_mock_exp, _mock_get, mock_post):
    result = runner.invoke(app, ["notes", "append", "new line"])
    assert result.exit_code == 0
    posted_body = mock_post.call_args[0][1]
    assert "existing content" in posted_body
    assert "new line" in posted_body


@patch("transformerlab_cli.commands.notes.api.post_json", return_value=_mock_resp('{"message": "OK"}'))
@patch("transformerlab_cli.commands.notes.api.get", return_value=_mock_resp(""))
@patch("transformerlab_cli.util.config.require_current_experiment", return_value="exp1")
def test_notes_append_to_empty(_mock_exp, _mock_get, mock_post):
    result = runner.invoke(app, ["notes", "append", "first line"])
    assert result.exit_code == 0
    posted_body = mock_post.call_args[0][1]
    assert "first line" in posted_body


@patch("transformerlab_cli.commands.notes.api.get", return_value=_mock_resp("", status=500))
@patch("transformerlab_cli.util.config.require_current_experiment", return_value="exp1")
def test_notes_append_get_error(_mock_exp, _mock_api):
    result = runner.invoke(app, ["notes", "append", "text"])
    assert result.exit_code != 0


# ── edit ──────────────────────────────────────────────────────────────────────


@patch("transformerlab_cli.commands.notes.subprocess.run", return_value=MagicMock(returncode=1))
@patch("transformerlab_cli.commands.notes.api.get", return_value=_mock_resp("# notes"))
@patch("transformerlab_cli.util.config.require_current_experiment", return_value="exp1")
def test_notes_edit_nonzero_editor_exit(_mock_exp, _mock_get, _mock_run):
    result = runner.invoke(app, ["notes", "edit"])
    assert result.exit_code != 0
