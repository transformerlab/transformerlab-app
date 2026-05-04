import json
import os
import secrets
import shutil
import subprocess
import sys

import typer

from transformerlab_cli.util import telemetry
from transformerlab_cli.util.ui import console

app = typer.Typer()

ENV_DIR = os.path.join(os.path.expanduser("~"), ".transformerlab")
ENV_FILE = os.path.join(ENV_DIR, ".env")

STORAGE_TYPES = ["Use local filesystem (localfs)", "aws", "gcp", "azure"]
STORAGE_TYPE_VALUES = ["localfs", "aws", "gcp", "azure"]
COMPUTE_TYPES = [
    "Local – run jobs directly on this machine",
    "SkyPilot – connect to a SkyPilot server",
    "Slurm – submit jobs to an HPC/Slurm cluster",
    "RunPod – launch serverless GPU pods on RunPod",
    "Skip – don't configure a compute provider now",
]
COMPUTE_TYPE_VALUES = ["local", "skypilot", "slurm", "runpod", None]

AWS_PROFILE_FALLBACK = "transformerlab-s3"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _load_existing_env(path: str) -> dict[str, str]:
    """Parse an existing .env file into a dict, ignoring comments and blank lines."""
    env: dict[str, str] = {}
    if not os.path.exists(path):
        return env
    with open(path, "r", encoding="utf-8") as f:
        for line in f.read().splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            # Strip surrounding quotes
            value = value.strip().strip('"').strip("'")
            env[key] = value
    return env


def _generate_secret(length: int = 32) -> str:
    """Generate a random hex secret."""
    return secrets.token_hex(length)


def _default_aws_profile() -> str:
    return os.getenv("AWS_PROFILE", AWS_PROFILE_FALLBACK)


def _check_aws_profile(profile: str | None = None) -> bool:
    """Check if an AWS credentials profile exists."""
    profile = profile or _default_aws_profile()
    creds_file = os.path.join(os.path.expanduser("~"), ".aws", "credentials")
    if not os.path.exists(creds_file):
        return False
    try:
        with open(creds_file, "r", encoding="utf-8") as f:
            content = f.read()
        return f"[{profile}]" in content
    except OSError:
        return False


def _numbered_choice(label: str, options: list[str], default: int = 1) -> str:
    """Present a numbered list and return the selected option string."""
    console.print(f"\n[bold label]{label}:[/bold label]")
    for i, opt in enumerate(options, 1):
        console.print(f"  [bold]{i}[/bold]. {opt}")

    while True:
        choice = typer.prompt(f"\nSelect {label.lower()}", default=str(default))
        try:
            idx = int(choice) - 1
            if 0 <= idx < len(options):
                return options[idx]
            console.print(f"[error]Please enter a number between 1 and {len(options)}[/error]")
        except ValueError:
            console.print("[error]Please enter a valid number[/error]")


# ---------------------------------------------------------------------------
# Section prompts — each returns a dict of env vars for that section
# ---------------------------------------------------------------------------


def _prompt_frontend(existing: dict[str, str]) -> dict[str, str]:
    """Prompt for frontend/API URL configuration."""
    console.print("\n[bold header]1. Frontend URL[/bold header]")
    console.print("[dim]The URL where users will access the Transformer Lab web interface.[/dim]")

    default_url = existing.get("FRONTEND_URL", "http://localhost:8338")
    while True:
        url = typer.prompt("Frontend URL", default=default_url)
        url = url.rstrip("/")
        if url.startswith("http://") or url.startswith("https://"):
            break
        console.print("[red]URL must start with http:// or https://[/red]")

    # Derive API URL from frontend URL
    api_url = url.rstrip("/") + "/"

    return {
        "FRONTEND_URL": url,
        "TL_API_URL": api_url,
    }


def _prompt_storage(existing: dict[str, str]) -> dict[str, str]:
    """Prompt for storage backend configuration."""
    console.print("\n[bold header]2. Storage Backend[/bold header]")
    console.print(
        "[dim]The storage backend is central to how Transformer Lab works — it holds\n"
        "model files, workspace data, job status, logs, and artifacts.[/dim]\n"
        "\n"
        "  • [bold]Single machine[/bold]: choose [bold]local filesystem[/bold]. All data stays on this host.\n"
        "    If you have a shared drive (e.g. NFS), you can also choose local filesystem\n"
        "    and point it to the shared mount — but every node must mount that drive at\n"
        "    the [bold]same path[/bold].\n"
        "  • [bold]Multi-node (cloud storage)[/bold]: choose a cloud backend (AWS S3, GCP, Azure).\n"
        "    Every node (controller + workers) must see the same storage so that\n"
        "    job status, logs, and artifacts stay in sync.\n"
        "\n"
        "[dim]More info: [bold]https://lab.cloud/for-teams/advanced-install/cloud-storage[/bold][/dim]"
    )

    # Determine default selection from existing config
    current_provider = existing.get("TFL_STORAGE_PROVIDER", "localfs")
    default_idx = STORAGE_TYPE_VALUES.index(current_provider) + 1 if current_provider in STORAGE_TYPE_VALUES else 1

    label = _numbered_choice("Storage type", STORAGE_TYPES, default=default_idx)
    provider = STORAGE_TYPE_VALUES[STORAGE_TYPES.index(label)]

    env: dict[str, str] = {
        "TFL_STORAGE_PROVIDER": provider,
        "MULTIUSER": "true",
    }

    if provider == "localfs":
        default_path = existing.get("TFL_STORAGE_URI", "/data/transformerlab")
        storage_path = typer.prompt("Storage directory path", default=default_path)
        env["TFL_STORAGE_URI"] = storage_path
    else:
        env["TFL_REMOTE_STORAGE_ENABLED"] = "true"

        if provider == "aws":
            aws_profile = _default_aws_profile()
            if _check_aws_profile():
                console.print(f"\n[success]AWS profile '{aws_profile}' is configured.[/success]")
            else:
                console.print(
                    f"\n[bold error]WARNING: AWS profile '{aws_profile}' is NOT configured![/bold error]"
                    "\n[error]S3 storage will not work until you set up credentials.[/error]"
                    "\n\nRun this command to configure it:"
                    f"\n  [bold]aws configure --profile {aws_profile}[/bold]"
                    "\n[dim]The profile needs permissions to create and manage S3 buckets.[/dim]"
                )
        elif provider == "gcp":
            console.print(
                "\n[info]GCS requires application-default credentials:[/info]"
                "\n  [bold]gcloud auth application-default login[/bold]"
            )
            default_project = existing.get("GCP_PROJECT", "")
            project = typer.prompt(
                "GCP project (optional, press Enter to skip)", default=default_project, show_default=False
            )
            if project.strip():
                env["GCP_PROJECT"] = project.strip()
            env["REMOTE_WORKSPACE_HOST"] = "gcp"

            default_sa_path = existing.get("TFL_GCP_SERVICE_ACCOUNT_JSON_PATH", "")
            sa_path = typer.prompt(
                "Path to service account JSON key file (for remote job launches, press Enter to skip)",
                default=default_sa_path,
                show_default=False,
            ).strip()
            if sa_path:
                sa_path = os.path.expanduser(sa_path)
                if not os.path.isfile(sa_path):
                    console.print(
                        f"[error]File not found: {sa_path} — skipping service account key setup.[/error]"
                        "\n[bold error]WARNING: Remote Job (using GCP for storage) launches will fail without a valid service account key.[/bold error]"
                    )
                else:
                    try:
                        with open(sa_path, "r", encoding="utf-8") as _f:
                            json.load(_f)
                        env["TFL_GCP_SERVICE_ACCOUNT_JSON_PATH"] = sa_path
                    except json.JSONDecodeError:
                        console.print(
                            "[error]File is not valid JSON — skipping service account key setup.[/error]"
                            "\n[bold error]WARNING: Remote Job (using GCP for storage) launches will fail without a valid service account key.[/bold error]"
                        )
                    except OSError as e:
                        console.print(
                            f"[error]Could not read file: {e} — skipping service account key setup.[/error]"
                            "\n[bold error]WARNING: Remote Job (using GCP for storage) launches will fail without a valid service account key.[/bold error]"
                        )
            else:
                console.print(
                    "[bold error]WARNING: No service account key provided. Remote Job (using GCP for storage) launches will fail.[/bold error]"
                    "\n[dim]You can re-run 'lab server init' to configure this later.[/dim]"
                )
        elif provider == "azure":
            console.print("\n[info]Azure Blob Storage authentication:[/info]")
            use_conn_string = typer.confirm("Use a connection string?", default=True)
            if use_conn_string:
                default_conn = existing.get("AZURE_STORAGE_CONNECTION_STRING", "")
                conn_str = typer.prompt("Connection string", default=default_conn, show_default=False)
                env["AZURE_STORAGE_CONNECTION_STRING"] = conn_str
            else:
                default_account = existing.get("AZURE_STORAGE_ACCOUNT", "")
                default_key = existing.get("AZURE_STORAGE_KEY", "")
                account = typer.prompt("Storage account name", default=default_account, show_default=False)
                key = typer.prompt("Storage account key", default=default_key, show_default=False)
                env["AZURE_STORAGE_ACCOUNT"] = account
                env["AZURE_STORAGE_KEY"] = key

    console.print(
        "\n[dim]For more details on configuring storage, see:[/dim]"
        "\n  [bold]https://lab.cloud/for-teams/advanced-install/cloud-storage[/bold]"
    )

    return env


def _prompt_admin(existing: dict[str, str]) -> dict[str, str]:
    """Prompt for the default admin email used during first API startup."""
    console.print("\n[bold header]3. Admin Account[/bold header]")
    default_email = existing.get("TLAB_DEFAULT_ADMIN_EMAIL", "admin@example.com")
    admin_email = typer.prompt("Default admin email", default=default_email).strip()
    if not admin_email:
        admin_email = "admin@example.com"
    console.print(
        "[dim]A default admin account is created automatically on first startup:[/dim]"
        f"\n  Email:    [bold]{admin_email}[/bold]"
        "\n  Password: [bold]admin123[/bold]"
        "\n[warning]Change the default password immediately after first login![/warning]"
    )
    return {"TLAB_DEFAULT_ADMIN_EMAIL": admin_email}


def _prompt_compute(existing: dict[str, str]) -> dict[str, str]:
    """Prompt for compute provider configuration."""
    console.print("\n[bold header]4. Compute Provider[/bold header]")
    console.print(
        "[dim]A compute provider tells Transformer Lab where to run training and\n"
        "inference jobs. Pick the option that matches your hardware setup:[/dim]"
    )

    current = existing.get("DEFAULT_COMPUTE_PROVIDER", "")
    default_idx = (COMPUTE_TYPE_VALUES.index(current) + 1) if current in COMPUTE_TYPE_VALUES else 1

    label = _numbered_choice("Compute provider", COMPUTE_TYPES, default=default_idx)
    provider = COMPUTE_TYPE_VALUES[COMPUTE_TYPES.index(label)]

    if provider is None:
        console.print("[dim]Skipped. You can add providers later with: lab provider add[/dim]")
        return {}

    console.print(
        f"\n[info]Selected [bold]{provider}[/bold] as the default compute provider.[/info]"
        "\n[dim]After installation, configure provider details with:[/dim]"
        f"\n  [bold]lab provider add --type {provider}[/bold]"
    )

    return {"DEFAULT_COMPUTE_PROVIDER": provider}


def _prompt_email(existing: dict[str, str]) -> dict[str, str]:
    """Prompt for SMTP email configuration."""
    console.print("\n[bold header]5. Email (SMTP)[/bold header]")
    console.print("[dim]Required for sending user invitations and signup confirmations.[/dim]")

    if not typer.confirm("Configure SMTP email?", default=False):
        console.print("[dim]Skipped. Email will use dev mode (prints to console).[/dim]")
        return {"EMAIL_METHOD": "dev"}

    env: dict[str, str] = {"EMAIL_METHOD": "smtp"}

    fields = [
        ("SMTP_SERVER", "SMTP server", "smtp.example.com"),
        ("SMTP_PORT", "SMTP port", "587"),
        ("SMTP_USERNAME", "SMTP username", ""),
        ("EMAIL_FROM", "From address", ""),
    ]

    for key, label, fallback in fields:
        default = existing.get(key, fallback)
        value = typer.prompt(label, default=default, show_default=bool(default))
        env[key] = value

    # Password is separate — hide input
    default_pass = existing.get("SMTP_PASSWORD", "")
    env["SMTP_PASSWORD"] = typer.prompt("SMTP password", default=default_pass, hide_input=True, show_default=False)

    return env


def _prompt_auth(existing: dict[str, str]) -> dict[str, str]:
    """Prompt for authentication provider configuration."""
    console.print("\n[bold header]6. Authentication[/bold header]")
    console.print("[dim]Configure how users sign in. Email/password is enabled by default.[/dim]")

    env: dict[str, str] = {
        "EMAIL_AUTH_ENABLED": "true",
        "GOOGLE_OAUTH_ENABLED": "false",
        "GITHUB_OAUTH_ENABLED": "false",
    }

    if not typer.confirm("Configure additional auth providers (OAuth/OIDC)?", default=False):
        console.print("[dim]Using default email/password authentication.[/dim]")
        return env

    # Google OAuth
    if typer.confirm("Enable Google OAuth?", default=existing.get("GOOGLE_OAUTH_ENABLED", "false").lower() == "true"):
        env["GOOGLE_OAUTH_ENABLED"] = "true"
        default_id = existing.get("GOOGLE_OAUTH_CLIENT_ID", "")
        default_secret = existing.get("GOOGLE_OAUTH_CLIENT_SECRET", "")
        env["GOOGLE_OAUTH_CLIENT_ID"] = typer.prompt("Google OAuth Client ID", default=default_id, show_default=False)
        env["GOOGLE_OAUTH_CLIENT_SECRET"] = typer.prompt(
            "Google OAuth Client Secret", default=default_secret, hide_input=True, show_default=False
        )

    # GitHub OAuth
    if typer.confirm("Enable GitHub OAuth?", default=existing.get("GITHUB_OAUTH_ENABLED", "false").lower() == "true"):
        env["GITHUB_OAUTH_ENABLED"] = "true"
        default_id = existing.get("GITHUB_OAUTH_CLIENT_ID", "")
        default_secret = existing.get("GITHUB_OAUTH_CLIENT_SECRET", "")
        env["GITHUB_OAUTH_CLIENT_ID"] = typer.prompt("GitHub OAuth Client ID", default=default_id, show_default=False)
        env["GITHUB_OAUTH_CLIENT_SECRET"] = typer.prompt(
            "GitHub OAuth Client Secret", default=default_secret, hide_input=True, show_default=False
        )

    # OIDC
    if typer.confirm("Enable OIDC (OpenID Connect)?", default=bool(existing.get("OIDC_0_DISCOVERY_URL"))):
        default_url = existing.get("OIDC_0_DISCOVERY_URL", "")
        default_id = existing.get("OIDC_0_CLIENT_ID", "")
        default_secret = existing.get("OIDC_0_CLIENT_SECRET", "")
        default_name = existing.get("OIDC_0_NAME", "")
        env["OIDC_0_DISCOVERY_URL"] = typer.prompt("OIDC Discovery URL", default=default_url, show_default=False)
        env["OIDC_0_CLIENT_ID"] = typer.prompt("OIDC Client ID", default=default_id, show_default=False)
        env["OIDC_0_CLIENT_SECRET"] = typer.prompt(
            "OIDC Client Secret", default=default_secret, hide_input=True, show_default=False
        )
        env["OIDC_0_NAME"] = typer.prompt(
            "OIDC provider name (shown on login button)", default=default_name or "SSO", show_default=True
        )

    return env


def _enabled_auth_providers(env_vars: dict[str, str]) -> list[str]:
    """Return a list of auth provider names enabled in the config."""
    providers: list[str] = []
    if env_vars.get("EMAIL_AUTH_ENABLED", "").lower() == "true":
        providers.append("email")
    if env_vars.get("GOOGLE_OAUTH_ENABLED", "").lower() == "true":
        providers.append("google")
    if env_vars.get("GITHUB_OAUTH_ENABLED", "").lower() == "true":
        providers.append("github")
    if env_vars.get("OIDC_0_DISCOVERY_URL", "").strip():
        providers.append("oidc")
    return providers


# ---------------------------------------------------------------------------
# Config validation
# ---------------------------------------------------------------------------

# Placeholder values that indicate the user didn't provide real input
_PLACEHOLDER_VALUES = {"smtp.example.com", "example.com", ""}


def _validate_config(env_vars: dict[str, str]) -> list[str]:
    """Check env_vars for missing required fields and placeholder values.

    Returns a list of human-readable warning strings. An empty list means
    the configuration looks valid.
    """
    warnings: list[str] = []

    # Azure storage: need either a connection string or account+key
    if env_vars.get("TFL_STORAGE_PROVIDER") == "azure":
        has_conn = bool(env_vars.get("AZURE_STORAGE_CONNECTION_STRING", "").strip())
        has_account = bool(env_vars.get("AZURE_STORAGE_ACCOUNT", "").strip())
        has_key = bool(env_vars.get("AZURE_STORAGE_KEY", "").strip())
        if not has_conn and not (has_account and has_key):
            warnings.append("Azure storage selected but no connection string or account/key provided.")

    # SMTP: check for placeholder server
    if env_vars.get("EMAIL_METHOD") == "smtp":
        server = env_vars.get("SMTP_SERVER", "").strip()
        if server in _PLACEHOLDER_VALUES:
            warnings.append("SMTP is enabled but the server is empty or still set to a placeholder.")
        from_addr = env_vars.get("EMAIL_FROM", "").strip()
        if not from_addr:
            warnings.append("SMTP is enabled but no 'From' address is configured.")

    # OIDC: discovery URL is required when enabled
    if env_vars.get("OIDC_0_CLIENT_ID"):
        discovery = env_vars.get("OIDC_0_DISCOVERY_URL", "").strip()
        if not discovery:
            warnings.append("OIDC is enabled but the discovery URL is empty.")

    # Google OAuth: need client ID and secret
    if env_vars.get("GOOGLE_OAUTH_ENABLED") == "true":
        if not env_vars.get("GOOGLE_OAUTH_CLIENT_ID", "").strip():
            warnings.append("Google OAuth is enabled but the Client ID is empty.")
        if not env_vars.get("GOOGLE_OAUTH_CLIENT_SECRET", "").strip():
            warnings.append("Google OAuth is enabled but the Client Secret is empty.")

    # GitHub OAuth: need client ID and secret
    if env_vars.get("GITHUB_OAUTH_ENABLED") == "true":
        if not env_vars.get("GITHUB_OAUTH_CLIENT_ID", "").strip():
            warnings.append("GitHub OAuth is enabled but the Client ID is empty.")
        if not env_vars.get("GITHUB_OAUTH_CLIENT_SECRET", "").strip():
            warnings.append("GitHub OAuth is enabled but the Client Secret is empty.")

    return warnings


# ---------------------------------------------------------------------------
# Install script runner
# ---------------------------------------------------------------------------

INSTALL_COMMAND = "curl -fsSL https://lab.cloud/install.sh | bash -s -- multiuser_setup"


def _run_install_script() -> int:
    """Run the install/update script, streaming output. Returns the exit code."""
    console.print(f"\n[info]Command:[/info] [bold]{INSTALL_COMMAND}[/bold]\n")
    telemetry.breadcrumb("running_install_script")
    try:
        process = subprocess.run(
            ["bash", "-c", INSTALL_COMMAND],
            stdout=sys.stdout,
            stderr=sys.stderr,
        )
        if process.returncode == 0:
            console.print("\n[success]Script completed successfully.[/success]")
        else:
            console.print(f"\n[error]Script exited with code {process.returncode}.[/error]")
        telemetry.incr("installer.script_completed", exit_code=str(process.returncode))
        return process.returncode
    except KeyboardInterrupt:
        console.print("\n[warning]Script interrupted.[/warning]")
        telemetry.incr("installer.script_completed", exit_code="130")
        return 130
    except OSError as e:
        console.print(f"\n[error]Failed to run script: {e}[/error]")
        telemetry.incr("installer.script_completed", exit_code="1")
        telemetry.capture_error(e)
        return 1


def _offer_install_script() -> int:
    """Prompt the user to run the install script after writing config. Returns exit code."""
    if not typer.confirm("\nRun the install script now?", default=True):
        console.print("[dim]Skipped. You can run it manually later.[/dim]")
        return 0
    return _run_install_script()


# ---------------------------------------------------------------------------
# .env file builder
# ---------------------------------------------------------------------------

# Defines the order of sections and their env keys for output
_ENV_SECTIONS: list[tuple[str, list[str]]] = [
    (
        "Frontend",
        ["FRONTEND_URL", "TL_API_URL"],
    ),
    (
        "Multi-user",
        ["MULTIUSER"],
    ),
    (
        "Storage",
        [
            "TFL_STORAGE_PROVIDER",
            "TFL_REMOTE_STORAGE_ENABLED",
            "TFL_STORAGE_URI",
            "REMOTE_WORKSPACE_HOST",
            "GCP_PROJECT",
            "AZURE_STORAGE_CONNECTION_STRING",
            "AZURE_STORAGE_ACCOUNT",
            "AZURE_STORAGE_KEY",
            "AZURE_STORAGE_SAS_TOKEN",
        ],
    ),
    (
        "JWT Secrets",
        ["TRANSFORMERLAB_JWT_SECRET", "TRANSFORMERLAB_REFRESH_SECRET"],
    ),
    (
        "Compute Provider",
        ["DEFAULT_COMPUTE_PROVIDER", "DISABLE_LOCAL_PROVIDERS"],
    ),
    (
        "Email / SMTP",
        ["EMAIL_METHOD", "SMTP_SERVER", "SMTP_PORT", "SMTP_USERNAME", "SMTP_PASSWORD", "EMAIL_FROM"],
    ),
    (
        "Authentication",
        [
            "TLAB_DEFAULT_ADMIN_EMAIL",
            "EMAIL_AUTH_ENABLED",
            "GOOGLE_OAUTH_ENABLED",
            "GOOGLE_OAUTH_CLIENT_ID",
            "GOOGLE_OAUTH_CLIENT_SECRET",
            "GITHUB_OAUTH_ENABLED",
            "GITHUB_OAUTH_CLIENT_ID",
            "GITHUB_OAUTH_CLIENT_SECRET",
            "OIDC_0_DISCOVERY_URL",
            "OIDC_0_CLIENT_ID",
            "OIDC_0_CLIENT_SECRET",
            "OIDC_0_NAME",
        ],
    ),
]


def _build_env_content(env_vars: dict[str, str]) -> str:
    """Build the .env file content string, grouped by section."""
    lines: list[str] = []
    for section_name, keys in _ENV_SECTIONS:
        section_lines: list[str] = []
        for key in keys:
            if key in env_vars:
                section_lines.append(f'{key}="{env_vars[key]}"')
        if section_lines:
            lines.append(f"# {section_name}")
            lines.extend(section_lines)
            lines.append("")  # blank separator

    # Catch any keys not in the predefined sections
    known_keys = {k for _, keys in _ENV_SECTIONS for k in keys}
    extra = {k: v for k, v in env_vars.items() if k not in known_keys}
    if extra:
        lines.append("# Other")
        for key, value in sorted(extra.items()):
            lines.append(f'{key}="{value}"')
        lines.append("")

    return "\n".join(lines)


def _write_env_file(path: str, env_vars: dict[str, str]) -> None:
    """Write the env vars to a .env file, creating directories as needed.

    If *path* already exists it is backed up to ``<path>.bak`` before
    overwriting so the previous configuration can be recovered.

    Raises typer.Exit(1) on permission or OS errors so the installer does not
    continue with a missing or partial configuration.
    """
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)

        # Back up existing file before overwriting
        if os.path.exists(path):
            from datetime import datetime

            timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
            backup_path = f"{path}.{timestamp}"
            shutil.copy2(path, backup_path)
            console.print(f"[dim]Existing config backed up to {backup_path}[/dim]")

        content = _build_env_content(env_vars)
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
    except PermissionError:
        console.print(
            f"\n[error]Permission denied: cannot write to {path}[/error]"
            "\n[dim]Check directory permissions or run with appropriate privileges.[/dim]"
        )
        raise typer.Exit(1)
    except OSError as e:
        console.print(f"\n[error]Failed to write configuration: {e}[/error]")
        raise typer.Exit(1)


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------


def _print_next_steps(env_vars: dict[str, str]) -> None:
    """Print post-install guidance."""
    frontend_url = env_vars.get("FRONTEND_URL", "http://localhost:8338")
    admin_email = env_vars.get("TLAB_DEFAULT_ADMIN_EMAIL", "admin@example.com")
    console.print("\n[bold header]Next Steps[/bold header]")
    console.print("  1. Start the server:")
    console.print("     [bold]cd ~/.transformerlab/src && ./run.sh[/bold]")
    console.print(f"  2. Open {frontend_url} in your browser")
    console.print(f"  3. Log in with [bold]{admin_email}[/bold] / [bold]admin123[/bold]")
    console.print("     [warning]Change the default password immediately![/warning]")


@app.command("install")
def server_install(
    dry_run: bool = typer.Option(False, "--dry-run", help="Show configuration without writing any files"),
    config: str = typer.Option(
        "",
        "--config",
        help="Path to a .env config file. Skips interactive prompts and installs using the provided config.",
    ),
) -> None:
    """Installer for Transformer Lab Teams edition.

    Generates the configuration file at ~/.transformerlab/.env.
    Use --dry-run to preview the configuration without writing.
    Use --config <path> to skip prompts and install from a pre-written .env file.
    """
    src_dir = os.path.realpath(os.path.expanduser("~/.transformerlab/src"))
    cwd = os.path.realpath(os.getcwd())
    if cwd == src_dir or cwd.startswith(src_dir + os.sep):
        console.print(
            "\n[error]You are running this command from inside ~/.transformerlab/src, "
            "which is deleted during installation.[/error]\n"
            "Please change to a different directory and try again:\n\n"
            "  cd ~ && lab server install\n"
        )
        raise typer.Exit(1)

    if config:
        _install_from_config(config_path=config, dry_run=dry_run)
    else:
        _install_interactive(dry_run=dry_run)


def _install_from_config(config_path: str, dry_run: bool) -> None:
    """Install using a pre-written .env config file (no prompts)."""
    console.print("\n[bold header]Transformer Lab Server Setup (from config)[/bold header]")
    console.print("=" * 52)

    telemetry.init(app_version=_get_current_version())
    telemetry.incr("installer.start", mode="config_file", had_existing_config="false")

    if not os.path.exists(config_path):
        console.print(f"\n[error]Config file not found: {config_path}[/error]")
        telemetry.incr("installer.error", reason="config_file_not_found")
        telemetry.flush()
        raise typer.Exit(1)

    env_vars = _load_existing_env(config_path)
    if not env_vars:
        console.print(f"\n[error]Config file is empty or has no valid key=value pairs: {config_path}[/error]")
        telemetry.incr("installer.error", reason="config_file_empty")
        telemetry.flush()
        raise typer.Exit(1)

    console.print(f"\n[info]Loaded configuration from {config_path}[/info]")
    telemetry.breadcrumb("loaded_config_file")

    # Generate JWT secrets if not provided in the config
    if env_vars.get("TRANSFORMERLAB_JWT_SECRET") and env_vars.get("TRANSFORMERLAB_REFRESH_SECRET"):
        console.print("[dim]JWT secrets: found in config[/dim]")
    else:
        env_vars["TRANSFORMERLAB_JWT_SECRET"] = _generate_secret()
        env_vars["TRANSFORMERLAB_REFRESH_SECRET"] = _generate_secret()
        console.print("[dim]JWT secrets: generated new[/dim]")

    # Ensure MULTIUSER is always set
    env_vars.setdefault("MULTIUSER", "true")

    # Track choices from the config file
    telemetry.incr(
        "installer.storage_selected",
        provider=env_vars.get("TFL_STORAGE_PROVIDER", "unknown"),
    )
    if env_vars.get("DEFAULT_COMPUTE_PROVIDER"):
        telemetry.incr(
            "installer.compute_selected",
            provider=env_vars["DEFAULT_COMPUTE_PROVIDER"],
        )
    telemetry.incr(
        "installer.email_configured",
        method=env_vars.get("EMAIL_METHOD", "not_set"),
    )
    for auth_provider in _enabled_auth_providers(env_vars):
        telemetry.incr("installer.auth_provider", provider=auth_provider)

    # Validate
    config_warnings = _validate_config(env_vars)
    if config_warnings:
        console.print("\n[bold warning]Configuration warnings:[/bold warning]")
        for w in config_warnings:
            console.print(f"  [warning]• {w}[/warning]")
        telemetry.incr("installer.validation_warnings", len(config_warnings))

    # Display or write
    if dry_run:
        from rich.panel import Panel
        from rich.syntax import Syntax

        content = _build_env_content(env_vars)
        syntax = Syntax(content, "ini", theme="monokai", line_numbers=True)
        console.print(Panel(syntax, title=f"{ENV_FILE} (dry run)", border_style="dim"))
        console.print("\n[warning]Dry run complete. No files were written.[/warning]")
        telemetry.incr("installer.dry_run")
        telemetry.flush()
        raise typer.Exit(0)

    telemetry.breadcrumb("writing_env_file")
    _write_env_file(ENV_FILE, env_vars)
    console.print(f"\n[success]Configuration written to {ENV_FILE}[/success]")

    # Run install script automatically (no prompt in config mode)
    exit_code = _run_install_script()
    if exit_code != 0:
        telemetry.incr("installer.error", reason="install_script_failed")
        telemetry.flush()
        raise typer.Exit(exit_code)

    telemetry.incr("installer.success")
    telemetry.flush()
    _print_next_steps(env_vars)


def _install_interactive(dry_run: bool) -> None:
    """Run the installer with interactive prompts."""
    console.print("\n[bold header]Transformer Lab Server Setup[/bold header]")
    console.print("=" * 42)

    # Load existing config
    existing = _load_existing_env(ENV_FILE) if os.path.exists(ENV_FILE) else {}
    if existing:
        console.print(
            f"\n[info]Found existing configuration at {ENV_FILE}[/info]"
            "\n[dim]Current values will be shown as defaults. Press Enter to keep them.[/dim]"
        )

    telemetry.init(app_version=_get_current_version())
    telemetry.incr("installer.start", mode="interactive", had_existing_config=str(bool(existing)))

    # Collect configuration from each section
    env_vars: dict[str, str] = {}

    env_vars.update(_prompt_frontend(existing))

    env_vars.update(_prompt_storage(existing))
    telemetry.incr(
        "installer.storage_selected",
        provider=env_vars.get("TFL_STORAGE_PROVIDER", "unknown"),
    )

    env_vars.update(_prompt_admin(existing))

    env_vars.update(_prompt_compute(existing))
    if env_vars.get("DEFAULT_COMPUTE_PROVIDER"):
        telemetry.incr(
            "installer.compute_selected",
            provider=env_vars["DEFAULT_COMPUTE_PROVIDER"],
        )

    env_vars.update(_prompt_email(existing))
    telemetry.incr(
        "installer.email_configured",
        method=env_vars.get("EMAIL_METHOD", "not_set"),
    )

    env_vars.update(_prompt_auth(existing))
    for auth_provider in _enabled_auth_providers(env_vars):
        telemetry.incr("installer.auth_provider", provider=auth_provider)

    # JWT secrets: preserve existing, generate if missing
    jwt_secret = existing.get("TRANSFORMERLAB_JWT_SECRET")
    refresh_secret = existing.get("TRANSFORMERLAB_REFRESH_SECRET")
    if jwt_secret and refresh_secret:
        env_vars["TRANSFORMERLAB_JWT_SECRET"] = jwt_secret
        env_vars["TRANSFORMERLAB_REFRESH_SECRET"] = refresh_secret
        console.print("\n[dim]JWT secrets: kept existing[/dim]")
    else:
        env_vars["TRANSFORMERLAB_JWT_SECRET"] = _generate_secret()
        env_vars["TRANSFORMERLAB_REFRESH_SECRET"] = _generate_secret()
        console.print("\n[dim]JWT secrets: generated new[/dim]")

    # Ensure MULTIUSER is always set
    env_vars.setdefault("MULTIUSER", "true")

    # Validate before writing
    config_warnings = _validate_config(env_vars)
    if config_warnings:
        console.print("\n[bold warning]Configuration warnings:[/bold warning]")
        for w in config_warnings:
            console.print(f"  [warning]• {w}[/warning]")
        telemetry.incr("installer.validation_warnings", len(config_warnings))
        if not typer.confirm("\nContinue anyway?", default=False):
            console.print("[dim]Aborted. Re-run to fix the configuration.[/dim]")
            telemetry.incr("installer.error", reason="user_aborted_after_warnings")
            telemetry.flush()
            raise typer.Exit(1)

    # Display or write
    if dry_run:
        from rich.panel import Panel
        from rich.syntax import Syntax

        content = _build_env_content(env_vars)
        syntax = Syntax(content, "ini", theme="monokai", line_numbers=True)
        console.print(Panel(syntax, title=f"{ENV_FILE} (dry run)", border_style="dim"))
        console.print("\n[warning]Dry run complete. No files were written.[/warning]")
        telemetry.incr("installer.dry_run")
        telemetry.flush()
        raise typer.Exit(0)

    telemetry.breadcrumb("writing_env_file")
    _write_env_file(ENV_FILE, env_vars)
    console.print(f"\n[success]Configuration written to {ENV_FILE}[/success]")

    # Run install script
    telemetry.breadcrumb("offering_install_script")
    exit_code = _offer_install_script()
    if exit_code != 0:
        telemetry.incr("installer.error", reason="install_script_failed")
        telemetry.flush()
        raise typer.Exit(exit_code)

    telemetry.incr("installer.success")
    telemetry.flush()
    _print_next_steps(env_vars)


LATEST_VERSION_FILE = os.path.join(ENV_DIR, "src", "LATEST_VERSION")
GITHUB_LATEST_RELEASE_URL = "https://github.com/transformerlab/transformerlab-app/releases/latest"


def _get_current_version() -> str | None:
    """Read the currently installed version from ~/.transformerlab/src/LATEST_VERSION."""
    try:
        with open(LATEST_VERSION_FILE, "r", encoding="utf-8") as f:
            return f.read().strip() or None
    except OSError:
        return None


def _get_latest_version() -> str | None:
    """Resolve the latest release version from GitHub by following the redirect."""
    try:
        import httpx

        response = httpx.head(GITHUB_LATEST_RELEASE_URL, follow_redirects=True, timeout=10)
        # The final URL looks like .../releases/tag/v0.30.3
        return response.url.path.rsplit("/", 1)[-1]
    except Exception:
        return None


@app.command("version")
def server_version() -> None:
    """Display the server version and check for updates."""
    import json

    from transformerlab_cli.state import cli_state

    current = _get_current_version()

    with console.status("[dim]Checking latest version...[/dim]", spinner="dots"):
        latest = _get_latest_version()

    # Determine if an update is available (only when latest > current)
    update_available = False
    if current and latest:
        from transformerlab_cli.util.pypi import _parse_version

        try:
            current_clean = current.lstrip("v")
            latest_clean = latest.lstrip("v")
            update_available = _parse_version(latest_clean) > _parse_version(current_clean)
        except ValueError:
            update_available = False

    if cli_state.output_format == "json":
        data: dict[str, object] = {
            "installed_version": current,
            "latest_version": latest,
            "update_available": update_available,
        }
        if update_available:
            data["upgrade_command"] = "lab server update"
        print(json.dumps(data))
    else:
        if current:
            console.print(f"{current}", highlight=False)
        else:
            console.print("[warning]Server is not installed.[/warning]")

        if update_available:
            console.print(
                f"[yellow]Update available:[/yellow] {latest}\nRun [bold]lab server update[/bold] to upgrade."
            )
        elif current and latest:
            console.print("[green]Server is up to date.[/green]")
        elif not latest:
            console.print("[dim]Could not check for updates.[/dim]")


def _find_server_pids(port: int) -> list[int]:
    """Find PIDs of processes listening on the given port."""
    pids: list[int] = []
    try:
        result = subprocess.run(
            ["lsof", "-ti", f":{port}"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0 and result.stdout.strip():
            for line in result.stdout.strip().splitlines():
                line = line.strip()
                if line.isdigit():
                    pids.append(int(line))
    except (FileNotFoundError, subprocess.TimeoutExpired):
        # lsof not available, try ss/netstat as fallback (Linux)
        try:
            result = subprocess.run(
                ["ss", "-tlnp", f"sport = :{port}"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if result.returncode == 0:
                import re

                for match in re.finditer(r"pid=(\d+)", result.stdout):
                    pids.append(int(match.group(1)))
        except (FileNotFoundError, subprocess.TimeoutExpired):
            pass
    return sorted(set(pids))


@app.command("stop")
def server_stop(
    port: int = typer.Option(8338, "--port", help="Port the server is running on"),
    force: bool = typer.Option(False, "--force", "-f", help="Force kill (SIGKILL) instead of graceful shutdown"),
) -> None:
    """Stop the Transformer Lab server."""
    pids = _find_server_pids(port)
    if not pids:
        console.print(f"[warning]No server process found on port {port}.[/warning]")
        raise typer.Exit(0)

    import signal

    sig = signal.SIGKILL if force else signal.SIGTERM
    sig_name = "SIGKILL" if force else "SIGTERM"

    for pid in pids:
        try:
            os.kill(pid, sig)
            console.print(f"[success]✓[/success] Sent {sig_name} to process {pid}")
        except ProcessLookupError:
            console.print(f"[dim]Process {pid} already exited.[/dim]")
        except PermissionError:
            console.print(f"[error]Error:[/error] Permission denied killing process {pid}. Try with sudo.")
            raise typer.Exit(1)

    # Wait briefly and verify
    import time

    time.sleep(1)
    remaining = _find_server_pids(port)
    if remaining:
        console.print(f"[warning]Processes still running on port {port}: {remaining}[/warning]")
        if not force:
            console.print("[dim]Try [bold]lab server stop --force[/bold] to force kill.[/dim]")
    else:
        console.print(f"[success]✓[/success] Server stopped on port {port}.")


@app.command("start")
def server_start(
    port: int = typer.Option(8338, "--port", help="Port to start the server on"),
    foreground: bool = typer.Option(False, "--foreground", help="Run in the foreground instead of background"),
) -> None:
    """Start the Transformer Lab server."""
    existing = _find_server_pids(port)
    if existing:
        console.print(f"[warning]Server already running on port {port} (PIDs: {existing}).[/warning]")
        console.print("[dim]Run [bold]lab server stop[/bold] first, or use [bold]lab server restart[/bold].[/dim]")
        raise typer.Exit(1)

    src_dir = os.path.join(os.path.expanduser("~"), ".transformerlab", "src")
    run_sh = os.path.join(src_dir, "run.sh")

    if not os.path.isfile(run_sh):
        console.print("[error]Error:[/error] Server not installed. Run [bold]lab server install[/bold] first.")
        raise typer.Exit(1)

    # run.sh sets PORT="8338" unconditionally, so the env var is ignored.
    # Pass the port via the script's -p flag instead.
    cmd = ["bash", run_sh, "-p", str(port)]

    if foreground:
        console.print(f"[success]Starting server on port {port} (foreground)...[/success]")
        result = subprocess.run(cmd, cwd=src_dir)
        raise typer.Exit(result.returncode)
    else:
        import time

        log_path = os.path.join(os.path.expanduser("~"), ".transformerlab", "server.log")
        log_file = open(log_path, "a", encoding="utf-8")
        proc = subprocess.Popen(
            cmd,
            cwd=src_dir,
            stdout=log_file,
            stderr=log_file,
            start_new_session=True,
        )

        # Give the launcher a moment, then verify it didn't die immediately.
        # We don't wait for uvicorn to bind the port (that can take many seconds);
        # we only catch the case where run.sh exits before the server is even up.
        time.sleep(1)
        if proc.poll() is not None:
            console.print(f"[error]Error:[/error] Server failed to start (run.sh exited with code {proc.returncode}).")
            console.print(f"[dim]Check logs: {log_path}[/dim]")
            raise typer.Exit(1)

        console.print(f"[success]✓[/success] Server starting in background (PID {proc.pid}) on port {port}.")
        console.print(f"[dim]Logs: {log_path}[/dim]")


@app.command("restart")
def server_restart(
    port: int = typer.Option(8338, "--port", help="Port the server is running on"),
) -> None:
    """Restart the Transformer Lab server (stop then start)."""
    pids = _find_server_pids(port)
    if pids:
        import signal
        import time

        for pid in pids:
            try:
                os.kill(pid, signal.SIGTERM)
                console.print(f"[success]✓[/success] Sent SIGTERM to process {pid}")
            except ProcessLookupError:
                pass

        # Wait for graceful shutdown
        for _ in range(10):
            time.sleep(0.5)
            if not _find_server_pids(port):
                break
        else:
            remaining = _find_server_pids(port)
            if remaining:
                console.print("[warning]Graceful shutdown timed out, force killing...[/warning]")
                for pid in remaining:
                    try:
                        os.kill(pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                time.sleep(0.5)

        # Verify the server is actually stopped before trying to start a new one.
        still_running = _find_server_pids(port)
        if still_running:
            console.print(
                f"[error]Error:[/error] Could not stop processes on port {port}: {still_running}. Aborting restart."
            )
            raise typer.Exit(1)

        console.print("[success]✓[/success] Server stopped.")
    else:
        console.print(f"[dim]No server running on port {port}.[/dim]")

    # Start
    server_start(port=port, foreground=False)


@app.command("update")
def server_update() -> None:
    """Update Transformer Lab to the latest version."""
    console.print("\n[bold header]Transformer Lab Server Update[/bold header]")

    current = _get_current_version()
    if current:
        console.print(f"\n[label]Installed version:[/label] [bold]{current}[/bold]")
    else:
        console.print("\n[warning]No existing installation detected.[/warning]")

    with console.status("[dim]Checking latest version...[/dim]", spinner="dots"):
        latest = _get_latest_version()

    if latest:
        console.print(f"[label]Latest version:[/label]    [bold]{latest}[/bold]")
        if current and current == latest:
            console.print("\n[success]Already up to date.[/success]")
            if not typer.confirm("Re-run the install script anyway?", default=False):
                raise typer.Exit(0)
        else:
            if not typer.confirm(f"\nUpdate from {current or 'unknown'} to {latest}?", default=True):
                raise typer.Exit(0)
    else:
        console.print("[dim]Could not check latest version.[/dim]")
        if not typer.confirm("Proceed with update?", default=True):
            raise typer.Exit(0)

    exit_code = _run_install_script()
    if exit_code != 0:
        raise typer.Exit(exit_code)
