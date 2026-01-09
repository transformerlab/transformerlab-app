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


parser = argparse.ArgumentParser()
parser.add_argument("--plugin_dir", type=str, required=True)
args, unknown = parser.parse_known_args()


def set_config_env_vars(env_var: str, target_env_var: str = None, user_id: str = None, team_id: str = None):
    try:
        from transformerlab.plugin import get_db_config_value

        value = get_db_config_value(env_var, user_id=user_id, team_id=team_id)
        if value:
            os.environ[target_env_var] = value
            print(f"Set {target_env_var} from {'user' if user_id else 'team'} config: {value}")
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
