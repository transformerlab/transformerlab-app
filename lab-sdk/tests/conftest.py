import os
import sys
import pytest


@pytest.fixture(autouse=True)
def _isolate_imports_and_home(monkeypatch, tmp_path):
    """
    Ensure imports are fresh each test and HOME is isolated to tmp.
    Do not force TFL_* env; individual tests control those if needed.
    """
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
    src_dir = os.path.join(repo_root, "src")
    if src_dir not in sys.path:
        sys.path.insert(0, src_dir)

    # Isolate HOME to avoid touching real user dirs for default-path tests
    monkeypatch.setenv("HOME", str(tmp_path))

    # Clear lab modules so module-level env evaluation re-runs every test
    for mod in ["lab", "lab.dirs"]:
        if mod in sys.modules:
            sys.modules.pop(mod)

    yield


