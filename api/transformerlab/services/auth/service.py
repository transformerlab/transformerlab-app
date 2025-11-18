from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Union, Literal
from urllib.parse import urljoin

from fastapi import HTTPException, Request, Response
from fastapi.security import HTTPAuthorizationCredentials

from transformerlab.routers.auth.provider import (
    AuthProvider,
    AuthSession,
    AuthUser,
    WorkOSProvider,
)
from transformerlab.services.user_service import user_service

try:
    from transformerlab.fastchat_openai_api import app_settings as fastchat_app_settings
except Exception:  # pragma: no cover - optional dependency during boot
    fastchat_app_settings = None


@dataclass
class AuthenticatedIdentity:
    source: Literal["session", "api_key"]
    user: Optional[AuthUser] = None
    session: Optional[AuthSession] = None
    token: Optional[str] = None


class AuthService:
    def __init__(
        self,
        provider: Optional[AuthProvider] = None,
        *,
        allowed_api_keys: Optional[List[str]] = None,
        session_cookie_name: Optional[str] = None,
        refresh_cookie_name: Optional[str] = None,
        organization_cookie_name: Optional[str] = None,
        cookie_password: Optional[str] = None,
    ) -> None:
        # Only initialize WorkOSProvider if in MULTITENANT mode or if auth env vars are set
        if provider is None:
            is_multitenant = os.getenv("TFL_MULTITENANT") == "true"
            has_auth_api_key = os.getenv("AUTH_API_KEY") is not None
            has_auth_client_id = os.getenv("AUTH_CLIENT_ID") is not None

            if is_multitenant and has_auth_api_key and has_auth_client_id:
                self._provider = WorkOSProvider()
            else:
                # Set to None when not in multitenant mode and auth vars not set
                # This allows API key auth to still work without WorkOS
                self._provider = None
        else:
            self._provider = provider
        self._session_cookie_name = session_cookie_name or os.getenv("AUTH_SESSION_COOKIE_NAME", "tlab_session")
        self._refresh_cookie_name = refresh_cookie_name or os.getenv("AUTH_REFRESH_COOKIE_NAME", "tlab_refresh_token")
        self._organization_cookie_name = organization_cookie_name or os.getenv(
            "AUTH_ORGANIZATION_COOKIE_NAME", "tlab_org_id"
        )
        self._cookie_password = cookie_password or os.getenv(
            "AUTH_COOKIE_PASSWORD", "3qHvlqlA5zNAFUWmA4PFXhNy AxksRnmcgV8fgCpp62Y="
        )
        self._seal_session = self._env_bool(os.getenv("AUTH_SEAL_SESSION", "true"))
        self._cookie_secure = self._env_bool(os.getenv("AUTH_COOKIE_SECURE", "false"))
        self._cookie_domain = os.getenv("AUTH_COOKIE_DOMAIN") or None
        self._cookie_samesite = os.getenv("AUTH_COOKIE_SAMESITE", "lax")
        self._session_cookie_max_age = int(os.getenv("AUTH_SESSION_COOKIE_MAX_AGE", "43200"))
        self._refresh_cookie_max_age = int(os.getenv("AUTH_REFRESH_COOKIE_MAX_AGE", "1209600"))
        # Optional base URL for frontend. When set, non-absolute redirect targets will be joined to this base.
        # Example: FRONTEND_URL="http://localhost:1212" and AUTH_SUCCESS_REDIRECT_URL="/" → "http://localhost:1212/"
        self._frontend_url = os.getenv("FRONTEND_URL", "http://localhost:1212")
        # Redirect targets can be absolute (http(s)://...) or relative (e.g., "/" or "/#").
        # When relative and FRONTEND_URL is set, we will resolve against it; otherwise, against the API base URL.
        self._success_redirect = os.getenv("AUTH_SUCCESS_REDIRECT_URL", "/")
        self._error_redirect = os.getenv("AUTH_ERROR_REDIRECT_URL", "/")
        self._logout_redirect = os.getenv("AUTH_LOGOUT_REDIRECT_URL", "/")
        self._redirect_uri_override = os.getenv("AUTH_REDIRECT_URI")
        self._allowed_scopes_env = os.getenv("AUTH_ALLOWED_SCOPES")

        self._allowed_api_keys_override = allowed_api_keys
        self._allowed_api_keys_env = self._load_api_keys_from_env()

    # Public API ------------------------------------------------------------

    def generate_login_url(self, request: Request, provider: Optional[str] = None) -> str:
        if self._provider is None:
            raise HTTPException(status_code=503, detail="Authentication provider not configured")
        redirect_uri = self._build_redirect_uri(request)
        return self._provider.get_authorization_url(redirect_uri=redirect_uri, provider=provider)

    async def handle_auth_callback(self, request: Request, code: str) -> Response:
        if self._provider is None:
            raise HTTPException(status_code=503, detail="Authentication provider not configured")
        session = self._provider.authenticate_with_code(
            code=code,
            seal_session=self._seal_session,
            cookie_password=self._cookie_password,
        )
        response = self._redirect_response(self._success_redirect, request)
        self._persist_session(response, session)
        print(f"SESSION: {session}")
        try:
            if session and getattr(session, "user", None):
                # Fire-and-forget; do not block redirect on post-login tasks
                # Intentionally not awaited in a background task framework here; best-effort
                await user_service.on_after_login(session.user, request=request, response=response)
        except Exception:
            # Never let post-login hooks break the happy path
            pass
        return response

    def get_frontend_error_url(self, request: Request) -> str:
        return self._resolve_url(self._error_redirect, request)

    async def logout_user(self, request: Request) -> Response:
        response = self._redirect_response(self._logout_redirect, request)
        sealed_session = request.cookies.get(self._session_cookie_name)
        if sealed_session and self._provider is not None:
            try:
                session = self._provider.load_sealed_session(
                    sealed_session=sealed_session, cookie_password=self._cookie_password
                )
                logout_url = session.get_logout_url()
                if logout_url:
                    response = self._redirect_response(logout_url, request, absolute=True)
            except Exception:
                # swallow provider errors to ensure logout always clears local cookies
                pass
        self._clear_session(response)
        return response

    def get_user_info(self, identity: AuthenticatedIdentity) -> Dict[str, Any]:
        payload = self._session_payload(identity)
        user_payload = payload.get("user") or {}
        result: Dict[str, Any] = {
            "authenticated": payload["authenticated"],
            "source": payload["source"],
            "organization_id": payload.get("organization_id"),
            "role": payload.get("role"),
            "api_key": payload.get("api_key"),
        }
        result.update(user_payload)
        return result

    async def check_user_auth(
        self, request: Request, response: Response, identity: AuthenticatedIdentity
    ) -> Dict[str, Any]:
        if identity.source == "session":
            session = identity.session
            if not session or not session.authenticated:
                self._clear_session(response)
                raise HTTPException(status_code=401, detail="Not authenticated")
            self._persist_session(response, session)
            return self._session_payload(identity)
        if identity.source == "api_key":
            return self._session_payload(identity)
        raise HTTPException(status_code=401, detail="Not authenticated")

    async def refresh_user_session(self, request: Request, response: Response) -> Dict[str, Any]:
        if self._provider is None:
            raise HTTPException(status_code=503, detail="Authentication provider not configured")
        refresh_token = request.cookies.get(self._refresh_cookie_name)
        if not refresh_token:
            raise HTTPException(status_code=401, detail="Missing refresh token")
        organization_id = request.cookies.get(self._organization_cookie_name)
        session = self._provider.authenticate_with_refresh_token(
            refresh_token=refresh_token,
            organization_id=organization_id,
            seal_session=self._seal_session,
            cookie_password=self._cookie_password,
        )
        identity = AuthenticatedIdentity(source="session", session=session, user=session.user)
        self._persist_session(response, session)
        return self._session_payload(identity)

    def identify_request(
        self,
        request: Request,
        credentials: Optional[HTTPAuthorizationCredentials],
    ) -> AuthenticatedIdentity:
        token = credentials.credentials if credentials else None
        allowed_api_keys = self._get_allowed_api_keys()
        if token:
            if allowed_api_keys is None:
                return AuthenticatedIdentity(source="api_key", token=token)
            if not allowed_api_keys:
                raise HTTPException(status_code=401, detail="API key authentication disabled")
            if token in allowed_api_keys:
                return AuthenticatedIdentity(source="api_key", token=token)
            raise HTTPException(status_code=401, detail="Invalid API key")
        return self._load_session_identity(request)

    def get_allowed_scopes(self) -> List[str]:
        return sorted(set(self._parse_env_list(self._allowed_scopes_env))) if self._allowed_scopes_env else []

    # Internal helpers ------------------------------------------------------

    def _load_session_identity(self, request: Request) -> AuthenticatedIdentity:
        if self._provider is None:
            raise HTTPException(
                status_code=401, detail="Session authentication not available. Use API key authentication."
            )
        sealed_session = request.cookies.get(self._session_cookie_name)
        if not sealed_session:
            raise HTTPException(status_code=401, detail="Not authenticated")
        try:
            session = self._provider.load_sealed_session(
                sealed_session=sealed_session,
                cookie_password=self._cookie_password,
            )
        except Exception as exc:  # pragma: no cover - provider-specific failure paths
            raise HTTPException(status_code=401, detail="Session invalid") from exc
        if not session.authenticated:
            # Try to authenticate a loaded but unauthenticated session (provider-specific)
            try:
                session = session.authenticate()
            except Exception:
                pass
        if not session.authenticated:
            raise HTTPException(status_code=401, detail="Not authenticated")
        return AuthenticatedIdentity(source="session", session=session, user=session.user)

    def _persist_session(self, response: Response, session: AuthSession) -> None:
        if session.sealed_session:
            self._set_cookie(
                response,
                self._session_cookie_name,
                session.sealed_session,
                max_age=self._session_cookie_max_age,
            )
        else:
            self._delete_cookie(response, self._session_cookie_name)
        if session.refresh_token:
            self._set_cookie(
                response,
                self._refresh_cookie_name,
                session.refresh_token,
                max_age=self._refresh_cookie_max_age,
            )
        else:
            self._delete_cookie(response, self._refresh_cookie_name)
        if session.organization_id:
            self._set_cookie(
                response,
                self._organization_cookie_name,
                session.organization_id,
                max_age=self._session_cookie_max_age,
            )
        else:
            self._delete_cookie(response, self._organization_cookie_name)

    def _clear_session(self, response: Response) -> None:
        self._delete_cookie(response, self._session_cookie_name)
        self._delete_cookie(response, self._refresh_cookie_name)
        self._delete_cookie(response, self._organization_cookie_name)

    def _session_payload(self, identity: AuthenticatedIdentity) -> Dict[str, Any]:
        if identity.source == "api_key":
            return {
                "authenticated": True,
                "source": "api_key",
                "user": None,
                "organization_id": None,
                "role": None,
                "api_key": identity.token,
            }
        session = identity.session
        user = identity.user
        return {
            "authenticated": bool(session.authenticated if session else False),
            "source": "session",
            "user": self._serialize_user(user),
            "organization_id": getattr(session, "organization_id", None) if session else None,
            "role": getattr(session, "role", None) if session else None,
            "api_key": None,
        }

    def _serialize_user(self, user: Optional[AuthUser]) -> Optional[Dict[str, Any]]:
        if user is None:
            return None
        return {
            "id": user.id,
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "profile_picture_url": user.profile_picture_url,
        }

    def _redirect_response(self, target_url: str, request: Request, *, absolute: bool = False) -> Response:
        resolved = target_url if absolute else self._resolve_url(target_url, request)
        from fastapi.responses import RedirectResponse

        response = RedirectResponse(url=resolved)
        return response

    def _resolve_url(self, target: str, request: Request) -> str:
        if target.startswith("http://") or target.startswith("https://"):
            return target
        # Prefer FRONTEND_URL if provided, otherwise fall back to the API base URL
        base_url = (self._frontend_url or self._get_base_url(request)).rstrip("/") + "/"
        return urljoin(base_url, target)

    def _get_base_url(self, request: Request) -> str:
        url = request.url
        return f"{url.scheme}://{url.netloc}"

    def _build_redirect_uri(self, request: Request) -> str:
        if self._redirect_uri_override:
            return self._redirect_uri_override
        return str(request.url_for("auth_callback"))

    def _set_cookie(self, response: Response, name: str, value: str, *, max_age: Optional[int] = None) -> None:
        response.set_cookie(
            key=name,
            value=value,
            max_age=max_age,
            httponly=True,
            secure=self._cookie_secure,
            domain=self._cookie_domain,
            samesite=self._cookie_samesite,
            path="/",
        )

    def _delete_cookie(self, response: Response, name: str) -> None:
        response.delete_cookie(
            key=name,
            domain=self._cookie_domain,
            path="/",
        )

    def _load_api_keys_from_env(self) -> Optional[List[str]]:
        raw = os.getenv("API_KEYS")
        if raw is None:
            return None
        parsed = self._parse_env_list(raw)
        return parsed

    def _get_allowed_api_keys(self) -> Optional[List[str]]:
        if self._allowed_api_keys_override is not None:
            return self._allowed_api_keys_override
        if fastchat_app_settings and fastchat_app_settings.api_keys is not None:
            return list(fastchat_app_settings.api_keys)
        return self._allowed_api_keys_env

    @staticmethod
    def _parse_env_list(value: Optional[str]) -> List[str]:
        if not value:
            return []
        candidates: List[str]
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                candidates = [str(item) for item in parsed if str(item).strip()]
                return candidates
        except json.JSONDecodeError:
            pass
        candidates = [item.strip() for item in value.split(",") if item.strip()]
        return candidates

    @staticmethod
    def _env_bool(value: Union[str, bool]) -> bool:
        if isinstance(value, bool):
            return value
        return value.lower() in {"1", "true", "yes", "on"}


auth_service = AuthService()
