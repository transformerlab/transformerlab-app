from __future__ import annotations

from contextvars import ContextVar
from typing import Optional


_current_org_id: ContextVar[Optional[str]] = ContextVar("current_org_id", default=None)


def set_current_org_id(organization_id: Optional[str]) -> None:
    _current_org_id.set(organization_id)


def get_current_org_id() -> Optional[str]:
    return _current_org_id.get()
