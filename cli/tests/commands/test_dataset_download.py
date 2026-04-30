import os
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
@patch("transformerlab_cli.commands.dataset.chunked_download.download_one_file")
@patch("transformerlab_cli.commands.dataset.api.get")
def test_dataset_download_writes_files(api_get, download_one_file, _check_configs, tmp_path: Path):
    api_get.return_value = _ok(
        [
            {"relpath": "train.jsonl", "size": 12},
            {"relpath": "eval.jsonl", "size": 6},
        ]
    )

    result = runner.invoke(app, ["dataset", "download", "ds1", str(tmp_path)])
    assert result.exit_code == 0, result.output

    targets = [call.kwargs["target_path"] for call in download_one_file.call_args_list]
    assert os.path.join(str(tmp_path), "ds1", "train.jsonl") in targets
    assert os.path.join(str(tmp_path), "ds1", "eval.jsonl") in targets


@patch("transformerlab_cli.commands.dataset.check_configs")
@patch("transformerlab_cli.commands.dataset.api.get")
def test_dataset_download_missing(api_get, _check_configs, tmp_path: Path):
    api_get.return_value = _ok({"detail": "missing"}, status=404)
    result = runner.invoke(app, ["dataset", "download", "x", str(tmp_path)])
    assert result.exit_code != 0
