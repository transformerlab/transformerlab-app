"""Tests for server install command."""

import os
from unittest.mock import patch

from typer.testing import CliRunner
from transformerlab_cli.main import app
from transformerlab_cli.commands.server import (
    _build_env_content,
    _check_aws_profile,
    _generate_secret,
    _load_existing_env,
)
from tests.helpers import strip_ansi

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
    assert "--dry-run" in strip_ansi(result.output)


def test_load_existing_env(tmp_path):
    """Test parsing an existing .env file."""
    env_file = os.path.join(str(tmp_path), ".env")
    with open(env_file, "w", encoding="utf-8") as f:
        f.write(
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


def test_load_existing_env_missing(tmp_path):
    """Test that a missing file returns an empty dict."""
    result = _load_existing_env(os.path.join(str(tmp_path), "nonexistent"))
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


def test_check_aws_profile_defaults_to_env_profile(tmp_path, monkeypatch):
    """Default profile check should honor AWS_PROFILE when set."""
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("AWS_PROFILE", "custom-profile")

    aws_dir = tmp_path / ".aws"
    aws_dir.mkdir(parents=True, exist_ok=True)
    (aws_dir / "credentials").write_text("[custom-profile]\naws_access_key_id=test\n", encoding="utf-8")

    assert _check_aws_profile() is True


def test_server_install_dry_run_defaults(tmp_path):
    """Test a full dry-run with all defaults accepted."""
    fake_env = os.path.join(str(tmp_path), ".env")

    # Flow: frontend URL -> storage type (aws) -> admin email -> compute (skip) -> email? (n) -> auth? (n)
    user_input = "\n".join(
        [
            "",  # frontend URL (accept default)
            "2",  # storage type: aws
            "",  # admin email (accept default)
            "5",  # compute: skip
            "n",  # skip email
            "n",  # skip auth
        ]
    )

    with patch("transformerlab_cli.commands.server.ENV_FILE", fake_env):
        result = runner.invoke(app, ["server", "install", "--dry-run"], input=user_input)

    assert result.exit_code == 0
    assert "Dry run complete" in result.output
    assert "No files were written" in result.output
    assert not os.path.exists(fake_env)


def test_server_install_writes_file(tmp_path):
    """Test that install writes the .env file when not in dry-run mode."""
    fake_env = os.path.join(str(tmp_path), ".env")

    user_input = "\n".join(
        [
            "http://myserver.com:8338",  # frontend URL
            "2",  # storage type: aws
            "owner@myserver.com",  # admin email
            "5",  # compute: skip
            "n",  # skip email
            "n",  # skip auth
            "n",  # skip running install script
        ]
    )

    with patch("transformerlab_cli.commands.server.ENV_FILE", fake_env):
        result = runner.invoke(app, ["server", "install"], input=user_input)

    assert result.exit_code == 0
    assert os.path.exists(fake_env)

    with open(fake_env, "r", encoding="utf-8") as f:
        content = f.read()
    assert 'FRONTEND_URL="http://myserver.com:8338"' in content
    assert 'TL_API_URL="http://myserver.com:8338/"' in content
    assert 'TFL_STORAGE_PROVIDER="aws"' in content
    assert 'TLAB_DEFAULT_ADMIN_EMAIL="owner@myserver.com"' in content
    assert 'MULTIUSER="true"' in content
    assert "TRANSFORMERLAB_JWT_SECRET=" in content
    assert "TRANSFORMERLAB_REFRESH_SECRET=" in content


def test_server_install_preserves_jwt_secrets(tmp_path):
    """Test that existing JWT secrets are preserved on reconfigure."""
    fake_env = os.path.join(str(tmp_path), ".env")
    with open(fake_env, "w", encoding="utf-8") as f:
        f.write(
            'TRANSFORMERLAB_JWT_SECRET="existing_jwt"\n'
            'TRANSFORMERLAB_REFRESH_SECRET="existing_refresh"\n'
            'FRONTEND_URL="http://old.com"\n'
        )

    user_input = "\n".join(
        [
            "",  # frontend URL (accept existing default)
            "2",  # storage: aws
            "",  # admin email
            "5",  # compute: skip
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


def test_server_install_storage_localfs(tmp_path):
    """Test choosing localfs storage prompts for a path."""
    fake_env = os.path.join(str(tmp_path), ".env")

    user_input = "\n".join(
        [
            "",  # frontend URL
            "1",  # storage type: localfs
            "/mnt/shared",  # storage path
            "",  # admin email
            "5",  # compute: skip
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


def test_server_install_email_configured(tmp_path):
    """Test configuring SMTP email."""
    fake_env = os.path.join(str(tmp_path), ".env")

    user_input = "\n".join(
        [
            "",  # frontend URL
            "2",  # storage: aws
            "",  # admin email
            "5",  # compute: skip
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


def test_server_install_email_skip(tmp_path):
    """Test skipping email sets dev mode."""
    fake_env = os.path.join(str(tmp_path), ".env")

    user_input = "\n".join(
        [
            "",  # frontend URL
            "2",  # storage: aws
            "",  # admin email
            "5",  # compute: skip
            "n",  # skip email
            "n",  # skip auth
        ]
    )

    with patch("transformerlab_cli.commands.server.ENV_FILE", fake_env):
        result = runner.invoke(app, ["server", "install", "--dry-run"], input=user_input)

    assert result.exit_code == 0
    assert 'EMAIL_METHOD="dev"' in result.output


def test_server_install_admin_info_displayed(tmp_path):
    """Test that admin account info is displayed during install."""
    fake_env = os.path.join(str(tmp_path), ".env")

    user_input = "\n".join(
        [
            "",  # frontend URL
            "2",  # storage: aws
            "owner@example.com",  # admin email
            "5",  # compute: skip
            "n",  # skip email
            "n",  # skip auth
        ]
    )

    with patch("transformerlab_cli.commands.server.ENV_FILE", fake_env):
        result = runner.invoke(app, ["server", "install", "--dry-run"], input=user_input)

    assert result.exit_code == 0
    assert "owner@example.com" in result.output
    assert "admin123" in result.output
    assert "Change the default password" in result.output


# ---------------------------------------------------------------------------
# --config (non-interactive) tests
# ---------------------------------------------------------------------------


def test_server_install_config_dry_run(tmp_path):
    """Test --config with --dry-run reads config and shows output without writing."""
    config_file = os.path.join(str(tmp_path), "my-config.env")
    target_env = os.path.join(str(tmp_path), "target.env")
    with open(config_file, "w", encoding="utf-8") as f:
        f.write(
            'FRONTEND_URL="http://myhost.com:8338"\n'
            'TL_API_URL="http://myhost.com:8338/"\n'
            'TFL_STORAGE_PROVIDER="aws"\n'
            'TFL_REMOTE_STORAGE_ENABLED="true"\n'
            'MULTIUSER="true"\n'
        )

    with patch("transformerlab_cli.commands.server.ENV_FILE", target_env):
        result = runner.invoke(app, ["server", "install", "--config", config_file, "--dry-run"])

    assert result.exit_code == 0
    assert "from config" in result.output
    assert "Loaded configuration from" in result.output
    assert 'FRONTEND_URL="http://myhost.com:8338"' in result.output
    assert "JWT secrets: generated new" in result.output
    assert "Dry run complete" in result.output
    assert not os.path.exists(target_env)


def test_server_install_config_writes_to_env_file(tmp_path):
    """Test --config writes the config to ~/.transformerlab/.env and runs install."""
    config_file = os.path.join(str(tmp_path), "my-config.env")
    target_env = os.path.join(str(tmp_path), "target.env")
    with open(config_file, "w", encoding="utf-8") as f:
        f.write(
            'FRONTEND_URL="http://myhost.com:8338"\n'
            'TFL_STORAGE_PROVIDER="localfs"\n'
            'TFL_STORAGE_URI="/data/transformerlab"\n'
        )

    with (
        patch("transformerlab_cli.commands.server.ENV_FILE", target_env),
        patch("transformerlab_cli.commands.server._run_install_script", return_value=0),
    ):
        result = runner.invoke(app, ["server", "install", "--config", config_file])

    assert result.exit_code == 0
    assert os.path.exists(target_env)

    with open(target_env, "r", encoding="utf-8") as f:
        content = f.read()
    assert 'FRONTEND_URL="http://myhost.com:8338"' in content
    assert 'TFL_STORAGE_PROVIDER="localfs"' in content
    assert "TRANSFORMERLAB_JWT_SECRET=" in content
    assert "TRANSFORMERLAB_REFRESH_SECRET=" in content
    assert 'MULTIUSER="true"' in content


def test_server_install_config_preserves_jwt_secrets(tmp_path):
    """Test --config preserves JWT secrets when they exist in the config file."""
    config_file = os.path.join(str(tmp_path), "my-config.env")
    target_env = os.path.join(str(tmp_path), "target.env")
    with open(config_file, "w", encoding="utf-8") as f:
        f.write(
            'FRONTEND_URL="http://myhost.com:8338"\n'
            'TFL_STORAGE_PROVIDER="aws"\n'
            'TRANSFORMERLAB_JWT_SECRET="my_existing_jwt"\n'
            'TRANSFORMERLAB_REFRESH_SECRET="my_existing_refresh"\n'
        )

    with patch("transformerlab_cli.commands.server.ENV_FILE", target_env):
        result = runner.invoke(app, ["server", "install", "--config", config_file, "--dry-run"])

    assert result.exit_code == 0
    assert "my_existing_jwt" in result.output
    assert "my_existing_refresh" in result.output
    assert "found in config" in result.output


def test_server_install_config_missing_file():
    """Test --config with a nonexistent file exits with error."""
    result = runner.invoke(app, ["server", "install", "--config", "/nonexistent/path.env"])

    assert result.exit_code == 1
    assert "Config file not found" in result.output


def test_server_install_config_empty_file(tmp_path):
    """Test --config with an empty file exits with error."""
    config_file = os.path.join(str(tmp_path), "empty.env")
    with open(config_file, "w", encoding="utf-8") as f:
        f.write("# only comments\n\n")

    result = runner.invoke(app, ["server", "install", "--config", config_file])

    assert result.exit_code == 1
    assert "empty or has no valid" in result.output


def test_server_install_config_shows_validation_warnings(tmp_path):
    """Test --config shows validation warnings but does not block."""
    config_file = os.path.join(str(tmp_path), "warn-config.env")
    target_env = os.path.join(str(tmp_path), "target.env")
    with open(config_file, "w", encoding="utf-8") as f:
        f.write('FRONTEND_URL="http://myhost.com:8338"\nTFL_STORAGE_PROVIDER="azure"\n')

    with patch("transformerlab_cli.commands.server.ENV_FILE", target_env):
        result = runner.invoke(app, ["server", "install", "--config", config_file, "--dry-run"])

    assert result.exit_code == 0
    assert "Configuration warnings" in result.output
    assert "Azure" in result.output


def test_server_install_help_shows_config_option():
    """Test that --config appears in help output."""
    result = runner.invoke(app, ["server", "install", "--help"])
    assert result.exit_code == 0
    assert "--config" in strip_ansi(result.output)
