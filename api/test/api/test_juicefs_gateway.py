import subprocess
import pytest
from unittest.mock import MagicMock, patch

from transformerlab.services import juicefs_gateway


@pytest.fixture(autouse=True)
def reset_gateway_state():
    juicefs_gateway._gateway_process = None
    juicefs_gateway._shutdown_event.clear()
    yield
    juicefs_gateway._shutdown_event.set()
    juicefs_gateway._gateway_process = None


@pytest.fixture
def juicefs_env(monkeypatch):
    monkeypatch.setenv("TFL_STORAGE_PROVIDER", "juicefs")
    monkeypatch.setenv("TFL_JUICEFS_METADATA_URL", "redis://localhost:6379/1")
    monkeypatch.setenv("TFL_JUICEFS_VOLUME_NAME", "myvol")
    monkeypatch.setenv("TFL_JUICEFS_STORAGE_BACKEND", "aws")
    monkeypatch.setenv("TFL_JUICEFS_TOKEN", "hosted-token")
    monkeypatch.setenv("TFL_JUICEFS_GATEWAY_ACCESS_KEY", "gw-access")
    monkeypatch.setenv("TFL_JUICEFS_GATEWAY_SECRET_KEY", "gw-secret-123")
    monkeypatch.delenv("TFL_JUICEFS_GATEWAY_ENDPOINT", raising=False)
    monkeypatch.delenv("TFL_JUICEFS_CONSOLE_URL", raising=False)


def test_noop_for_other_providers(monkeypatch):
    monkeypatch.setenv("TFL_STORAGE_PROVIDER", "aws")

    with patch.object(juicefs_gateway, "_spawn_gateway") as mock_spawn:
        juicefs_gateway.ensure_juicefs_gateway()

    mock_spawn.assert_not_called()


def test_reuses_already_running_gateway(juicefs_env):
    with (
        patch.object(juicefs_gateway, "is_gateway_ready", return_value=True),
        patch.object(juicefs_gateway, "_run_juicefs_auth") as mock_auth,
        patch.object(juicefs_gateway, "_spawn_gateway") as mock_spawn,
    ):
        juicefs_gateway.ensure_juicefs_gateway()

    mock_auth.assert_not_called()
    mock_spawn.assert_not_called()


def test_starts_gateway_and_waits_for_ready(juicefs_env):
    with (
        patch.object(juicefs_gateway, "is_gateway_ready", side_effect=[False, True]),
        patch.object(juicefs_gateway, "_run_juicefs_auth") as mock_auth,
        patch.object(juicefs_gateway, "_spawn_gateway", return_value=MagicMock()) as mock_spawn,
        patch.object(juicefs_gateway, "_start_supervisor") as mock_supervisor,
    ):
        juicefs_gateway.ensure_juicefs_gateway()

    mock_auth.assert_called_once()
    mock_spawn.assert_called_once()
    mock_supervisor.assert_called_once()


def test_exits_when_auth_fails(juicefs_env):
    auth_error = subprocess.CalledProcessError(1, ["juicefs", "auth"], stderr="bad token")
    with (
        patch.object(juicefs_gateway, "is_gateway_ready", return_value=False),
        patch.object(juicefs_gateway, "_run_juicefs_auth", side_effect=auth_error),
        patch.object(juicefs_gateway, "_spawn_gateway") as mock_spawn,
    ):
        with pytest.raises(SystemExit):
            juicefs_gateway.ensure_juicefs_gateway()

    mock_spawn.assert_not_called()


def test_exits_when_juicefs_binary_missing(juicefs_env):
    with (
        patch.object(juicefs_gateway, "is_gateway_ready", return_value=False),
        patch.object(juicefs_gateway, "_run_juicefs_auth", side_effect=FileNotFoundError("juicefs")),
    ):
        with pytest.raises(SystemExit):
            juicefs_gateway.ensure_juicefs_gateway()


def test_exits_when_gateway_never_ready(juicefs_env):
    with (
        patch.object(juicefs_gateway, "is_gateway_ready", return_value=False),
        patch.object(juicefs_gateway, "_run_juicefs_auth"),
        patch.object(juicefs_gateway, "_spawn_gateway", return_value=MagicMock()),
        patch.object(juicefs_gateway, "_wait_until_ready", return_value=False),
    ):
        with pytest.raises(SystemExit):
            juicefs_gateway.ensure_juicefs_gateway()


def test_exits_when_required_env_missing(juicefs_env, monkeypatch):
    monkeypatch.delenv("TFL_JUICEFS_TOKEN", raising=False)

    with patch.object(juicefs_gateway, "is_gateway_ready", return_value=False):
        with pytest.raises(SystemExit):
            juicefs_gateway.ensure_juicefs_gateway()


def test_run_juicefs_auth_builds_command(juicefs_env, monkeypatch):
    monkeypatch.setenv("TFL_JUICEFS_CONSOLE_URL", "http://juicefs-console:8080")

    with (
        patch("transformerlab.services.juicefs_gateway.subprocess.run") as mock_run,
        patch(
            "transformerlab.services.compute_provider.launch_credentials.get_aws_credentials_from_file",
            return_value=("AKID", "SECRET"),
        ),
        patch(
            "transformerlab.shared.remote_workspace.get_default_aws_profile",
            return_value="transformerlab-s3",
        ),
    ):
        juicefs_gateway._run_juicefs_auth()

    cmd = mock_run.call_args[0][0]
    assert cmd[:4] == ["juicefs", "auth", "myvol", "--token"]
    assert "hosted-token" in cmd
    assert "--console-url" in cmd and "http://juicefs-console:8080" in cmd
    assert "--access-key" in cmd and "AKID" in cmd
    assert "--secret-key" in cmd and "SECRET" in cmd


def test_spawn_gateway_uses_minio_root_creds(juicefs_env, tmp_path, monkeypatch):
    monkeypatch.setenv("TFL_HOME_DIR", str(tmp_path))

    with patch("transformerlab.services.juicefs_gateway.subprocess.Popen") as mock_popen:
        juicefs_gateway._spawn_gateway()

    args, kwargs = mock_popen.call_args
    assert args[0] == [
        "juicefs",
        "gateway",
        "myvol",
        "127.0.0.1:9000",
        "--multi-buckets",
        "--keep-etag",
    ]
    assert kwargs["env"]["MINIO_ROOT_USER"] == "gw-access"
    assert kwargs["env"]["MINIO_ROOT_PASSWORD"] == "gw-secret-123"


def test_stop_gateway_terminates_process(juicefs_env):
    mock_proc = MagicMock()
    mock_proc.poll.return_value = None
    juicefs_gateway._gateway_process = mock_proc

    juicefs_gateway.stop_juicefs_gateway()

    mock_proc.terminate.assert_called_once()
    assert juicefs_gateway._gateway_process is None


def test_supervise_respawns_after_crash(juicefs_env):
    crashed_proc = MagicMock()
    crashed_proc.returncode = 1
    # wait() returns immediately (crash); after respawn the loop must observe
    # the shutdown event and exit.
    crashed_proc.wait.return_value = 1
    juicefs_gateway._gateway_process = crashed_proc

    respawned_proc = MagicMock()

    def fake_spawn():
        # Stop the loop after the first respawn.
        juicefs_gateway._shutdown_event.set()
        return respawned_proc

    with (
        patch.object(juicefs_gateway, "_spawn_gateway", side_effect=fake_spawn) as mock_spawn,
        patch.object(juicefs_gateway.time, "sleep"),
    ):
        juicefs_gateway._supervise()

    mock_spawn.assert_called_once()
    assert juicefs_gateway._gateway_process is respawned_proc


def test_supervise_does_not_respawn_on_shutdown(juicefs_env):
    proc = MagicMock()

    def wait_then_shutdown():
        # Simulate stop_juicefs_gateway(): the shutdown event is set before the
        # process exits, so the supervisor must NOT respawn.
        juicefs_gateway._shutdown_event.set()
        return 0

    proc.wait.side_effect = wait_then_shutdown
    juicefs_gateway._gateway_process = proc

    with patch.object(juicefs_gateway, "_spawn_gateway") as mock_spawn:
        juicefs_gateway._supervise()

    mock_spawn.assert_not_called()
