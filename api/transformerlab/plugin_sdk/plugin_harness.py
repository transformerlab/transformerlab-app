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

# Set organization context from environment variable if provided
# This allows plugins to have the correct org context without leaking to the API
org_id = os.environ.get("_TFL_ORG_ID")
user_id = os.environ.get("_TFL_USER_ID")  # Optional user_id for user-specific configs

if org_id:
    try:
        from lab.dirs import set_organization_id

        set_organization_id(org_id)

        # Set team/user-specific configs as environment variables for plugins
        # This allows plugins to use standard env vars (HF_TOKEN, WANDB_API_KEY, etc.)
        # without needing to access the database directly
        # Priority: user-specific -> team-wide -> global
        try:
            # Import from local file system (prioritized via sys.path.insert above)
            # This ensures we use the latest local code, not the installed package version
            from transformerlab.plugin import get_db_config_value

            # Set HuggingFace token
            hf_token = get_db_config_value("HuggingfaceUserAccessToken", team_id=org_id, user_id=user_id)
            if hf_token:
                os.environ["HF_TOKEN"] = hf_token
                print(f"Set HF_TOKEN from {'user' if user_id else 'team'} config")

            # Set WANDB API key
            wandb_key = get_db_config_value("WANDB_API_KEY", team_id=org_id, user_id=user_id)
            if wandb_key:
                os.environ["WANDB_API_KEY"] = wandb_key
                print(f"Set WANDB_API_KEY from {'user' if user_id else 'team'} config")

            # Set AI provider keys
            openai_key = get_db_config_value("OPENAI_API_KEY", team_id=org_id, user_id=user_id)
            if openai_key:
                os.environ["OPENAI_API_KEY"] = openai_key
                print(f"Set OPENAI_API_KEY from {'user' if user_id else 'team'} config")

            anthropic_key = get_db_config_value("ANTHROPIC_API_KEY", team_id=org_id, user_id=user_id)
            if anthropic_key:
                os.environ["ANTHROPIC_API_KEY"] = anthropic_key
                print(f"Set ANTHROPIC_API_KEY from {'user' if user_id else 'team'} config")

            custom_key = get_db_config_value("CUSTOM_MODEL_API_KEY", team_id=org_id, user_id=user_id)
            if custom_key:
                os.environ["CUSTOM_MODEL_API_KEY"] = custom_key
                print(f"Set CUSTOM_MODEL_API_KEY from {'user' if user_id else 'team'} config")

            # Azure OpenAI details (JSON string)
            azure_details = get_db_config_value("AZURE_OPENAI_DETAILS", team_id=org_id, user_id=user_id)
            if azure_details:
                # Azure details might be JSON, but we'll set it as-is
                # Plugins can parse it if needed
                os.environ["AZURE_OPENAI_DETAILS"] = azure_details
                print(f"Set AZURE_OPENAI_DETAILS from {'user' if user_id else 'team'} config")
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
