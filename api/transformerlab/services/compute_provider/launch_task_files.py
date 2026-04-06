"""Copy task assets into a job workspace directory."""

import logging

from lab import storage

logger = logging.getLogger(__name__)

_TASK_COPY_EXCLUDE = {"index.json"}


async def copy_task_files_to_dir(task_src: str, dest_dir: str) -> None:
    """Copy task files from task_src into dest_dir, excluding internal metadata."""
    try:
        await storage.makedirs(dest_dir, exist_ok=True)
        entries = await storage.ls(task_src, detail=False)
    except Exception:
        logger.warning("Failed to prepare task file copy from %s to %s, skipping", task_src, dest_dir, exc_info=True)
        return
    for entry in entries:
        name = entry.rstrip("/").rsplit("/", 1)[-1]
        if name in _TASK_COPY_EXCLUDE:
            continue
        dest_path = storage.join(dest_dir, name)
        try:
            if await storage.isdir(entry):
                await storage.copy_dir(entry, dest_path)
            else:
                await storage.copy_file(entry, dest_path)
        except Exception:
            logger.warning("Failed to copy task file %s to %s, skipping", entry, dest_path, exc_info=True)
