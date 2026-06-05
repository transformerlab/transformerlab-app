import json
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


# ── show --share ──────────────────────────────────────────────────────────────


SHARE_LINK = {
    "token": "tok123",
    "url": "https://lab.cloud/#/public/share/tok123",
    "created_at": "2026-06-04T00:00:00",
}


def _mock_json_resp(payload, status: int = 200):
    m = MagicMock()
    m.status_code = status
    m.json.return_value = payload
    m.text = ""
    return m


@patch("transformerlab_cli.util.share.api.post_json", return_value=_mock_json_resp(SHARE_LINK))
@patch("transformerlab_cli.util.share.api.get", return_value=_mock_json_resp(None))
@patch("transformerlab_cli.util.config.require_current_experiment", return_value="exp1")
def test_notes_show_share_mints_link(_mock_exp, mock_get, mock_post):
    result = runner.invoke(app, ["--no-interactive", "notes", "show", "--share"])
    assert result.exit_code == 0
    assert SHARE_LINK["url"] in strip_ansi(result.output)
    assert mock_get.call_args[0][0] == "/experiment/exp1/share/notes"
    assert mock_post.call_args[0][0] == "/experiment/exp1/share/notes"


@patch("transformerlab_cli.util.share.api.post_json", return_value=_mock_json_resp(SHARE_LINK))
@patch("transformerlab_cli.util.share.api.get", return_value=_mock_json_resp(None))
@patch("transformerlab_cli.util.config.require_current_experiment", return_value="exp1")
def test_notes_show_share_prompts_before_minting(_mock_exp, _mock_get, mock_post):
    """Minting a new public link asks for confirmation; declining aborts without minting."""
    result = runner.invoke(app, ["notes", "show", "--share"], input="n\n")
    assert result.exit_code == 1
    mock_post.assert_not_called()


@patch("transformerlab_cli.util.share.api.post_json", return_value=_mock_json_resp(SHARE_LINK))
@patch("transformerlab_cli.util.share.api.get", return_value=_mock_json_resp(None))
@patch("transformerlab_cli.util.config.require_current_experiment", return_value="exp1")
def test_notes_show_share_json_format(_mock_exp, _mock_get, _mock_post):
    """`--format json` emits the link as JSON and never prompts (json implies --no-interactive)."""
    result = runner.invoke(app, ["--format", "json", "notes", "show", "--share"])
    assert result.exit_code == 0
    payload = json.loads(result.output)
    assert payload == SHARE_LINK


@patch("transformerlab_cli.util.share.api.post_json")
@patch("transformerlab_cli.util.share.api.get", return_value=_mock_json_resp(SHARE_LINK))
@patch("transformerlab_cli.util.config.require_current_experiment", return_value="exp1")
def test_notes_show_share_reuses_existing_link(_mock_exp, _mock_get, mock_post):
    result = runner.invoke(app, ["notes", "show", "--share"])
    assert result.exit_code == 0
    assert SHARE_LINK["url"] in strip_ansi(result.output)
    mock_post.assert_not_called()


@patch("transformerlab_cli.util.share.api.get", return_value=_mock_json_resp({"detail": "boom"}, status=500))
@patch("transformerlab_cli.util.config.require_current_experiment", return_value="exp1")
def test_notes_show_share_api_error(_mock_exp, _mock_get):
    result = runner.invoke(app, ["notes", "show", "--share"])
    assert result.exit_code != 0
    assert "boom" in strip_ansi(result.output)


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
