import os
from pathlib import Path

import pytest


@pytest.fixture()
def tmp_dataset_dir(tmp_path: Path) -> str:
    # Create a temporary dataset directory with various files
    tmp_path_str = str(tmp_path)
    with open(os.path.join(tmp_path_str, "a.jsonl"), "w", encoding="utf-8") as f:
        f.write('{"text": "a"}\n')
    with open(os.path.join(tmp_path_str, "b.txt"), "w", encoding="utf-8") as f:
        f.write("hello\n")
    with open(os.path.join(tmp_path_str, "index.json"), "w", encoding="utf-8") as f:
        f.write('{"index": true}\n')
    with open(os.path.join(tmp_path_str, ".DS_Store"), "w", encoding="utf-8") as f:
        f.write("ignored")
    os.makedirs(os.path.join(tmp_path_str, "subdir"), exist_ok=True)
    with open(os.path.join(tmp_path_str, "subdir", "nested.jsonl"), "w", encoding="utf-8") as f:
        f.write('{"text": "nested"}\n')
    return tmp_path_str


@pytest.mark.asyncio
async def test_load_local_dataset_filters_index_and_hidden(tmp_dataset_dir, monkeypatch):
    # Import inside test to ensure module path resolution for monkeypatching
    from transformerlab.services import dataset_service

    captured = {}

    def fake_load_dataset(path=None, data_files=None, streaming=False):
        captured["path"] = path
        captured["data_files"] = list(data_files) if data_files is not None else None
        captured["streaming"] = streaming
        return {"ok": True}

    monkeypatch.setattr(dataset_service, "load_dataset", fake_load_dataset)

    result = await dataset_service.load_local_dataset(tmp_dataset_dir)

    assert result == {"ok": True}
    assert captured["path"] == tmp_dataset_dir
    # Should only include top-level regular files except index.json and hidden files
    expected = {
        os.path.join(tmp_dataset_dir, "a.jsonl"),
        os.path.join(tmp_dataset_dir, "b.txt"),
    }
    assert set(captured["data_files"]) == expected
    assert captured["streaming"] is False


@pytest.mark.asyncio
async def test_load_local_dataset_uses_explicit_data_files(tmp_path, monkeypatch):
    from transformerlab.services import dataset_service

    # Explicit files provided (note: function should not re-filter these)
    tmp_path_str = str(tmp_path)
    with open(os.path.join(tmp_path_str, "keep.me"), "w", encoding="utf-8") as f:
        f.write("1\n")
    with open(os.path.join(tmp_path_str, "index.json"), "w", encoding="utf-8") as f:
        f.write('{"index": true}\n')

    captured = {}

    def fake_load_dataset(path=None, data_files=None, streaming=False):
        captured["path"] = path
        captured["data_files"] = list(data_files) if data_files is not None else None
        captured["streaming"] = streaming
        return {"ok": True}

    monkeypatch.setattr(dataset_service, "load_dataset", fake_load_dataset)

    result = await dataset_service.load_local_dataset(
        tmp_path_str, data_files=["keep.me", "index.json"], streaming=True
    )

    assert result == {"ok": True}
    assert captured["path"] == tmp_path_str
    # Paths should be joined as provided without additional filtering
    assert captured["data_files"] == [
        os.path.join(tmp_path_str, "keep.me"),
        os.path.join(tmp_path_str, "index.json"),
    ]
    assert captured["streaming"] is True


@pytest.mark.asyncio
async def test_load_local_dataset_fallback_when_no_valid_files(tmp_path, monkeypatch):
    from transformerlab.services import dataset_service

    # Only metadata/hidden files present
    tmp_path_str = str(tmp_path)
    with open(os.path.join(tmp_path_str, "index.json"), "w", encoding="utf-8") as f:
        f.write('{"index": true}\n')
    with open(os.path.join(tmp_path_str, ".hidden"), "w", encoding="utf-8") as f:
        f.write("ignored\n")

    captured = {}

    def fake_load_dataset(path=None, data_files=None, streaming=False):
        captured["path"] = path
        captured["data_files"] = data_files
        captured["streaming"] = streaming
        return {"ok": True}

    monkeypatch.setattr(dataset_service, "load_dataset", fake_load_dataset)

    result = await dataset_service.load_local_dataset(tmp_path_str)

    assert result == {"ok": True}
    assert captured["path"] == tmp_path_str
    # When no valid files, function should call underlying loader without data_files
    assert captured["data_files"] in (None, [])
    assert captured["streaming"] is False
