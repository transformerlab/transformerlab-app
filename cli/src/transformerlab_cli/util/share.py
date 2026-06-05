"""Helpers for public share links (experiment notes and jobs chart)."""

import typer

import transformerlab_cli.util.api as api


class ShareLinkError(Exception):
    """Raised when a public share link cannot be fetched or created."""

    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _extract_error_detail(response) -> str:
    try:
        payload = response.json()
        if isinstance(payload, dict):
            return str(payload.get("detail") or payload.get("message") or response.text or "")
    except Exception:
        pass
    return response.text or ""


def _error_from_response(response) -> ShareLinkError:
    detail = _extract_error_detail(response)
    if response.status_code == 404 and detail.strip() == "Not Found":
        # FastAPI's default 404 body — the share endpoints are missing on this server.
        message = (
            "This server does not support public sharing (missing /share endpoints). "
            "Update the Transformer Lab server and try again."
        )
    else:
        message = detail or f"Failed to create share link. Status code: {response.status_code}"
    return ShareLinkError(message, response.status_code)


def get_active_share_link(experiment_id: str, kind: str) -> dict | None:
    """Return the active public share link for `kind` ("chart" or "notes"), or None if sharing is off."""
    response = api.get(f"/experiment/{experiment_id}/share/{kind}")
    if response.status_code != 200:
        raise _error_from_response(response)
    link = response.json()
    if isinstance(link, dict) and link.get("url"):
        return link
    return None


def mint_share_link(experiment_id: str, kind: str) -> dict:
    """Mint a new public share link for `kind`, revoking any previous one server-side."""
    response = api.post_json(f"/experiment/{experiment_id}/share/{kind}")
    if response.status_code != 200:
        raise _error_from_response(response)
    created = response.json()
    if not isinstance(created, dict) or not created.get("url"):
        raise ShareLinkError("Server returned an unexpected share link response.", response.status_code)
    return created


def ensure_share_link(experiment_id: str, kind: str, confirm_message: str | None = None) -> dict:
    """Return the active public share link for `kind`, minting one if none exists.

    Reuses any existing active link so repeated calls keep returning the same URL
    instead of rotating it (minting revokes the previous link server-side).
    If `confirm_message` is given, prompts for confirmation before minting a new
    link (reusing an existing link never prompts); declining aborts the command.
    """
    link = get_active_share_link(experiment_id, kind)
    if link is not None:
        return link
    if confirm_message:
        typer.confirm(confirm_message, abort=True)
    return mint_share_link(experiment_id, kind)
