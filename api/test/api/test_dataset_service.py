import os
from pathlib import Path

import pytest
import pytest_asyncio


@pytest.fixture()
def tmp_dataset_dir(tmp_path: Path) -> Path:
    # Create a temporary dataset directory with various files
    (tmp_path / "a.jsonl").write_text('{"text": "a"}\n')
    (tmp_path / "b.txt").write_text("hello\n")
    (tmp_path / "index.json").write_text('{"index": true}\n')
    (tmp_path / ".DS_Store").write_text("ignored")
    (tmp_path / "subdir").mkdir()
    (tmp_path / "subdir" / "nested.jsonl").write_text('{"text": "nested"}\n')
    return tmp_path


@pytest.mark.asyncio
async def test_load_local_dataset_filters_index_and_hidden(tmp_dataset_dir: Path, monkeypatch):
    # Import inside test to ensure module path resolution for monkeypatching
    from transformerlab.services import dataset_service

    captured = {}

    def fake_load_dataset(path=None, data_files=None, streaming=False):
        captured["path"] = path
        captured["data_files"] = list(data_files) if data_files is not None else None
        captured["streaming"] = streaming
        return {"ok": True}

    monkeypatch.setattr(dataset_service, "load_dataset", fake_load_dataset)

    result = await dataset_service.load_local_dataset(str(tmp_dataset_dir))

    assert result == {"ok": True}
    assert captured["path"] == str(tmp_dataset_dir)
    # Should only include top-level regular files except index.json and hidden files
    expected = {
        os.path.join(str(tmp_dataset_dir), "a.jsonl"),
        os.path.join(str(tmp_dataset_dir), "b.txt"),
    }
    assert set(captured["data_files"]) == expected
    assert captured["streaming"] is False


@pytest.mark.asyncio
async def test_load_local_dataset_uses_explicit_data_files(tmp_path: Path, monkeypatch):
    from transformerlab.services import dataset_service

    # Explicit files provided (note: function should not re-filter these)
    (tmp_path / "keep.me").write_text("1\n")
    (tmp_path / "index.json").write_text('{"index": true}\n')

    captured = {}

    def fake_load_dataset(path=None, data_files=None, streaming=False):
        captured["path"] = path
        captured["data_files"] = list(data_files) if data_files is not None else None
        captured["streaming"] = streaming
        return {"ok": True}

    monkeypatch.setattr(dataset_service, "load_dataset", fake_load_dataset)

    result = await dataset_service.load_local_dataset(str(tmp_path), data_files=["keep.me", "index.json"], streaming=True)

    assert result == {"ok": True}
    assert captured["path"] == str(tmp_path)
    # Paths should be joined as provided without additional filtering
    assert captured["data_files"] == [
        os.path.join(str(tmp_path), "keep.me"),
        os.path.join(str(tmp_path), "index.json"),
    ]
    assert captured["streaming"] is True


@pytest.mark.asyncio
async def test_load_local_dataset_fallback_when_no_valid_files(tmp_path: Path, monkeypatch):
    from transformerlab.services import dataset_service

    # Only metadata/hidden files present
    (tmp_path / "index.json").write_text('{"index": true}\n')
    (tmp_path / ".hidden").write_text("ignored\n")

    captured = {}

    def fake_load_dataset(path=None, data_files=None, streaming=False):
        captured["path"] = path
        captured["data_files"] = data_files
        captured["streaming"] = streaming
        return {"ok": True}

    monkeypatch.setattr(dataset_service, "load_dataset", fake_load_dataset)

    result = await dataset_service.load_local_dataset(str(tmp_path))

    assert result == {"ok": True}
    assert captured["path"] == str(tmp_path)
    # When no valid files, function should call underlying loader without data_files
    assert captured["data_files"] in (None, [])
    assert captured["streaming"] is False
