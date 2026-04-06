"""Test suite for worker_leader module with mocked flock."""

from __future__ import annotations

import os
from unittest.mock import patch, MagicMock

import pytest


@pytest.fixture
def reset_worker_leader_state():
    """Reset the worker_leader module state before and after each test."""
    import transformerlab.shared.worker_leader as wl

    # Save original state
    original_leader = wl._leader
    original_lock_fd = wl._lock_fd

    # Reset state
    wl._leader = False
    wl._lock_fd = None

    yield

    # Restore state
    wl._leader = original_leader
    wl._lock_fd = original_lock_fd


@pytest.fixture
def mock_lock_path(tmp_path, monkeypatch):
    """Mock the lock path to use a temporary directory."""
    lock_dir = tmp_path / ".transformerlab"
    lock_dir.mkdir(parents=True, exist_ok=True)
    lock_file = lock_dir / ".worker_leader.lock"

    import transformerlab.shared.worker_leader as wl

    monkeypatch.setattr(wl, "_lock_path", lambda: lock_file)
    return lock_file


def test_try_acquire_leadership_success(reset_worker_leader_state, mock_lock_path):
    """Test successful leadership acquisition."""
    import transformerlab.shared.worker_leader as wl

    with patch("fcntl.flock") as mock_flock:
        result = wl.try_acquire_leadership()

        assert result is True
        assert wl.is_leader() is True
        mock_flock.assert_called_once()


def test_try_acquire_leadership_already_leader(reset_worker_leader_state, mock_lock_path):
    """Test that acquiring leadership when already leader returns True immediately."""
    import transformerlab.shared.worker_leader as wl

    with patch("fcntl.flock") as mock_flock:
        # First call acquires leadership
        assert wl.try_acquire_leadership() is True
        mock_flock.reset_mock()

        # Second call should return True without trying flock again
        assert wl.try_acquire_leadership() is True
        mock_flock.assert_not_called()


def test_try_acquire_leadership_failure(reset_worker_leader_state, mock_lock_path):
    """Test that leadership acquisition fails when lock cannot be acquired."""
    import transformerlab.shared.worker_leader as wl

    with patch("fcntl.flock") as mock_flock:
        mock_flock.side_effect = BlockingIOError("Resource temporarily unavailable")

        with patch("builtins.open", create=True) as mock_open:
            mock_file = MagicMock()
            mock_open.return_value = mock_file

            result = wl.try_acquire_leadership()

            assert result is False
            assert wl.is_leader() is False
            # Verify cleanup: file descriptor is closed
            mock_file.close.assert_called_once()


def test_lock_file_created_on_success(reset_worker_leader_state, mock_lock_path):
    """Test that lock file is created when leadership is acquired."""
    import transformerlab.shared.worker_leader as wl

    with patch("fcntl.flock"):
        with patch("builtins.open", create=True) as mock_open:
            mock_file = MagicMock()
            mock_open.return_value = mock_file

            wl.try_acquire_leadership()

            # Verify file was opened and PID was written
            mock_open.assert_called_once()
            mock_file.write.assert_called_once()
            call_args = mock_file.write.call_args[0][0]
            assert str(os.getpid()) == call_args
            mock_file.flush.assert_called_once()


def test_is_leader_initial_state(reset_worker_leader_state):
    """Test that is_leader returns False initially."""
    import transformerlab.shared.worker_leader as wl

    assert wl.is_leader() is False


def test_fcntl_unavailable_fallback(reset_worker_leader_state, mock_lock_path, caplog, monkeypatch):
    """Test fallback behavior when fcntl is unavailable (e.g., Windows)."""
    import transformerlab.shared.worker_leader as wl
    import logging
    import builtins

    caplog.set_level(logging.INFO, logger="transformerlab.shared.worker_leader")

    # Mock the import to fail for fcntl
    original_import = builtins.__import__

    def mock_import(name, *args, **kwargs):
        if name == "fcntl":
            raise ImportError("No module named 'fcntl'")
        return original_import(name, *args, **kwargs)

    # Reset the worker leader state
    wl._leader = False
    wl._lock_fd = None

    with patch("builtins.__import__", side_effect=mock_import):
        result = wl.try_acquire_leadership()

        assert result is True
        assert wl.is_leader() is True
        assert len(caplog.records) > 0, f"No log records captured. Got: {caplog.records}"
        assert any("fcntl unavailable" in record.message for record in caplog.records), (
            f"'fcntl unavailable' not found in log messages: {[r.message for r in caplog.records]}"
        )
