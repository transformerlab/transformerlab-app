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


@patch("transformerlab_cli.commands.model.check_configs")
@patch("transformerlab_cli.commands.model.chunked_download.download_one_file")
@patch("transformerlab_cli.commands.model.api.get")
def test_model_download_writes_files(api_get, download_one_file, _check_configs, tmp_path: Path):
    api_get.return_value = _ok(
        [
            {"relpath": "config.json", "size": 7},
            {"relpath": "sub/weights.bin", "size": 64},
        ]
    )

    result = runner.invoke(app, ["model", "download", "m1", str(tmp_path)])
    assert result.exit_code == 0, result.output

    targets = [call.kwargs["target_path"] for call in download_one_file.call_args_list]
    assert os.path.join(str(tmp_path), "m1", "config.json") in targets
    assert os.path.join(str(tmp_path), "m1", "sub", "weights.bin") in targets


@patch("transformerlab_cli.commands.model.check_configs")
@patch("transformerlab_cli.commands.model.api.get")
def test_model_download_missing_model(api_get, _check_configs, tmp_path: Path):
    api_get.return_value = _ok({"detail": "model x not found"}, status=404)
    result = runner.invoke(app, ["model", "download", "x", str(tmp_path)])
    assert result.exit_code != 0
