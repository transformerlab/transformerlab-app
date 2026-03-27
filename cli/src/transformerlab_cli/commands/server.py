import os
import secrets
import shutil
import subprocess
import sys

import typer

from transformerlab_cli.util.ui import console

app = typer.Typer()

ENV_DIR = os.path.join(os.path.expanduser("~"), ".transformerlab")
ENV_FILE = os.path.join(ENV_DIR, ".env")

STORAGE_TYPES = ["aws", "gcp", "azure", "localfs"]
COMPUTE_TYPES = ["skypilot", "slurm", "runpod", "local"]


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


def _check_aws_profile(profile: str = "transformerlab-s3") -> bool:
    """Check if an AWS credentials profile exists."""
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
    console.print("[dim]Where model files and workspace data will be stored.[/dim]")

    # Determine default selection from existing config
    current_provider = existing.get("TFL_STORAGE_PROVIDER", "aws")
    default_idx = STORAGE_TYPES.index(current_provider) + 1 if current_provider in STORAGE_TYPES else 1

    provider = _numbered_choice("Storage type", STORAGE_TYPES, default=default_idx)

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
            if _check_aws_profile():
                console.print("\n[success]AWS profile 'transformerlab-s3' is configured.[/success]")
            else:
                console.print(
                    "\n[bold error]WARNING: AWS profile 'transformerlab-s3' is NOT configured![/bold error]"
                    "\n[error]S3 storage will not work until you set up credentials.[/error]"
                    "\n\nRun this command to configure it:"
                    "\n  [bold]aws configure --profile transformerlab-s3[/bold]"
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


def _prompt_admin() -> dict[str, str]:
    """Display admin account info. The API seeds a hardcoded admin on first startup."""
    console.print("\n[bold header]3. Admin Account[/bold header]")
    console.print(
        "[dim]A default admin account is created automatically on first startup:[/dim]"
        "\n  Email:    [bold]admin@example.com[/bold]"
        "\n  Password: [bold]admin123[/bold]"
        "\n[warning]Change the default password immediately after first login![/warning]"
    )
    return {}


def _prompt_compute(existing: dict[str, str]) -> dict[str, str]:
    """Prompt for compute provider configuration (stub — prints guidance)."""
    console.print("\n[bold header]4. Compute Provider[/bold header]")
    console.print("[dim]Configure how jobs are dispatched to GPU workers.[/dim]")

    if not typer.confirm("Configure a default compute provider?", default=False):
        console.print("[dim]Skipped. You can add providers later with: lab provider add[/dim]")
        return {}

    provider = _numbered_choice("Compute provider", COMPUTE_TYPES, default=1)

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
        return process.returncode
    except KeyboardInterrupt:
        console.print("\n[warning]Script interrupted.[/warning]")
        return 130
    except OSError as e:
        console.print(f"\n[error]Failed to run script: {e}[/error]")
        return 1


def _offer_install_script() -> None:
    """Prompt the user to run the install script after writing config."""
    if not typer.confirm("\nRun the install script now?", default=True):
        console.print("[dim]Skipped. You can run it manually later.[/dim]")
        return
    _run_install_script()


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


@app.command("install")
def server_install(
    dry_run: bool = typer.Option(False, "--dry-run", help="Show configuration without writing any files"),
) -> None:
    """Interactive installer for Transformer Lab Teams edition.

    Generates the configuration file at ~/.transformerlab/.env.
    Use --dry-run to preview the configuration without writing.
    """
    console.print("\n[bold header]Transformer Lab Server Setup[/bold header]")
    console.print("=" * 42)

    # Load existing config
    existing = _load_existing_env(ENV_FILE) if os.path.exists(ENV_FILE) else {}
    if existing:
        console.print(
            f"\n[info]Found existing configuration at {ENV_FILE}[/info]"
            "\n[dim]Current values will be shown as defaults. Press Enter to keep them.[/dim]"
        )

    # Collect configuration from each section
    env_vars: dict[str, str] = {}

    env_vars.update(_prompt_frontend(existing))
    env_vars.update(_prompt_storage(existing))
    env_vars.update(_prompt_admin())
    env_vars.update(_prompt_compute(existing))
    env_vars.update(_prompt_email(existing))
    env_vars.update(_prompt_auth(existing))

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
        if not typer.confirm("\nContinue anyway?", default=False):
            console.print("[dim]Aborted. Re-run to fix the configuration.[/dim]")
            raise typer.Exit(1)

    # Display or write
    if dry_run:
        from rich.panel import Panel
        from rich.syntax import Syntax

        content = _build_env_content(env_vars)
        syntax = Syntax(content, "ini", theme="monokai", line_numbers=True)
        console.print(Panel(syntax, title=f"{ENV_FILE} (dry run)", border_style="dim"))
        console.print("\n[warning]Dry run complete. No files were written.[/warning]")
        raise typer.Exit(0)

    _write_env_file(ENV_FILE, env_vars)
    console.print(f"\n[success]Configuration written to {ENV_FILE}[/success]")

    # Run install script
    _offer_install_script()

    # Next steps
    frontend_url = env_vars.get("FRONTEND_URL", "http://localhost:8338")
    console.print("\n[bold header]Next Steps[/bold header]")
    console.print("  1. Start the server:")
    console.print("     [bold]cd ~/.transformerlab/src && ./run.sh[/bold]")
    console.print(f"  2. Open {frontend_url} in your browser")
    console.print("  3. Log in with [bold]admin@example.com[/bold] / [bold]admin123[/bold]")
    console.print("     [warning]Change the default password immediately![/warning]")


LATEST_VERSION_FILE = os.path.join(ENV_DIR, "src", "LATEST_VERSION")
GITHUB_LATEST_RELEASE_URL = "https://github.com/transformerlab/transformerlab-app/releases/latest"


def _get_current_version() -> str | None:
    """Read the currently installed version from ~/.transformerlab/src/LATEST_VERSION."""
    try:
        return LATEST_VERSION_FILE.read_text().strip()
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
