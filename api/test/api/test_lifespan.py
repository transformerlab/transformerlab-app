"""
Unit tests for the lifespan context manager and task cancellation helpers.
"""

from api import _cancel_task, _cancel_tasks, lifespan

import asyncio
import pytest
import sys
from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch, MagicMock
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Optional
from asyncio import Task

# Configure pytest-asyncio
pytest_plugins = ("pytest_asyncio",)

# Add parent directory to path to import from api module
sys.path.insert(0, str(Path(__file__).parent.parent.parent))


class TestCancelTask:
    """Tests for _cancel_task helper function."""

    @pytest.mark.asyncio
    async def test_cancel_running_task(self):
        """Test that a running task is properly cancelled."""

        async def long_running_task():
            await asyncio.sleep(10)

        task = asyncio.create_task(long_running_task())
        await asyncio.sleep(0.1)  # Let task start

        assert not task.done()
        await _cancel_task(task, "test")
        assert task.cancelled()

    @pytest.mark.asyncio
    async def test_cancel_none_task(self):
        """Test that cancelling None doesn't raise an error."""
        await _cancel_task(None, "test")
        # Should complete without error

    @pytest.mark.asyncio
    async def test_cancel_already_done_task(self):
        """Test that cancelling an already completed task is safe."""

        async def quick_task():
            return "done"

        task = asyncio.create_task(quick_task())
        await task  # Wait for completion

        assert task.done()
        await _cancel_task(task, "test")
        # Should not raise an error


class TestCancelTasks:
    """Tests for _cancel_tasks helper function."""

    @pytest.mark.asyncio
    async def test_cancel_multiple_running_tasks(self):
        """Test that multiple running tasks are cancelled."""

        async def long_running_task(id):
            await asyncio.sleep(10)

        tasks = [
            asyncio.create_task(long_running_task(1)),
            asyncio.create_task(long_running_task(2)),
            asyncio.create_task(long_running_task(3)),
        ]
        await asyncio.sleep(0.1)  # Let tasks start

        await _cancel_tasks(tasks, "test")

        for task in tasks:
            assert task.cancelled()

    @pytest.mark.asyncio
    async def test_cancel_empty_task_list(self):
        """Test that cancelling empty list doesn't raise error."""
        await _cancel_tasks([], "test")
        # Should complete without error

    @pytest.mark.asyncio
    async def test_cancel_mixed_task_states(self):
        """Test cancelling a mix of running and completed tasks."""

        async def quick_task():
            return "done"

        async def slow_task():
            await asyncio.sleep(10)

        task1 = asyncio.create_task(quick_task())
        await task1  # Complete this one

        task2 = asyncio.create_task(slow_task())
        task3 = asyncio.create_task(slow_task())
        await asyncio.sleep(0.1)  # Let slow tasks start

        tasks = [task1, task2, task3]
        await _cancel_tasks(tasks, "test")

        assert task1.done() and not task1.cancelled()  # Was already done
        assert task2.cancelled()
        assert task3.cancelled()

    @pytest.mark.asyncio
    async def test_cancel_tasks_handles_exceptions(self):
        """Test that exceptions in tasks are handled during cancellation."""

        async def failing_task():
            await asyncio.sleep(0.1)
            raise ValueError("Task failed")

        async def normal_task():
            await asyncio.sleep(10)

        task1 = asyncio.create_task(failing_task())
        task2 = asyncio.create_task(normal_task())

        await asyncio.sleep(0.2)  # Let failing task fail

        tasks = [task1, task2]
        await _cancel_tasks(tasks, "test")

        # Should not raise, just handle the exception
        assert task2.cancelled()


class TestLifespanIntegration:
    """Integration tests for the lifespan context manager."""

    @pytest.mark.asyncio
    async def test_lifespan_startup_and_shutdown(self):
        """Test that lifespan properly starts up and shuts down."""
        startup_called = False
        shutdown_called = False

        @asynccontextmanager
        async def mock_lifespan(app) -> AsyncGenerator[None, None]:
            nonlocal startup_called, shutdown_called

            # Startup
            startup_called = True
            migration_tasks = []

            try:
                yield
            finally:
                # Shutdown
                shutdown_called = True
                await _cancel_tasks(migration_tasks, "migration")

        mock_app = Mock()

        async with mock_lifespan(mock_app):
            assert startup_called
            assert not shutdown_called

        assert shutdown_called

    @pytest.mark.asyncio
    async def test_lifespan_cancels_background_tasks(self):
        """Test that background tasks are cancelled on shutdown."""
        background_task_cancelled = False

        async def background_task():
            nonlocal background_task_cancelled
            try:
                await asyncio.sleep(10)
            except asyncio.CancelledError:
                background_task_cancelled = True
                raise

        @asynccontextmanager
        async def mock_lifespan(app) -> AsyncGenerator[None, None]:
            task = asyncio.create_task(background_task())

            try:
                yield
            finally:
                await _cancel_task(task, "background")

        mock_app = Mock()

        async with mock_lifespan(mock_app):
            await asyncio.sleep(0.1)  # Let task start

        assert background_task_cancelled

    @pytest.mark.asyncio
    async def test_lifespan_shutdown_on_startup_failure(self):
        """Test that shutdown runs even if startup fails."""
        cleanup_called = False

        @asynccontextmanager
        async def mock_lifespan(app) -> AsyncGenerator[None, None]:
            nonlocal cleanup_called

            migration_tasks = [
                asyncio.create_task(asyncio.sleep(10)),
                asyncio.create_task(asyncio.sleep(10)),
            ]

            try:
                raise ValueError("Startup failed!")
                yield
            finally:
                cleanup_called = True
                await _cancel_tasks(migration_tasks, "migration")

        mock_app = Mock()

        with pytest.raises(ValueError):
            async with mock_lifespan(mock_app):
                pass

        assert cleanup_called


class TestLifespanWithMocks:
    """Test lifespan with mocked dependencies."""

    @pytest.mark.skipif(not FUNCTIONS_IMPORTED, reason="Could not import lifespan from api module")
    @pytest.mark.asyncio
    async def test_full_lifespan_cycle(self):
        """Test full lifespan cycle with all dependencies mocked."""

        with (
            patch("api.print_launch_message") as mock_print_launch,
            patch("api.validate_cloud_credentials") as mock_validate_creds,
            patch("api.galleries.update_gallery_cache") as mock_update_gallery,
            patch("api.spawn_fastchat_controller_subprocess") as mock_spawn_controller,
            patch("api.db.init", new_callable=AsyncMock) as mock_db_init,
            patch("api.seed_default_experiments") as mock_seed_experiments,
            patch("api.seed_default_admin_user", new_callable=AsyncMock) as mock_seed_admin,
            patch("api.cancel_in_progress_jobs") as mock_cancel_jobs,
            patch("api.migrate_models_table_to_filesystem", new_callable=AsyncMock) as mock_migrate_models,
            patch("api.migrate_datasets_table_to_filesystem", new_callable=AsyncMock) as mock_migrate_datasets,
            patch("api.migrate_job_and_experiment_to_filesystem", new_callable=AsyncMock) as mock_migrate_jobs,
            patch("api.migrate_tasks_table_to_filesystem", new_callable=AsyncMock) as mock_migrate_tasks,
            patch("api.db.close", new_callable=AsyncMock) as mock_db_close,
            patch("api.cleanup_at_exit") as mock_cleanup,
            patch("api.os.getenv", return_value=None) as mock_getenv,
            patch("sys.argv", ["test"]),
        ):
            # Make migrations return quickly
            mock_migrate_models.return_value = None
            mock_migrate_datasets.return_value = None
            mock_migrate_jobs.return_value = None
            mock_migrate_tasks.return_value = None

            mock_app = Mock()

            # Test the actual lifespan
            async with lifespan(mock_app):
                await asyncio.sleep(0.1)

            # Verify startup was called
            mock_db_init.assert_called_once()
            mock_seed_experiments.assert_called_once()
            mock_seed_admin.assert_called_once()

            # Verify shutdown was called
            mock_db_close.assert_called_once()
            mock_cleanup.assert_called_once()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
