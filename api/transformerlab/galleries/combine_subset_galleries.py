"""
Combine app-local gallery sources for tasks/interactive/announcements.

This script is the monorepo replacement for the external galleries combine flow,
scoped only to gallery types consumed by the API runtime.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
API_DIR = SCRIPT_DIR.parents[2]
SOURCE_ROOT = SCRIPT_DIR / "src"

GALLERY_SPECS = {
    "tasks": "task-gallery.json",
    "interactive": "interactive-gallery.json",
    "announcements": "announcement-gallery.json",
}


def default_bundle_dir_for_channel(channel: str) -> Path:
    normalized = (channel or "stable").strip() or "stable"
    return SCRIPT_DIR / "channels" / normalized / "latest"


def _load_json_file(path: Path) -> list[dict[str, Any]] | dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _combine_folder(folder: Path) -> list[dict[str, Any]]:
    if not folder.exists():
        return []

    combined: list[dict[str, Any]] = []
    json_files = sorted([p for p in folder.iterdir() if p.is_file() and p.suffix == ".json"])
    for file_path in json_files:
        payload = _load_json_file(file_path)
        if isinstance(payload, list):
            combined.extend(payload)
        elif isinstance(payload, dict):
            combined.append(payload)
        else:
            raise ValueError(f"Unsupported payload in {file_path}: expected object or list")

    _assert_no_duplicate_ids(combined, folder.name)
    return combined


def _assert_no_duplicate_ids(items: list[dict[str, Any]], gallery_name: str) -> None:
    seen_ids: set[str] = set()
    for item in items:
        item_id = item.get("id") or item.get("uniqueID")
        if not item_id:
            continue
        normalized = str(item_id)
        if normalized in seen_ids:
            raise ValueError(f"Duplicate id/uniqueID in {gallery_name}: {normalized}")
        seen_ids.add(normalized)


def _assert_interactive_schema(items: list[dict[str, Any]]) -> None:
    for idx, item in enumerate(items):
        if not isinstance(item, dict):
            raise ValueError(f"Invalid interactive entry at index {idx}: expected object")
        entry_id = item.get("id")
        interactive_type = item.get("interactive_type")
        if not isinstance(entry_id, str) or not entry_id.strip():
            raise ValueError(f"Interactive entry at index {idx} missing required string field: id")
        if not isinstance(interactive_type, str) or not interactive_type.strip():
            raise ValueError(f"Interactive entry '{entry_id}' missing required string field: interactive_type")


def build_galleries() -> dict[str, list[dict[str, Any]]]:
    combined: dict[str, list[dict[str, Any]]] = {}
    for source_dir, output_filename in GALLERY_SPECS.items():
        source_folder = SOURCE_ROOT / source_dir
        entries = _combine_folder(source_folder)
        if output_filename == "interactive-gallery.json":
            _assert_interactive_schema(entries)
        combined[output_filename] = entries
    return combined


def emit_bundle(
    combined: dict[str, list[dict[str, Any]]],
    bundle_dir: Path,
    channel: str,
    bundle_version: str,
    min_supported_app_version: str | None,
    max_supported_app_version: str | None,
) -> None:
    bundle_dir.mkdir(parents=True, exist_ok=True)
    file_counts: dict[str, int] = {}

    for filename, payload in combined.items():
        with (bundle_dir / filename).open("w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)
            f.write("\n")
        file_counts[filename] = len(payload)

    manifest: dict[str, Any] = {
        "bundle_version": bundle_version,
        "channel": channel,
        "released_at": datetime.now(timezone.utc).isoformat(),
        "files": file_counts,
    }
    if min_supported_app_version:
        manifest["min_supported_app_version"] = min_supported_app_version
    if max_supported_app_version:
        manifest["max_supported_app_version"] = max_supported_app_version

    with (bundle_dir / "manifest.json").open("w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Combine subset gallery sources for API.")
    parser.add_argument("--channel", default="stable", help="Bundle channel metadata value.")
    parser.add_argument("--bundle-version", default=datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S"))
    parser.add_argument("--min-supported-app-version", default=None)
    parser.add_argument("--max-supported-app-version", default=None)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    combined = build_galleries()
    print("Combined subset galleries:")
    for filename, payload in combined.items():
        print(f" - {filename}: {len(payload)} entries")

    bundle_dir = default_bundle_dir_for_channel(args.channel)
    emit_bundle(
        combined=combined,
        bundle_dir=bundle_dir,
        channel=args.channel,
        bundle_version=args.bundle_version,
        min_supported_app_version=args.min_supported_app_version,
        max_supported_app_version=args.max_supported_app_version,
    )
    print(f"Bundle emitted to: {bundle_dir}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
