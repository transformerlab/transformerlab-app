"""Filesystem-safe cluster name fragments shared by launch and job resume flows."""

from typing import Optional


def sanitize_cluster_basename(base_name: Optional[str]) -> str:
    """Return a filesystem-safe cluster base name."""
    if not base_name:
        return "remote-template"
    normalized = "".join(ch if ch.isalnum() or ch in ("-", "_") else "-" for ch in base_name.strip())
    normalized = normalized.strip("-_")
    return normalized or "remote-template"
