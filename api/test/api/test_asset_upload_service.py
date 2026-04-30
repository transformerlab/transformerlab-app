import os
import shutil
import pytest

from transformerlab.services import asset_upload_service


@pytest.fixture
def asset_dir(tmp_path):
    d = tmp_path / "asset"
    d.mkdir()
    yield str(d)
    shutil.rmtree(str(d), ignore_errors=True)


@pytest.fixture
def staged_file(tmp_path):
    f = tmp_path / "staged"
    f.write_bytes(b"hello")
    return str(f)


@pytest.mark.asyncio
async def test_accept_writes_into_relpath(asset_dir, staged_file):
    await asset_upload_service.accept_uploaded_file(
        asset_dir=asset_dir,
        assembled_path=staged_file,
        relpath="config.json",
        force=False,
    )
    assert open(os.path.join(asset_dir, "config.json"), "rb").read() == b"hello"


@pytest.mark.asyncio
async def test_accept_writes_into_subdir_relpath(asset_dir, staged_file):
    await asset_upload_service.accept_uploaded_file(
        asset_dir=asset_dir,
        assembled_path=staged_file,
        relpath="sub/dir/weights.bin",
        force=False,
    )
    assert os.path.isfile(os.path.join(asset_dir, "sub", "dir", "weights.bin"))


@pytest.mark.asyncio
async def test_accept_conflict_without_force_raises(asset_dir, staged_file):
    target = os.path.join(asset_dir, "config.json")
    open(target, "wb").write(b"existing")
    with pytest.raises(asset_upload_service.RelpathConflictError):
        await asset_upload_service.accept_uploaded_file(
            asset_dir=asset_dir,
            assembled_path=staged_file,
            relpath="config.json",
            force=False,
        )
    assert open(target, "rb").read() == b"existing"


@pytest.mark.asyncio
async def test_accept_force_overwrites(asset_dir, staged_file):
    target = os.path.join(asset_dir, "config.json")
    open(target, "wb").write(b"existing")
    await asset_upload_service.accept_uploaded_file(
        asset_dir=asset_dir,
        assembled_path=staged_file,
        relpath="config.json",
        force=True,
    )
    assert open(target, "rb").read() == b"hello"


@pytest.mark.asyncio
@pytest.mark.parametrize("bad", ["../escape", "/etc/passwd", "sub/../../escape", ""])
async def test_accept_rejects_bad_relpath(asset_dir, staged_file, bad):
    with pytest.raises(asset_upload_service.InvalidRelpathError):
        await asset_upload_service.accept_uploaded_file(
            asset_dir=asset_dir,
            assembled_path=staged_file,
            relpath=bad,
            force=False,
        )
