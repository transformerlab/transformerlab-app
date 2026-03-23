"""Tests for server install command."""

from pathlib import Path
from unittest.mock import patch

from typer.testing import CliRunner
from transformerlab_cli.main import app
from transformerlab_cli.commands.server import _load_existing_env, _build_env_content, _generate_secret

runner = CliRunner()


def test_server_help():
    """Test the server command help."""
    result = runner.invoke(app, ["server", "--help"])
    assert result.exit_code == 0
    assert "Server installation and configuration" in result.output


def test_server_install_help():
    """Test the server install --help output."""
    result = runner.invoke(app, ["server", "install", "--help"])
    assert result.exit_code == 0
    assert "--dry-run" in result.output


def test_load_existing_env(tmp_path: Path):
    """Test parsing an existing .env file."""
    env_file = tmp_path / ".env"
    env_file.write_text(
        "# Comment line\n"
        'FRONTEND_URL="http://example.com"\n'
        "MULTIUSER=true\n"
        "  \n"
        "# Another comment\n"
        "TFL_STORAGE_PROVIDER='aws'\n"
    )
    result = _load_existing_env(env_file)
    assert result["FRONTEND_URL"] == "http://example.com"
    assert result["MULTIUSER"] == "true"
    assert result["TFL_STORAGE_PROVIDER"] == "aws"


def test_load_existing_env_missing(tmp_path: Path):
    """Test that a missing file returns an empty dict."""
    result = _load_existing_env(tmp_path / "nonexistent")
    assert result == {}


def test_build_env_content():
    """Test that env content is built with correct sections and formatting."""
    env = {
        "FRONTEND_URL": "http://localhost:8338",
        "TL_API_URL": "http://localhost:8338/",
        "MULTIUSER": "true",
        "TFL_STORAGE_PROVIDER": "aws",
        "TFL_REMOTE_STORAGE_ENABLED": "true",
        "TRANSFORMERLAB_JWT_SECRET": "secret1",
        "TRANSFORMERLAB_REFRESH_SECRET": "secret2",
        "EMAIL_AUTH_ENABLED": "true",
    }
    content = _build_env_content(env)
    assert "# Frontend" in content
    assert 'FRONTEND_URL="http://localhost:8338"' in content
    assert "# Storage" in content
    assert "# JWT Secrets" in content
    assert "# Authentication" in content
    assert "# Multi-user" in content


def test_generate_secret():
    """Test that secrets are generated as non-empty hex strings."""
    s = _generate_secret()
    assert len(s) == 64  # 32 bytes = 64 hex chars
    int(s, 16)  # Should be valid hex


def test_generate_secret_different():
    """Test that two generated secrets are different."""
    assert _generate_secret() != _generate_secret()


def test_server_install_dry_run_defaults(tmp_path: Path):
    """Test a full dry-run with all defaults accepted."""
    fake_env = tmp_path / ".env"

    # Flow: frontend URL -> storage type (aws) -> compute? (n) -> email? (n) -> auth? (n)
    user_input = "\n".join(
        [
            "",  # frontend URL (accept default)
            "1",  # storage type: aws
            "n",  # skip compute provider
            "n",  # skip email
            "n",  # skip auth
        ]
    )

    with patch("transformerlab_cli.commands.server.ENV_FILE", fake_env):
        result = runner.invoke(app, ["server", "install", "--dry-run"], input=user_input)

    assert result.exit_code == 0
    assert "Dry run complete" in result.output
    assert "No files were written" in result.output
    assert not fake_env.exists()


def test_server_install_writes_file(tmp_path: Path):
    """Test that install writes the .env file when not in dry-run mode."""
    fake_env = tmp_path / ".env"

    user_input = "\n".join(
        [
            "http://myserver.com:8338",  # frontend URL
            "1",  # storage type: aws
            "n",  # skip compute
            "n",  # skip email
            "n",  # skip auth
            "n",  # skip running install script
        ]
    )

    with patch("transformerlab_cli.commands.server.ENV_FILE", fake_env):
        result = runner.invoke(app, ["server", "install"], input=user_input)

    assert result.exit_code == 0
    assert fake_env.exists()

    content = fake_env.read_text()
    assert 'FRONTEND_URL="http://myserver.com:8338"' in content
    assert 'TL_API_URL="http://myserver.com:8338/"' in content
    assert 'TFL_STORAGE_PROVIDER="aws"' in content
    assert 'MULTIUSER="true"' in content
    assert "TRANSFORMERLAB_JWT_SECRET=" in content
    assert "TRANSFORMERLAB_REFRESH_SECRET=" in content


def test_server_install_preserves_jwt_secrets(tmp_path: Path):
    """Test that existing JWT secrets are preserved on reconfigure."""
    fake_env = tmp_path / ".env"
    fake_env.write_text(
        'TRANSFORMERLAB_JWT_SECRET="existing_jwt"\n'
        'TRANSFORMERLAB_REFRESH_SECRET="existing_refresh"\n'
        'FRONTEND_URL="http://old.com"\n'
    )

    user_input = "\n".join(
        [
            "",  # frontend URL (accept existing default)
            "1",  # storage: aws
            "n",  # skip compute
            "n",  # skip email
            "n",  # skip auth
        ]
    )

    with patch("transformerlab_cli.commands.server.ENV_FILE", fake_env):
        result = runner.invoke(app, ["server", "install", "--dry-run"], input=user_input)

    assert result.exit_code == 0
    assert "existing_jwt" in result.output
    assert "existing_refresh" in result.output
    assert "kept existing" in result.output


def test_server_install_storage_localfs(tmp_path: Path):
    """Test choosing localfs storage prompts for a path."""
    fake_env = tmp_path / ".env"

    user_input = "\n".join(
        [
            "",  # frontend URL
            "4",  # storage type: localfs
            "/mnt/shared",  # storage path
            "n",  # skip compute
            "n",  # skip email
            "n",  # skip auth
        ]
    )

    with patch("transformerlab_cli.commands.server.ENV_FILE", fake_env):
        result = runner.invoke(app, ["server", "install", "--dry-run"], input=user_input)

    assert result.exit_code == 0
    assert 'TFL_STORAGE_PROVIDER="localfs"' in result.output
    assert 'TFL_STORAGE_URI="/mnt/shared"' in result.output
    assert "TFL_REMOTE_STORAGE_ENABLED" not in result.output


def test_server_install_email_configured(tmp_path: Path):
    """Test configuring SMTP email."""
    fake_env = tmp_path / ".env"

    user_input = "\n".join(
        [
            "",  # frontend URL
            "1",  # storage: aws
            "n",  # skip compute
            "y",  # configure email
            "smtp.gmail.com",  # smtp server
            "587",  # port
            "user@gmail.com",  # username
            "user@gmail.com",  # from address
            "password123",  # smtp password
            "n",  # skip auth
        ]
    )

    with patch("transformerlab_cli.commands.server.ENV_FILE", fake_env):
        result = runner.invoke(app, ["server", "install", "--dry-run"], input=user_input)

    assert result.exit_code == 0
    assert 'SMTP_SERVER="smtp.gmail.com"' in result.output
    assert 'EMAIL_METHOD="smtp"' in result.output


def test_server_install_email_skip(tmp_path: Path):
    """Test skipping email sets dev mode."""
    fake_env = tmp_path / ".env"

    user_input = "\n".join(
        [
            "",  # frontend URL
            "1",  # storage: aws
            "n",  # skip compute
            "n",  # skip email
            "n",  # skip auth
        ]
    )

    with patch("transformerlab_cli.commands.server.ENV_FILE", fake_env):
        result = runner.invoke(app, ["server", "install", "--dry-run"], input=user_input)

    assert result.exit_code == 0
    assert 'EMAIL_METHOD="dev"' in result.output


def test_server_install_admin_info_displayed(tmp_path: Path):
    """Test that admin account info is displayed during install."""
    fake_env = tmp_path / ".env"

    user_input = "\n".join(
        [
            "",  # frontend URL
            "1",  # storage: aws
            "n",  # skip compute
            "n",  # skip email
            "n",  # skip auth
        ]
    )

    with patch("transformerlab_cli.commands.server.ENV_FILE", fake_env):
        result = runner.invoke(app, ["server", "install", "--dry-run"], input=user_input)

    assert result.exit_code == 0
    assert "admin@example.com" in result.output
    assert "admin123" in result.output
    assert "Change the default password" in result.output
