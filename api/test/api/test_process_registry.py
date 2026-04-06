import subprocess
import sys
import threading
import time

from transformerlab.services.process_registry import ProcessRegistry, get_registry


def _sleep_proc(seconds: int = 60) -> subprocess.Popen:
    """Spawn a real sleeping subprocess that we can observe."""
    return subprocess.Popen(
        [sys.executable, "-c", f"import time; time.sleep({seconds})"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def _is_alive(proc: subprocess.Popen) -> bool:
    return proc.poll() is None


class TestProcessRegistryRegisterUnregister:
    def test_register_stores_proc(self):
        reg = ProcessRegistry()
        proc = _sleep_proc()
        try:
            reg.register("local:org1:exp1:job1", proc, workspace_dir="/tmp/job1")
            assert "local:org1:exp1:job1" in reg.list_keys()
        finally:
            proc.kill()
            proc.wait()

    def test_unregister_removes_key(self):
        reg = ProcessRegistry()
        proc = _sleep_proc()
        reg.register("local:org1:exp1:job1", proc, workspace_dir="/tmp/job1")
        reg.unregister("local:org1:exp1:job1")
        assert "local:org1:exp1:job1" not in reg.list_keys()
        proc.kill()
        proc.wait()

    def test_unregister_unknown_key_is_noop(self):
        reg = ProcessRegistry()
        reg.unregister("does-not-exist")

    def test_double_register_kills_old_proc(self):
        reg = ProcessRegistry()
        old_proc = _sleep_proc()
        new_proc = _sleep_proc()
        try:
            reg.register("local:org1:exp1:job1", old_proc, workspace_dir="/tmp/job1")
            reg.register("local:org1:exp1:job1", new_proc, workspace_dir="/tmp/job1")
            time.sleep(0.3)
            assert not _is_alive(old_proc)
            assert _is_alive(new_proc)
        finally:
            reg.kill("local:org1:exp1:job1")


class TestProcessRegistryKill:
    def test_kill_by_key_terminates_proc(self):
        reg = ProcessRegistry()
        proc = _sleep_proc()
        reg.register("local:org1:exp1:job1", proc, workspace_dir="/tmp/job1")
        reg.kill("local:org1:exp1:job1")
        time.sleep(0.3)
        assert not _is_alive(proc)
        assert "local:org1:exp1:job1" not in reg.list_keys()

    def test_kill_unknown_key_is_noop(self):
        reg = ProcessRegistry()
        reg.kill("does-not-exist")

    def test_kill_already_dead_proc_is_noop(self):
        reg = ProcessRegistry()
        proc = _sleep_proc()
        proc.kill()
        proc.wait()
        reg.register("local:org1:exp1:job1", proc, workspace_dir="/tmp/job1")
        reg.kill("local:org1:exp1:job1")

    def test_kill_by_workspace(self):
        reg = ProcessRegistry()
        proc = _sleep_proc()
        reg.register("local:org1:exp1:job1", proc, workspace_dir="/tmp/job1")
        reg.kill_by_workspace("/tmp/job1")
        time.sleep(0.3)
        assert not _is_alive(proc)
        assert "local:org1:exp1:job1" not in reg.list_keys()

    def test_kill_by_workspace_unknown_is_noop(self):
        reg = ProcessRegistry()
        reg.kill_by_workspace("/tmp/nonexistent")

    def test_kill_all_terminates_all_procs(self):
        reg = ProcessRegistry()
        procs = [_sleep_proc() for _ in range(3)]
        for i, p in enumerate(procs):
            reg.register(f"local:org1:exp1:job{i}", p, workspace_dir=f"/tmp/job{i}")
        reg.kill_all()
        time.sleep(0.3)
        for p in procs:
            assert not _is_alive(p)
        assert reg.list_keys() == []


class TestProcessRegistryThreadSafety:
    def test_concurrent_register_kill(self):
        reg = ProcessRegistry()
        errors = []

        def _worker(i: int) -> None:
            try:
                proc = _sleep_proc()
                key = f"local:org1:exp1:job{i}"
                reg.register(key, proc, workspace_dir=f"/tmp/job{i}")
                time.sleep(0.05)
                reg.kill(key)
            except Exception as e:  # pragma: no cover - failure path capture only
                errors.append(e)

        threads = [threading.Thread(target=_worker, args=(i,)) for i in range(10)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        assert errors == []


class TestGetRegistry:
    def test_get_registry_returns_singleton(self):
        r1 = get_registry()
        r2 = get_registry()
        assert r1 is r2
