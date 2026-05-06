import asyncio
from unittest.mock import AsyncMock, MagicMock, patch


def _make_open_mock(content: str):
    """Return a mock async context manager that reads `content`."""
    mock_file = AsyncMock()
    mock_file.read = AsyncMock(return_value=content)
    mock_file.write = AsyncMock()
    cm = AsyncMock()
    cm.__aenter__ = AsyncMock(return_value=mock_file)
    cm.__aexit__ = AsyncMock(return_value=False)
    return cm, mock_file


def test_read_notes_returns_new_path_when_exists():
    """read_notes returns notes/readme.md content when it exists."""

    async def _run():
        from transformerlab.routers.experiment.notes import read_notes

        open_cm, mock_file = _make_open_mock("# my notes")
        with (
            patch("transformerlab.routers.experiment.notes.Experiment") as mock_exp_cls,
            patch("transformerlab.routers.experiment.notes.storage") as mock_storage,
        ):
            mock_exp = MagicMock()
            mock_exp.get_dir = AsyncMock(return_value="/experiments/exp1")
            mock_exp_cls.return_value = mock_exp
            mock_storage.join.side_effect = lambda *parts: "/".join(parts)
            mock_storage.open = AsyncMock(return_value=open_cm)
            result = await read_notes("exp1")
        assert result == "# my notes"
        mock_storage.open.assert_called_once_with("/experiments/exp1/notes/readme.md", "r", encoding="utf-8")

    asyncio.run(_run())


def test_read_notes_falls_back_to_legacy():
    """read_notes falls back to root readme.md when notes/readme.md is missing."""

    async def _run():
        from transformerlab.routers.experiment.notes import read_notes

        legacy_cm, mock_file = _make_open_mock("# legacy notes")
        call_count = 0

        async def open_side_effect(path, mode, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise FileNotFoundError
            return legacy_cm

        with (
            patch("transformerlab.routers.experiment.notes.Experiment") as mock_exp_cls,
            patch("transformerlab.routers.experiment.notes.storage") as mock_storage,
        ):
            mock_exp = MagicMock()
            mock_exp.get_dir = AsyncMock(return_value="/experiments/exp1")
            mock_exp_cls.return_value = mock_exp
            mock_storage.join.side_effect = lambda *parts: "/".join(parts)
            mock_storage.open.side_effect = open_side_effect
            result = await read_notes("exp1")
        assert result == "# legacy notes"

    asyncio.run(_run())


def test_read_notes_returns_empty_when_neither_exists():
    """read_notes returns empty string when both paths are missing."""

    async def _run():
        from transformerlab.routers.experiment.notes import read_notes

        async def open_always_raises(path, mode, **kwargs):
            raise FileNotFoundError

        with (
            patch("transformerlab.routers.experiment.notes.Experiment") as mock_exp_cls,
            patch("transformerlab.routers.experiment.notes.storage") as mock_storage,
        ):
            mock_exp = MagicMock()
            mock_exp.get_dir = AsyncMock(return_value="/experiments/exp1")
            mock_exp_cls.return_value = mock_exp
            mock_storage.join.side_effect = lambda *parts: "/".join(parts)
            mock_storage.open.side_effect = open_always_raises
            result = await read_notes("exp1")
        assert result == ""

    asyncio.run(_run())


def test_migrate_if_needed_moves_legacy_file():
    """migrate_if_needed copies readme.md → notes/readme.md and removes the original."""

    async def _run():
        from transformerlab.routers.experiment.notes import migrate_if_needed

        read_cm, _ = _make_open_mock("# old notes")
        write_cm, write_file = _make_open_mock("")

        open_calls = []

        async def open_side_effect(path, mode, **kwargs):
            open_calls.append((path, mode))
            if mode == "r":
                return read_cm
            return write_cm

        with (
            patch("transformerlab.routers.experiment.notes.Experiment") as mock_exp_cls,
            patch("transformerlab.routers.experiment.notes.storage") as mock_storage,
        ):
            mock_exp = MagicMock()
            mock_exp.get_dir = AsyncMock(return_value="/experiments/exp1")
            mock_exp_cls.return_value = mock_exp
            mock_storage.join.side_effect = lambda *parts: "/".join(parts)
            mock_storage.exists = AsyncMock(side_effect=[False, True])  # notes missing, legacy exists
            mock_storage.makedirs = AsyncMock()
            mock_storage.open.side_effect = open_side_effect
            mock_storage.rm = AsyncMock()
            await migrate_if_needed("exp1")
        mock_storage.makedirs.assert_called_once()
        write_file.write.assert_called_once_with("# old notes")
        mock_storage.rm.assert_called_once_with("/experiments/exp1/readme.md")

    asyncio.run(_run())


def test_migrate_if_needed_skips_when_notes_already_exist():
    """migrate_if_needed does nothing when notes/readme.md already exists."""

    async def _run():
        from transformerlab.routers.experiment.notes import migrate_if_needed

        with (
            patch("transformerlab.routers.experiment.notes.Experiment") as mock_exp_cls,
            patch("transformerlab.routers.experiment.notes.storage") as mock_storage,
        ):
            mock_exp = MagicMock()
            mock_exp.get_dir = AsyncMock(return_value="/experiments/exp1")
            mock_exp_cls.return_value = mock_exp
            mock_storage.join.side_effect = lambda *parts: "/".join(parts)
            mock_storage.exists = AsyncMock(return_value=True)  # notes already exists
            mock_storage.rm = AsyncMock()
            await migrate_if_needed("exp1")
        mock_storage.rm.assert_not_called()

    asyncio.run(_run())


def test_resolve_unique_asset_filename_returns_original_when_available():
    async def _run():
        from transformerlab.routers.experiment.notes import resolve_unique_asset_filename

        with patch("transformerlab.routers.experiment.notes.storage") as mock_storage:
            mock_storage.join.side_effect = lambda *parts: "/".join(parts)
            mock_storage.exists = AsyncMock(return_value=False)
            result = await resolve_unique_asset_filename("/experiments/exp1/notes/assets", "image.png")
        assert result == "image.png"

    asyncio.run(_run())


def test_resolve_unique_asset_filename_adds_incrementing_suffix_on_collision():
    async def _run():
        from transformerlab.routers.experiment.notes import resolve_unique_asset_filename

        # image.png exists, image-1.png exists, image-2.png is available.
        with patch("transformerlab.routers.experiment.notes.storage") as mock_storage:
            mock_storage.join.side_effect = lambda *parts: "/".join(parts)
            mock_storage.exists = AsyncMock(side_effect=[True, True, False])
            result = await resolve_unique_asset_filename("/experiments/exp1/notes/assets", "image.png")
        assert result == "image-2.png"

    asyncio.run(_run())
