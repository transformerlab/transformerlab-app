from __future__ import annotations


def _clean_segment(segment: str | None) -> str | None:
    if segment is None:
        return None
    cleaned = segment.strip()
    if not cleaned:
        return None
    cleaned = cleaned.rstrip(";").rstrip()
    return cleaned or None


def build_hooked_command(run: str, pre_hook: str | None, post_hook: str | None) -> str:
    """
    Combine provider-scoped hooks with the task run command.

    Requirements:
    - Concatenate with ';' (not '&&') so the post hook always runs.
    - Avoid accidental ';;' by trimming trailing ';' from each segment.
    - Omit empty segments.
    """
    run_clean = _clean_segment(run)
    if not run_clean:
        return ""

    parts = [
        _clean_segment(pre_hook),
        run_clean,
        _clean_segment(post_hook),
    ]
    return ";".join([p for p in parts if p])
