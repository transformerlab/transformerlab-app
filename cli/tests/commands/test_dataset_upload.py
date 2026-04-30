from pathlib import Path
from unittest.mock import MagicMock, patch

from typer.testing import CliRunner

from transformerlab_cli.main import app

runner = CliRunner()


def _ok(data=None, status=200):
    m = MagicMock()
    m.status_code = status
    m.json.return_value = data if data is not None else {}
    m.text = "ok"
    return m


@patch("transformerlab_cli.commands.dataset.check_configs")
@patch("transformerlab_cli.commands.dataset.api.post_json")
@patch("transformerlab_cli.commands.dataset.chunked_upload.upload_one_file")
def test_dataset_upload_directory(upload_one_file, post_json, _check_configs, tmp_path: Path):
    upload_one_file.return_value = "uid"
    post_json.return_value = _ok({"status": "success"})
    d = tmp_path / "data"
    d.mkdir()
    (d / "train.jsonl").write_text("{}\n")
    (d / "eval.jsonl").write_text("{}\n")

    result = runner.invoke(app, ["dataset", "upload", "ds1", str(d)])
    assert result.exit_code == 0, result.output
    fileupload_calls = [c for c in post_json.call_args_list if "/data/fileupload" in c.args[0]]
    assert len(fileupload_calls) == 2


@patch("transformerlab_cli.commands.dataset.check_configs")
@patch("transformerlab_cli.commands.dataset.api.post_json")
@patch("transformerlab_cli.commands.dataset.chunked_upload.upload_one_file")
def test_dataset_upload_single_file(upload_one_file, post_json, _check_configs, tmp_path: Path):
    upload_one_file.return_value = "uid"
    post_json.return_value = _ok({"status": "success"})
    f = tmp_path / "train.jsonl"
    f.write_text("{}\n")
    result = runner.invoke(app, ["dataset", "upload", "ds1", str(f)])
    assert result.exit_code == 0, result.output
    fileupload = next(c for c in post_json.call_args_list if "/data/fileupload" in c.args[0])
    assert "relpath=train.jsonl" in fileupload.args[0]
