from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Optional

import workos

from .auth_provider import (
    AuthProvider,
    AuthSession,
    AuthUser,
    Invitation,
    Organization,
    OrganizationMembership,
)


class WorkOSSession(AuthSession):
    def __init__(self, session: "workos.resources.user_management.Session"):
        self._session = session
        self.authenticated = bool(getattr(session, "authenticated", False))
        self.sealed_session = getattr(session, "sealed_session", None)
        self.role = getattr(session, "role", None)
        self.organization_id = getattr(session, "organization_id", None)
        self.refresh_token = getattr(session, "refresh_token", None)
        workos_user = getattr(session, "user", None)
        if workos_user is not None:
            self.user = AuthUser(
                id=workos_user.id,
                email=getattr(workos_user, "email", None),
                first_name=getattr(workos_user, "first_name", None),
                last_name=getattr(workos_user, "last_name", None),
                profile_picture_url=getattr(workos_user, "profile_picture_url", None),
                organization_id=self.organization_id,
            )
        else:
            self.user = None

    def authenticate(self) -> "WorkOSSession":
        authenticated = self._session.authenticate()
        return WorkOSSession(authenticated)

    def refresh(self) -> "WorkOSSession":
        refreshed = self._session.refresh()
        return WorkOSSession(refreshed)

    def get_logout_url(self) -> str:
        return self._session.get_logout_url()


class WorkOSProvider(AuthProvider):
    def __init__(
        self,
        *,
        api_key: Optional[str] = None,
        client_id: Optional[str] = None,
        workos_client: Optional["workos.WorkOSClient"] = None,
    ) -> None:
        self._client = workos_client or workos.WorkOSClient(
            api_key=api_key or os.getenv("AUTH_API_KEY"),
            client_id=client_id or os.getenv("AUTH_CLIENT_ID"),
        )

    def get_authorization_url(self, *, redirect_uri: str, provider: Optional[str] = None) -> str:
        return self._client.user_management.get_authorization_url(
            provider=provider or "authkit",
            redirect_uri=redirect_uri,
        )

    def authenticate_with_code(
        self,
        *,
        code: str,
        seal_session: bool,
        cookie_password: str,
    ) -> AuthSession:
        session = self._client.user_management.authenticate_with_code(
            code=code,
            session={"seal_session": seal_session, "cookie_password": cookie_password},
        )
        return WorkOSSession(session)

    def authenticate_with_refresh_token(
        self,
        *,
        refresh_token: str,
        organization_id: Optional[str],
        seal_session: bool,
        cookie_password: str,
    ) -> AuthSession:
        session = self._client.user_management.authenticate_with_refresh_token(
            refresh_token=refresh_token,
            organization_id=organization_id,
            session={"seal_session": seal_session, "cookie_password": cookie_password},
        )
        return WorkOSSession(session)

    def load_sealed_session(self, *, sealed_session: str, cookie_password: str) -> AuthSession:
        session = self._client.user_management.load_sealed_session(
            sealed_session=sealed_session,
            cookie_password=cookie_password,
        )
        return WorkOSSession(session)

    def create_organization(self, *, name: str, domains: Optional[List[str]] = None) -> Organization:
        params = {"name": name}
        if domains:
            params["domain_data"] = [{"domain": domain, "state": "pending"} for domain in domains]
        organization = self._client.organizations.create_organization(**params)
        return Organization(id=organization.id, name=organization.name)

    def get_organization(self, *, organization_id: str) -> Organization:
        organization = self._client.organizations.get_organization(organization_id=organization_id)
        return Organization(id=organization.id, name=organization.name)

    def delete_organization(self, *, organization_id: str) -> None:
        self._client.organizations.delete_organization(organization_id=organization_id)

    def list_organization_memberships(
        self, *, user_id: Optional[str] = None, organization_id: Optional[str] = None
    ) -> List[OrganizationMembership]:
        memberships = self._client.user_management.list_organization_memberships(
            user_id=user_id, organization_id=organization_id
        )
        result: List[OrganizationMembership] = []
        for membership in memberships:
            result.append(
                OrganizationMembership(
                    id=membership.id,
                    user_id=membership.user_id,
                    organization_id=membership.organization_id,
                    role=getattr(membership, "role", None),
                )
            )
        return result

    def create_organization_membership(
        self, *, organization_id: str, user_id: str, role_slug: str
    ) -> OrganizationMembership:
        membership = self._client.user_management.create_organization_membership(
            organization_id=organization_id,
            user_id=user_id,
            role_slug=role_slug,
        )
        return OrganizationMembership(
            id=membership.id,
            user_id=membership.user_id,
            organization_id=membership.organization_id,
            role=getattr(membership, "role", None),
        )

    def delete_organization_membership(self, *, organization_membership_id: str) -> None:
        self._client.user_management.delete_organization_membership(
            organization_membership_id=organization_membership_id
        )

    def update_organization_membership(
        self, *, organization_membership_id: str, role_slug: str
    ) -> OrganizationMembership:
        membership = self._client.user_management.update_organization_membership(
            organization_membership_id=organization_membership_id,
            role_slug=role_slug,
        )
        return OrganizationMembership(
            id=membership.id,
            user_id=membership.user_id,
            organization_id=membership.organization_id,
            role=getattr(membership, "role", None),
        )

    def get_user(self, *, user_id: str) -> AuthUser:
        user = self._client.user_management.get_user(user_id=user_id)
        return AuthUser(
            id=user.id,
            email=getattr(user, "email", None),
            first_name=getattr(user, "first_name", None),
            last_name=getattr(user, "last_name", None),
            profile_picture_url=getattr(user, "profile_picture_url", None),
        )

    def get_users(self, *, user_ids: List[str]) -> List[AuthUser]:
        if not user_ids:
            return []

        results: List[Optional[AuthUser]] = [None] * len(user_ids)

        def fetch(index: int, user_id: str) -> None:
            try:
                user = self._client.user_management.get_user(user_id=user_id)
                results[index] = AuthUser(
                    id=user.id,
                    email=getattr(user, "email", None),
                    first_name=getattr(user, "first_name", None),
                    last_name=getattr(user, "last_name", None),
                    profile_picture_url=getattr(user, "profile_picture_url", None),
                )
            except Exception:
                results[index] = None

        max_workers = min(8, len(user_ids))
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = [executor.submit(fetch, index, user_id) for index, user_id in enumerate(user_ids)]
            for future in as_completed(futures):
                try:
                    future.result()
                except Exception:
                    pass

        return [user for user in results if user is not None]

    def send_invitation(
        self,
        *,
        email: str,
        organization_id: str,
        expires_in_days: Optional[int] = None,
        inviter_user_id: Optional[str] = None,
        role_slug: Optional[str] = None,
    ) -> Invitation:
        params = {"email": email, "organization_id": organization_id}
        if expires_in_days is not None:
            params["expires_in_days"] = expires_in_days
        if inviter_user_id is not None:
            params["inviter_user_id"] = inviter_user_id
        if role_slug is not None:
            params["role_slug"] = role_slug
        invitation = self._client.user_management.send_invitation(**params)
        return Invitation(
            id=invitation.id,
            email=invitation.email,
            organization_id=invitation.organization_id,
            state=getattr(invitation, "state", None),
        )
