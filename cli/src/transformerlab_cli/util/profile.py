"""Single source of truth for the active CLI profile and its on-disk paths.

Selection is per-process (no stored "active profile" pointer): the precedence is
``--profile`` flag > ``LAB_PROFILE`` env var > ``"default"``. This is what makes two
parallel ``lab`` commands against different servers safe — there is no shared mutable
"current profile" file for one process to clobber on another.

Layout:
    default -> <CONFIG_DIR>/                 (legacy root, e.g. ~/.lab)
    <name>  -> <CONFIG_DIR>/profiles/<name>/

All paths derive from ``shared.CONFIG_DIR`` (the lab home), which tests monkeypatch to a
tmp dir, so isolation keeps working without a new fixture.
"""

import os
import re
import shutil

from transformerlab_cli.util import shared

DEFAULT_PROFILE = "default"
_VALID_NAME = re.compile(r"^[A-Za-z0-9._-]+$")

# Resolved active profile name for this process. ``None`` means "not yet resolved";
# callers that read paths before init treat it as the default profile.
_active_profile: str | None = None


def _validate_name(name: str) -> str:
    """Return a clean profile name or raise ValueError. Blocks path traversal and dot-only names."""
    cleaned = (name or "").strip()
    if not cleaned or not _VALID_NAME.match(cleaned) or set(cleaned) == {"."}:
        raise ValueError(f"Invalid profile name '{name}'. Use letters, digits, '.', '_' or '-' only.")
    return cleaned


def resolve_profile_name(cli_override: str | None) -> str:
    """Apply precedence: explicit flag > LAB_PROFILE env > 'default'.

    Blank/whitespace values fall through. A non-blank but malformed name raises.
    """
    for candidate in (cli_override, os.environ.get("LAB_PROFILE")):
        if candidate is not None and candidate.strip():
            return _validate_name(candidate)
    return DEFAULT_PROFILE


def set_active(name: str | None) -> None:
    """Set the active profile name for this process (None resets to unresolved)."""
    global _active_profile
    _active_profile = _validate_name(name) if name else None


def current_profile_name() -> str:
    """Return the active profile name, or 'default' if none resolved yet."""
    return _active_profile or DEFAULT_PROFILE


def config_dir(name: str | None = None) -> str:
    """Directory holding a profile's config.json + credentials."""
    profile_name = name or current_profile_name()
    if profile_name == DEFAULT_PROFILE:
        return shared.CONFIG_DIR
    return os.path.join(shared.CONFIG_DIR, "profiles", _validate_name(profile_name))


def config_path(name: str | None = None) -> str:
    return os.path.join(config_dir(name), "config.json")


def credentials_dir(name: str | None = None) -> str:
    return config_dir(name)


def credentials_path(name: str | None = None) -> str:
    return os.path.join(config_dir(name), "credentials")


def list_profiles() -> list[str]:
    """Return profile names: always 'default', plus sorted named profiles on disk."""
    names = [DEFAULT_PROFILE]
    profiles_root = os.path.join(shared.CONFIG_DIR, "profiles")
    if os.path.isdir(profiles_root):
        named = [entry for entry in os.listdir(profiles_root) if os.path.isdir(os.path.join(profiles_root, entry))]
        names.extend(sorted(named))
    return names


def profile_has_credentials(name: str) -> bool:
    return os.path.exists(credentials_path(name))


def delete_profile(name: str) -> None:
    """Remove a named profile directory. Refuses to delete 'default'."""
    clean = _validate_name(name)
    if clean == DEFAULT_PROFILE:
        raise ValueError("Cannot delete the 'default' profile.")
    target = config_dir(clean)
    if os.path.isdir(target):
        shutil.rmtree(target)


def init_profile(name: str) -> None:
    """Bind this process to ``name`` and reset cached path-derived state.

    Called once from the root callback before any command body runs. The lazy import
    avoids an import cycle (config imports profile, not the reverse).
    """
    set_active(name)

    import transformerlab_cli.util.config as config_mod

    config_mod.cached_config = None
