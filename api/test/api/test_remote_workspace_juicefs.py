import pytest
from unittest.mock import MagicMock, patch
from transformerlab.shared import remote_workspace


@pytest.fixture
def juicefs_env(monkeypatch):
    monkeypatch.setenv("TFL_JUICEFS_METADATA_URL", "redis://localhost:6379/1")
    monkeypatch.setenv("TFL_JUICEFS_VOLUME_NAME", "myvol")
    monkeypatch.setenv("TFL_JUICEFS_STORAGE_BACKEND", "aws")
    monkeypatch.setenv("TFL_JUICEFS_TOKEN", "hosted-token")
    monkeypatch.setenv("TFL_JUICEFS_GATEWAY_ACCESS_KEY", "gw-access")
    monkeypatch.setenv("TFL_JUICEFS_GATEWAY_SECRET_KEY", "gw-secret-123")
    monkeypatch.setattr(remote_workspace, "STORAGE_PROVIDER", "juicefs", raising=False)


@pytest.mark.parametrize(
    "missing",
    [
        "TFL_JUICEFS_METADATA_URL",
        "TFL_JUICEFS_VOLUME_NAME",
        "TFL_JUICEFS_STORAGE_BACKEND",
        "TFL_JUICEFS_TOKEN",
        "TFL_JUICEFS_GATEWAY_ACCESS_KEY",
        "TFL_JUICEFS_GATEWAY_SECRET_KEY",
    ],
)
def test_validate_juicefs_config_raises_on_missing_env(juicefs_env, monkeypatch, missing):
    monkeypatch.delenv(missing, raising=False)

    with pytest.raises(SystemExit):
        remote_workspace._validate_juicefs_config()


def test_validate_juicefs_config_raises_on_invalid_storage_backend(juicefs_env, monkeypatch):
    monkeypatch.setenv("TFL_JUICEFS_STORAGE_BACKEND", "s3")

    with pytest.raises(SystemExit):
        remote_workspace._validate_juicefs_config()


def test_validate_juicefs_config_passes_when_valid(juicefs_env):
    remote_workspace._validate_juicefs_config()  # should not raise — no mount required


def test_create_juicefs_workspace_creates_bucket_and_sets_quota(juicefs_env, monkeypatch):
    monkeypatch.setenv("TFL_JUICEFS_QUOTA_GB", "50")

    mock_fs = MagicMock()
    mock_fs.exists.return_value = False
    with patch("fsspec.filesystem", return_value=mock_fs) as mock_fs_factory:
        with patch("transformerlab.shared.remote_workspace.subprocess.run") as mock_run:
            result = remote_workspace._create_juicefs_workspace("team-abc")

    assert result is True
    _, fs_kwargs = mock_fs_factory.call_args
    assert fs_kwargs["client_kwargs"]["endpoint_url"] == "http://127.0.0.1:9000"
    assert fs_kwargs["key"] == "gw-access"
    assert fs_kwargs["secret"] == "gw-secret-123"
    mock_fs.mkdir.assert_called_once_with("workspace-team-abc")
    mock_run.assert_called_once_with(
        ["juicefs", "quota", "set", "myvol", "--path", "/workspace-team-abc", "--capacity", "50"],
        check=True,
        capture_output=True,
        text=True,
    )


def test_create_juicefs_workspace_skips_mkdir_when_bucket_exists(juicefs_env):
    mock_fs = MagicMock()
    mock_fs.exists.return_value = True
    with patch("fsspec.filesystem", return_value=mock_fs):
        with patch("transformerlab.shared.remote_workspace.subprocess.run"):
            result = remote_workspace._create_juicefs_workspace("team-abc")

    assert result is True
    mock_fs.mkdir.assert_not_called()


def test_create_juicefs_workspace_returns_false_on_quota_error(juicefs_env):
    mock_fs = MagicMock()
    mock_fs.exists.return_value = False
    with patch("fsspec.filesystem", return_value=mock_fs):
        with patch(
            "transformerlab.shared.remote_workspace.subprocess.run",
            side_effect=Exception("juicefs not found"),
        ):
            result = remote_workspace._create_juicefs_workspace("team-abc")

    assert result is False


def test_create_juicefs_workspace_returns_false_on_bucket_error(juicefs_env):
    with patch("fsspec.filesystem", side_effect=Exception("gateway unreachable")):
        result = remote_workspace._create_juicefs_workspace("team-abc")

    assert result is False


def test_create_bucket_for_team_routes_to_juicefs(juicefs_env):
    mock_fs = MagicMock()
    mock_fs.exists.return_value = False
    with patch("fsspec.filesystem", return_value=mock_fs):
        with patch("transformerlab.shared.remote_workspace.subprocess.run"):
            result = remote_workspace.create_bucket_for_team("team-xyz")

    assert result is True
    mock_fs.mkdir.assert_called_once_with("workspace-team-xyz")
