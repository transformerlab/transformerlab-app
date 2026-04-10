"""Best-effort Sentry telemetry for the CLI installer.

All public functions silently swallow exceptions so telemetry never
interferes with the installer's normal operation.
"""

import platform
import sys

_initialized = False

# Sentry DSN for installer telemetry.
# Injected at build time by the CI release workflow (sed replacement).
# When empty, all telemetry is silently disabled.
_INSTALLER_DSN = "__SENTRY_DSN_PLACEHOLDER__"


def _get_cli_version() -> str:
    try:
        from importlib.metadata import version

        return version("transformerlab-cli")
    except Exception:
        return "unknown"


def init(app_version: str | None = None) -> None:
    """Initialise Sentry for installer telemetry.

    Call once at the start of the install command. *app_version* is the
    currently-installed Transformer Lab server version (may be ``None``
    if the server has not been installed yet).
    """
    global _initialized
    if not _INSTALLER_DSN or _INSTALLER_DSN.startswith("__"):
        return
    try:
        import sentry_sdk

        sentry_sdk.init(
            dsn=_INSTALLER_DSN,
            default_integrations=False,
            send_default_pii=False,
            traces_sample_rate=0,
        )
        sentry_sdk.set_attribute("cli_version", _get_cli_version())
        sentry_sdk.set_attribute("python_version", platform.python_version())
        sentry_sdk.set_attribute("platform", sys.platform)
        sentry_sdk.set_attribute("app_version", app_version or "not_installed")
        _initialized = True
    except Exception:
        pass


def incr(key: str, value: int = 1, **tags: str) -> None:
    """Increment a Sentry metric counter."""
    if not _initialized:
        return
    try:
        from sentry_sdk import metrics

        metrics.count(key, float(value), attributes=tags)
    except Exception:
        pass


def breadcrumb(message: str, **data: str) -> None:
    """Record a breadcrumb (only sent to Sentry if an error is captured)."""
    if not _initialized:
        return
    try:
        import sentry_sdk

        sentry_sdk.add_breadcrumb(message=message, data=data, level="info")
    except Exception:
        pass


def capture_error(exc: Exception) -> None:
    """Capture an exception in Sentry."""
    if not _initialized:
        return
    try:
        import sentry_sdk

        sentry_sdk.capture_exception(exc)
    except Exception:
        pass


def flush() -> None:
    """Flush pending telemetry. Call before the CLI process exits."""
    if not _initialized:
        return
    try:
        import sentry_sdk

        sentry_sdk.flush(timeout=2)
    except Exception:
        pass
