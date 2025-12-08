from __future__ import annotations

from contextvars import ContextVar

_current_org_id: ContextVar[str | None] = ContextVar("current_org_id", default=None)


def set_current_org_id(organization_id: str | None) -> None:
    _current_org_id.set(organization_id)


def get_current_org_id() -> str | None:
    return _current_org_id.get()
