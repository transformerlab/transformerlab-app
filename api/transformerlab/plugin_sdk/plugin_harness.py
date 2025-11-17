"""
This is the main file that gets called by popen when a plugin is run.
It must get passed:

    --plugin_dir            full path to the directory containing the plugin

All other parameters can be passed as if you are calling the plugin directly.

"""

import sys
import argparse
import traceback


parser = argparse.ArgumentParser()
parser.add_argument("--plugin_dir", type=str, required=True)
args, unknown = parser.parse_known_args()

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

    sys.exit(1)

# Also execute the function main.main(), if it exists
if "main" in dir(main) and callable(getattr(main, "main")):
    main.main()
