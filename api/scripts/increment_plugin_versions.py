#!/usr/bin/env python3
"""Increment plugin versions by 0.0.1 (patch version)

This script increments the patch version (third number) in all plugin index.json files.
For example, 3.4.2 becomes 3.4.3, or 1.0.27 becomes 1.0.28.

Usage:
    python increment_plugin_versions.py

Run from the transformerlab-api directory or from this scripts directory.
"""

import json
import sys
from pathlib import Path


def increment_version(version_str):
    """Increment patch version by 1 (e.g., 3.4.2 -> 3.4.3)"""
    parts = version_str.split(".")
    if len(parts) == 3:
        major, minor, patch = parts
        new_patch = str(int(patch) + 1)
        return f"{major}.{minor}.{new_patch}"
    else:
        # Handle edge cases - if version format is unexpected, try to increment last part
        print(f"Warning: Unexpected version format: {version_str}")
        if len(parts) >= 1:
            parts[-1] = str(int(parts[-1]) + 1)
            return ".".join(parts)
        return version_str


def process_plugin_index(plugin_path):
    """Read, update version, and write index.json"""
    index_path = plugin_path / "index.json"
    if not index_path.exists():
        print(f"Warning: {index_path} does not exist")
        return False

    try:
        with open(index_path, encoding="utf-8") as f:
            data = json.load(f)

        if "version" not in data:
            print(f"Warning: {index_path} does not have a version field")
            return False

        old_version = data["version"]
        new_version = increment_version(old_version)
        data["version"] = new_version

        with open(index_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write("\n")  # Add newline at end

        print(f"Updated {plugin_path.name}: {old_version} -> {new_version}")
        return True
    except Exception as e:
        print(f"Error processing {index_path}: {e}")
        return False


def main():
    # Get the script directory and find transformerlab-api root
    script_dir = Path(__file__).parent.resolve()

    # Try to find transformerlab-api root (should be parent of scripts)
    api_root = script_dir.parent
    plugins_dir = api_root / "transformerlab" / "plugins"

    if not plugins_dir.exists():
        print(f"Error: {plugins_dir} does not exist")
        print(f"Script is in: {script_dir}")
        print(f"Looking for plugins in: {plugins_dir}")
        sys.exit(1)

    plugin_dirs = [d for d in plugins_dir.iterdir() if d.is_dir()]
    print(f"Found {len(plugin_dirs)} plugin directories")
    print(f"Processing plugins in: {plugins_dir}\n")

    updated = 0
    for plugin_dir in sorted(plugin_dirs):
        if process_plugin_index(plugin_dir):
            updated += 1

    print(f"\nSuccessfully updated {updated} plugins")


if __name__ == "__main__":
    main()
