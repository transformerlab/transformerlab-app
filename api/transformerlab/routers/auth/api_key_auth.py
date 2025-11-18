from __future__ import annotations

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from transformerlab.services.auth import AuthenticatedIdentity, auth_service

bearer_scheme = HTTPBearer(auto_error=False)


async def get_user_or_api_key(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> AuthenticatedIdentity:
    try:
        return auth_service.identify_request(request, credentials)
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - defensive guard
        raise HTTPException(status_code=401, detail="Authentication failed") from exc
