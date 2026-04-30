from typing import Optional

from pydantic import BaseModel, EmailStr

from transformerlab.shared.models.models import TeamRole


class TeamCreate(BaseModel):
    name: str


class TeamUpdate(BaseModel):
    name: str


class TeamResponse(BaseModel):
    id: str
    name: str


class InviteMemberRequest(BaseModel):
    email: EmailStr
    role: str = TeamRole.MEMBER.value


class UpdateMemberRoleRequest(BaseModel):
    role: str


class MemberResponse(BaseModel):
    user_id: str
    email: str
    role: str


class InvitationResponse(BaseModel):
    id: str
    email: str
    team_id: str
    team_name: str
    role: str
    status: str
    invited_by_email: str
    expires_at: str
    created_at: str


class AcceptInvitationRequest(BaseModel):
    token: str


class GitHubPATRequest(BaseModel):
    pat: Optional[str] = None
