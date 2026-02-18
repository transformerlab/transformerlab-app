"""
This is the main file that gets called by popen when a plugin is run.
It must get passed:

    --plugin_dir            full path to the directory containing the plugin

All other parameters can be passed as if you are calling the plugin directly.

"""

import os
import sys
import argparse
import traceback
import sqlite3
from typing import Optional


def get_db_config_value(key: str, team_id: Optional[str] = None, user_id: Optional[str] = None) -> Optional[str]:
    """
    Read config values directly from sqlite without importing transformerlab.plugin.
    This keeps harness startup independent from heavy ML dependencies.
    """
    from lab import HOME_DIR

    db_path = f"{HOME_DIR}/llmlab.sqlite3"
    db = sqlite3.connect(db_path, isolation_level=None)
    db.execute("PRAGMA busy_timeout=30000")
    try:
        # Priority 1: user-specific config (requires both user_id and team_id)
        if user_id and team_id:
            cursor = db.execute(
                "SELECT value FROM config WHERE key = ? AND user_id = ? AND team_id = ?", (key, user_id, team_id)
            )
            row = cursor.fetchone()
            cursor.close()
            if row is not None:
                return row[0]

        # Priority 2: team-wide config
        if team_id:
            cursor = db.execute(
                "SELECT value FROM config WHERE key = ? AND user_id IS NULL AND team_id = ?", (key, team_id)
            )
            row = cursor.fetchone()
            cursor.close()
            if row is not None:
                return row[0]

        # Priority 3: global config
        cursor = db.execute("SELECT value FROM config WHERE key = ? AND user_id IS NULL AND team_id IS NULL", (key,))
        row = cursor.fetchone()
        cursor.close()
        return row[0] if row is not None else None
    finally:
        db.close()


parser = argparse.ArgumentParser()
parser.add_argument("--plugin_dir", type=str, required=True)
args, unknown = parser.parse_known_args()


def configure_plugin_runtime_library_paths(plugin_dir: str) -> None:
    """
    Prefer CUDA/NCCL libraries from the plugin venv over system-wide libraries.
    This reduces CUDA symbol mismatches caused by stale host NCCL installs.
    """
    if os.name == "nt":
        return

    venv_path = os.path.join(plugin_dir, "venv")
    if not os.path.isdir(venv_path):
        return

    pyver = f"python{sys.version_info.major}.{sys.version_info.minor}"
    site_packages = os.path.join(venv_path, "lib", pyver, "site-packages")

    candidate_paths: list[str] = []
    torch_lib = os.path.join(site_packages, "torch", "lib")
    if os.path.isdir(torch_lib):
        candidate_paths.append(torch_lib)

    nvidia_root = os.path.join(site_packages, "nvidia")
    if os.path.isdir(nvidia_root):
        for pkg_name in os.listdir(nvidia_root):
            lib_dir = os.path.join(nvidia_root, pkg_name, "lib")
            if os.path.isdir(lib_dir):
                candidate_paths.append(lib_dir)

    if not candidate_paths:
        return

    existing_paths = [p for p in os.environ.get("LD_LIBRARY_PATH", "").split(os.pathsep) if p]
    candidate_norm = {os.path.normpath(c) for c in candidate_paths}

    merged = list(candidate_paths)
    for path in existing_paths:
        if os.path.normpath(path) not in candidate_norm:
            merged.append(path)

    if merged != existing_paths:
        os.environ["LD_LIBRARY_PATH"] = os.pathsep.join(merged)
        print("Configured LD_LIBRARY_PATH for plugin runtime libraries")


configure_plugin_runtime_library_paths(args.plugin_dir)


def set_config_env_vars(
    env_var: str,
    target_env_var: Optional[str] = None,
    user_id: Optional[str] = None,
    team_id: Optional[str] = None,
) -> None:
    try:
        value = get_db_config_value(env_var, user_id=user_id, team_id=team_id)
        if value:
            os.environ[target_env_var] = value
            print(f"Set {target_env_var} from {'user' if user_id else 'team'} config")
    except Exception as e:
        print(f"Warning: Could not set {target_env_var} from {'user' if user_id else 'team'} config: {e}")


# Set organization context from environment variable if provided
# This allows plugins to have the correct org context without leaking to the API
org_id = os.environ.get("_TFL_ORG_ID")
user_id = os.environ.get("_TFL_USER_ID")  # Optional user_id for user-specific configs

if org_id:
    try:
        from lab.dirs import set_organization_id

        set_organization_id(org_id)

        try:
            # Set HuggingFace token
            set_config_env_vars("HuggingfaceUserAccessToken", "HF_TOKEN", user_id=user_id, team_id=org_id)
            # Set WANDB API key
            set_config_env_vars("WANDB_API_KEY", "WANDB_API_KEY", user_id=user_id, team_id=org_id)
            # Set AI provider keys
            set_config_env_vars("OPENAI_API_KEY", "OPENAI_API_KEY", user_id=user_id, team_id=org_id)
            set_config_env_vars("ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY", user_id=user_id, team_id=org_id)
            set_config_env_vars("CUSTOM_MODEL_API_KEY", "CUSTOM_MODEL_API_KEY", user_id=user_id, team_id=org_id)
            # Azure OpenAI details (JSON string)
            set_config_env_vars("AZURE_OPENAI_DETAILS", "AZURE_OPENAI_DETAILS", user_id=user_id, team_id=org_id)
        except Exception as e:
            print(f"Warning: Could not set team/user-specific config env vars: {e}")
    except Exception as e:
        print(f"Warning: Could not set organization context: {e}")

# Add the plugin directory to the path
# Note that this will allow the plugin to import files in this file's directory
# So the plugin is able to import the SDK
sys.path.append(args.plugin_dir)

try:
    import main
except ImportError as e:
    print(f"Error executing plugin: {e}")
    traceback.print_exc()
    if "ncclCommShrink" in str(e):
        print(
            "Detected CUDA/NCCL mismatch while importing torch. "
            "Reinstall the plugin venv with a torch build matching this machine's CUDA runtime."
        )

    # if e is a ModuleNotFoundError, the plugin is missing a required package
    if isinstance(e, ModuleNotFoundError):
        print("ModuleNotFoundError means a Python package is missing. This is usually fixed by reinstalling the plugin")

    # Clear organization context on error
    if org_id:
        try:
            from lab.dirs import set_organization_id

            set_organization_id(None)
        except Exception:
            pass

    sys.exit(1)

# Also execute the function main.main(), if it exists
try:
    if "main" in dir(main) and callable(getattr(main, "main")):
        main.main()
finally:
    # Clear organization context when plugin exits
    if org_id:
        try:
            from lab.dirs import set_organization_id

            set_organization_id(None)
        except Exception:
            pass
