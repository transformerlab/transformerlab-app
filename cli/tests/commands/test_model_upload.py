from pathlib import Path
from unittest.mock import MagicMock, patch

from typer.testing import CliRunner

from transformerlab_cli.main import app

runner = CliRunner()


def _ok(data=None, status=200):
    m = MagicMock()
    m.status_code = status
    m.json.return_value = data or {}
    m.text = "ok"
    return m


@patch("transformerlab_cli.commands.model.check_configs")
@patch("transformerlab_cli.commands.model.api.post_json")
@patch("transformerlab_cli.commands.model.chunked_upload.upload_one_file")
def test_model_upload_single_file(upload_one_file, post_json, _check, tmp_path: Path):
    upload_one_file.return_value = "uid-1"
    post_json.return_value = _ok({"status": "success"})
    f = tmp_path / "config.json"
    f.write_text("{}")

    result = runner.invoke(app, ["model", "upload", "my-model", str(f)])
    assert result.exit_code == 0, result.output
    upload_one_file.assert_called_once()
    paths = [call.args[0] for call in post_json.call_args_list]
    assert any("/model/fileupload" in p and "model_id=my-model" in p and "relpath=config.json" in p for p in paths)
    assert any("/model/finalize?model_id=my-model" in p for p in paths)


@patch("transformerlab_cli.commands.model.check_configs")
@patch("transformerlab_cli.commands.model.api.post_json")
@patch("transformerlab_cli.commands.model.chunked_upload.upload_one_file")
def test_model_upload_directory_walks_files(upload_one_file, post_json, _check, tmp_path: Path):
    upload_one_file.return_value = "uid"
    post_json.return_value = _ok({"status": "success"})
    d = tmp_path / "model"
    d.mkdir()
    (d / "config.json").write_text("{}")
    (d / "sub").mkdir()
    (d / "sub" / "weights.bin").write_bytes(b"x")

    result = runner.invoke(app, ["model", "upload", "my-model", str(d)])
    assert result.exit_code == 0, result.output
    fileuploads = [c for c in post_json.call_args_list if "/model/fileupload" in c.args[0]]
    assert len(fileuploads) == 2
    relpaths = [c.args[0].split("relpath=")[1].split("&")[0] for c in fileuploads]
    assert "config.json" in relpaths
    assert "sub/weights.bin" in relpaths


@patch("transformerlab_cli.commands.model.check_configs")
@patch("transformerlab_cli.commands.model.api.post_json")
@patch("transformerlab_cli.commands.model.chunked_upload.upload_one_file")
def test_model_upload_force_passed_through(upload_one_file, post_json, _check, tmp_path: Path):
    upload_one_file.return_value = "uid"
    post_json.return_value = _ok({"status": "success"})
    f = tmp_path / "config.json"
    f.write_text("{}")
    result = runner.invoke(app, ["model", "upload", "m", str(f), "--force"])
    assert result.exit_code == 0, result.output
    fileupload = next(c for c in post_json.call_args_list if "/model/fileupload" in c.args[0])
    assert "force=true" in fileupload.args[0]


@patch("transformerlab_cli.commands.model.check_configs")
@patch("transformerlab_cli.commands.model.api.post_json")
@patch("transformerlab_cli.commands.model.chunked_upload.upload_one_file")
def test_model_upload_conflict_warns_and_continues(upload_one_file, post_json, _check, tmp_path: Path):
    upload_one_file.return_value = "uid"
    # First file conflicts, second succeeds. Finalize is skipped because conflict counts as skipped not failed.
    # The CLI should exit 2 (skipped) since some files were not uploaded.
    post_json.side_effect = [
        _ok({"detail": "exists"}, status=409),
        _ok({"status": "success"}),
        _ok({"status": "success", "architecture": "X"}),
    ]
    d = tmp_path / "model"
    d.mkdir()
    (d / "config.json").write_text("{}")
    (d / "weights.bin").write_bytes(b"x")
    result = runner.invoke(app, ["model", "upload", "m", str(d)])
    # Conflict means non-zero exit.
    assert result.exit_code != 0
    assert (
        "skipped" in result.output.lower() or "conflict" in result.output.lower() or "exists" in result.output.lower()
    )
