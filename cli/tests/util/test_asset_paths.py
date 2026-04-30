from pathlib import Path

import pytest

from transformerlab_cli.util.asset_paths import (
    InvalidRelpathError,
    sanitize_relpath,
    walk_inputs,
)


def test_walk_inputs_single_file(tmp_path: Path):
    f = tmp_path / "model.gguf"
    f.write_bytes(b"x")
    pairs = list(walk_inputs([str(f)]))
    assert pairs == [(str(f), "model.gguf")]


def test_walk_inputs_directory_preserves_relpath(tmp_path: Path):
    (tmp_path / "sub").mkdir()
    (tmp_path / "config.json").write_text("{}")
    (tmp_path / "sub" / "weights.bin").write_bytes(b"x")
    pairs = sorted(walk_inputs([str(tmp_path)]))
    assert pairs == [
        (str(tmp_path / "config.json"), "config.json"),
        (str(tmp_path / "sub" / "weights.bin"), "sub/weights.bin"),
    ]


def test_walk_inputs_skips_hidden(tmp_path: Path):
    (tmp_path / ".DS_Store").write_text("x")
    (tmp_path / ".git").mkdir()
    (tmp_path / ".git" / "HEAD").write_text("x")
    (tmp_path / "config.json").write_text("{}")
    pairs = list(walk_inputs([str(tmp_path)]))
    assert pairs == [(str(tmp_path / "config.json"), "config.json")]


def test_walk_inputs_skips_symlinks(tmp_path: Path):
    target = tmp_path / "real.txt"
    target.write_text("x")
    link = tmp_path / "link.txt"
    link.symlink_to(target)
    pairs = sorted(walk_inputs([str(target), str(link)]))
    # Symlinks are skipped; real file kept.
    assert pairs == [(str(target), "real.txt")]


def test_walk_inputs_missing_path_raises(tmp_path: Path):
    with pytest.raises(FileNotFoundError):
        list(walk_inputs([str(tmp_path / "nope")]))


def test_walk_inputs_mixed_args(tmp_path: Path):
    d = tmp_path / "dir"
    d.mkdir()
    (d / "a.txt").write_text("x")
    f = tmp_path / "extra.json"
    f.write_text("{}")
    pairs = sorted(walk_inputs([str(d), str(f)]))
    assert pairs == [
        (str(d / "a.txt"), "a.txt"),
        (str(f), "extra.json"),
    ]


def test_sanitize_relpath_accepts_simple():
    assert sanitize_relpath("config.json") == "config.json"
    assert sanitize_relpath("sub/weights.bin") == "sub/weights.bin"


def test_sanitize_relpath_normalises_backslashes():
    assert sanitize_relpath("sub\\weights.bin") == "sub/weights.bin"


@pytest.mark.parametrize(
    "bad",
    [
        "../etc/passwd",
        "/etc/passwd",
        "sub/../../escape",
        "",
        "sub/",
        "\x00.txt",
        ".",
        "a/./b",
    ],
)
def test_sanitize_relpath_rejects(bad):
    with pytest.raises(InvalidRelpathError):
        sanitize_relpath(bad)
