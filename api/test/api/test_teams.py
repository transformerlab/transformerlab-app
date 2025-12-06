import pytest


def verify_user_in_db(email: str):
    """Helper to mark a user as verified in the database (for testing)"""
    import asyncio

    from sqlalchemy import select

    from transformerlab.db.session import async_session
    from transformerlab.shared.models.models import User

    async def _verify():
        async with async_session() as session:
            stmt = select(User).where(User.email == email)
            result = await session.execute(stmt)
            user = result.scalar_one_or_none()
            if user:
                user.is_verified = True
                await session.commit()
                return True
        return False

    # Get or create event loop
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        # No running loop, create one
        try:
            loop = asyncio.get_event_loop()
            if loop.is_closed():
                raise RuntimeError("Event loop is closed")
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

    if asyncio.iscoroutinefunction(_verify):
        return loop.run_until_complete(_verify())


@pytest.fixture
def auto_verify_user():
    """Fixture that returns the verify_user_in_db function for use in tests"""
    return verify_user_in_db


@pytest.fixture(scope="module")
def owner_user(client):
    """Create and authenticate an owner user"""
    # Register
    user_data = {
        "email": "owner@test.com",
        "password": "password123",
    }
    resp = client.post("/auth/register", json=user_data)
    assert resp.status_code in (200, 201, 400)  # 400 if already exists

    # Verify user in database (for testing, bypass email verification)
    verify_user_in_db("owner@test.com")

    # Login
    login_data = {
        "username": "owner@test.com",
        "password": "password123",
    }
    resp = client.post("/auth/jwt/login", data=login_data)
    assert resp.status_code == 200
    token = resp.json()["access_token"]

    return {"email": "owner@test.com", "token": token}


@pytest.fixture(scope="function")
def member_user(client):
    """Create and authenticate a member user"""
    # Register
    user_data = {
        "email": "member@test.com",
        "password": "password123",
    }
    resp = client.post("/auth/register", json=user_data)
    assert resp.status_code in (200, 201, 400)  # 400 if already exists

    # Verify user in database (for testing, bypass email verification)
    verify_user_in_db("member@test.com")

    # Login
    login_data = {
        "username": "member@test.com",
        "password": "password123",
    }
    resp = client.post("/auth/jwt/login", data=login_data)
    assert resp.status_code == 200
    token = resp.json()["access_token"]

    return {"email": "member@test.com", "token": token}


@pytest.fixture(scope="function")
def test_team(client, owner_user):
    """Create a test team"""
    headers = {"Authorization": f"Bearer {owner_user['token']}"}
    team_data = {"name": "Test Team"}
    resp = client.post("/teams", json=team_data, headers=headers)
    assert resp.status_code == 200
    team = resp.json()
    assert "id" in team
    assert team["name"] == "Test Team"
    return team


@pytest.fixture(scope="function")
def member_in_test_team(client, owner_user, member_user, test_team):
    """Ensure member_user is added to test_team via invitation"""
    headers = {"Authorization": f"Bearer {owner_user['token']}", "X-Team-Id": test_team["id"]}

    # Check if member is already in the team
    resp = client.get(f"/teams/{test_team['id']}/members", headers=headers)
    if resp.status_code == 200:
        members = resp.json()["members"]
        if any(m["email"] == member_user["email"] for m in members):
            return True

    # If not, invite and accept
    invite_data = {"email": member_user["email"], "role": "member"}
    resp = client.post(f"/teams/{test_team['id']}/members", json=invite_data, headers=headers)

    if resp.status_code == 200:
        resp_json = resp.json()
        # Extract token from invitation_url (format: http://.../#/?invitation_token=TOKEN)
        if "invitation_url" in resp_json:
            invitation_url = resp_json["invitation_url"]
            if "invitation_token=" in invitation_url:
                token = invitation_url.split("invitation_token=")[-1]
            else:
                return False
        else:
            return False

        headers_member = {"Authorization": f"Bearer {member_user['token']}"}
        accept_data = {"token": token}
        resp = client.post("/invitations/accept", json=accept_data, headers=headers_member)
        if resp.status_code == 200:
            return True
    return False


# Fresh fixtures for invitation tests to avoid state pollution
@pytest.fixture(scope="function")
def fresh_owner_user(client):
    """Create a fresh owner user for invitation tests"""
    import time

    email = f"fresh_owner_{int(time.time() * 1000)}@test.com"
    user_data = {"email": email, "password": "password123"}
    resp = client.post("/auth/register", json=user_data)
    assert resp.status_code in (200, 201)

    # Verify user in database (for testing, bypass email verification)
    verify_user_in_db(email)

    login_data = {"username": email, "password": "password123"}
    resp = client.post("/auth/jwt/login", data=login_data)
    assert resp.status_code == 200
    token = resp.json()["access_token"]
    return {"email": email, "token": token}


@pytest.fixture(scope="function")
def fresh_test_team(client, fresh_owner_user):
    """Create a fresh team for invitation tests"""
    headers = {"Authorization": f"Bearer {fresh_owner_user['token']}"}
    team_data = {"name": f"Fresh Team {fresh_owner_user['email']}"}
    resp = client.post("/teams", json=team_data, headers=headers)
    assert resp.status_code == 200
    return resp.json()


def test_create_team(client, owner_user):
    """Test creating a new team"""
    headers = {"Authorization": f"Bearer {owner_user['token']}"}
    team_data = {"name": "New Team"}
    resp = client.post("/teams", json=team_data, headers=headers)

    assert resp.status_code == 200
    team = resp.json()
    assert "id" in team
    assert team["name"] == "New Team"


def test_get_user_teams(client, owner_user, test_team):
    """Test getting user's teams"""
    headers = {"Authorization": f"Bearer {owner_user['token']}"}
    resp = client.get("/users/me/teams", headers=headers)

    assert resp.status_code == 200
    data = resp.json()
    assert "teams" in data
    assert len(data["teams"]) > 0

    # Check that test_team is in the list
    team_ids = [t["id"] for t in data["teams"]]
    assert test_team["id"] in team_ids

    # Check that the user has owner role for the test team
    test_team_data = next(t for t in data["teams"] if t["id"] == test_team["id"])
    assert test_team_data["role"] == "owner"


def test_list_team_members(client, owner_user, test_team):
    """Test listing team members"""
    headers = {"Authorization": f"Bearer {owner_user['token']}", "X-Team-Id": test_team["id"]}
    resp = client.get(f"/teams/{test_team['id']}/members", headers=headers)

    assert resp.status_code == 200
    data = resp.json()
    assert "members" in data
    assert len(data["members"]) >= 1

    # Check owner is in the list
    emails = [m["email"] for m in data["members"]]
    assert owner_user["email"] in emails

    # Check owner has owner role
    owner_data = next(m for m in data["members"] if m["email"] == owner_user["email"])
    assert owner_data["role"] == "owner"


def test_invite_member(client, owner_user, member_user, test_team):
    """Test inviting a member to the team"""
    headers = {"Authorization": f"Bearer {owner_user['token']}", "X-Team-Id": test_team["id"]}
    invite_data = {"email": member_user["email"], "role": "member"}
    resp = client.post(f"/teams/{test_team['id']}/members", json=invite_data, headers=headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data["message"] == "Invitation created successfully"
    assert data["email"] == member_user["email"]
    assert data["role"] == "member"
    assert "invitation_url" in data
    assert "invitation_id" in data
    # In dev mode, email_sent should be True (no actual sending, just logged)
    assert data["email_sent"]
    assert data["email_error"] is None

    # Accept the invitation
    token = data["invitation_url"].split("token=")[1]
    headers_member = {"Authorization": f"Bearer {member_user['token']}"}
    accept_data = {"token": token}
    resp = client.post("/invitations/accept", json=accept_data, headers=headers_member)
    assert resp.status_code == 200


def test_invite_duplicate_member(client, owner_user, test_team):
    """Test sending duplicate invitations to the same email"""
    headers = {"Authorization": f"Bearer {owner_user['token']}", "X-Team-Id": test_team["id"]}
    invite_data = {"email": "duplicate_test@test.com", "role": "member"}

    # First invitation
    resp1 = client.post(f"/teams/{test_team['id']}/members", json=invite_data, headers=headers)
    assert resp1.status_code == 200
    first_url = resp1.json()["invitation_url"]

    # Second invitation - should return same URL (idempotent)
    resp2 = client.post(f"/teams/{test_team['id']}/members", json=invite_data, headers=headers)
    assert resp2.status_code == 200
    second_url = resp2.json()["invitation_url"]
    assert first_url == second_url


def test_invite_nonexistent_user(client, owner_user, test_team):
    """Test inviting a user that doesn't exist"""
    headers = {"Authorization": f"Bearer {owner_user['token']}", "X-Team-Id": test_team["id"]}
    invite_data = {"email": "nonexistent@test.com", "role": "member"}
    resp = client.post(f"/teams/{test_team['id']}/members", json=invite_data, headers=headers)

    # Invitation is created even if user doesn't exist yet
    assert resp.status_code == 200
    data = resp.json()
    # In dev mode, email is logged but not actually sent
    assert data["email_sent"]
    assert data["email_error"] is None
    assert "invitation_url" in resp.json()


def test_member_can_view_members(client, member_user, test_team, member_in_test_team):
    """Test that a member can view team members"""
    headers = {"Authorization": f"Bearer {member_user['token']}", "X-Team-Id": test_team["id"]}
    resp = client.get(f"/teams/{test_team['id']}/members", headers=headers)

    assert resp.status_code == 200
    data = resp.json()
    assert "members" in data
    assert len(data["members"]) >= 1


def test_update_member_role_to_owner(
    client, owner_user, member_user, test_team, member_in_test_team
):
    """Test promoting a member to owner"""
    headers = {"Authorization": f"Bearer {owner_user['token']}", "X-Team-Id": test_team["id"]}

    # Get the member's user_id
    resp = client.get(f"/teams/{test_team['id']}/members", headers=headers)
    members = resp.json()["members"]
    member_data = next((m for m in members if m["email"] == member_user["email"]), None)

    assert member_data is not None
    member_id = member_data["user_id"]

    # Promote to owner
    role_data = {"role": "owner"}
    resp = client.put(
        f"/teams/{test_team['id']}/members/{member_id}/role", json=role_data, headers=headers
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["message"] == "Role updated successfully"
    assert data["new_role"] == "owner"


def test_update_member_role_to_member(
    client, owner_user, member_user, test_team, member_in_test_team
):
    """Test demoting an owner to member"""
    headers = {"Authorization": f"Bearer {owner_user['token']}", "X-Team-Id": test_team["id"]}

    # Get the member's user_id
    resp = client.get(f"/teams/{test_team['id']}/members", headers=headers)
    members = resp.json()["members"]
    member_data = next((m for m in members if m["email"] == member_user["email"]), None)

    assert member_data is not None
    member_id = member_data["user_id"]

    # Demote to member
    role_data = {"role": "member"}
    resp = client.put(
        f"/teams/{test_team['id']}/members/{member_id}/role", json=role_data, headers=headers
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["message"] == "Role updated successfully"
    assert data["new_role"] == "member"


def test_cannot_demote_last_owner(client, owner_user, test_team):
    """Test that the last owner cannot be demoted"""
    # Get owner's user_id
    headers = {"Authorization": f"Bearer {owner_user['token']}", "X-Team-Id": test_team["id"]}
    resp = client.get(f"/teams/{test_team['id']}/members", headers=headers)
    members = resp.json()["members"]
    owner_data = next(m for m in members if m["email"] == owner_user["email"])
    owner_id = owner_data["user_id"]

    # Try to demote
    role_data = {"role": "member"}
    resp = client.put(
        f"/teams/{test_team['id']}/members/{owner_id}/role", json=role_data, headers=headers
    )

    assert resp.status_code == 400
    assert "last owner" in resp.json()["detail"].lower()


def test_member_cannot_invite(client, member_user, test_team, member_in_test_team):
    """Test that a member cannot invite other users"""
    headers = {"Authorization": f"Bearer {member_user['token']}", "X-Team-Id": test_team["id"]}
    invite_data = {"email": "another@test.com", "role": "member"}
    resp = client.post(f"/teams/{test_team['id']}/members", json=invite_data, headers=headers)

    assert resp.status_code == 403
    assert "owner" in resp.json()["detail"].lower()


def test_member_cannot_update_roles(
    client, owner_user, member_user, test_team, member_in_test_team
):
    """Test that a member cannot change roles"""
    # Get owner's user_id
    headers = {"Authorization": f"Bearer {owner_user['token']}", "X-Team-Id": test_team["id"]}
    resp = client.get(f"/teams/{test_team['id']}/members", headers=headers)
    members = resp.json()["members"]
    owner_data = next(m for m in members if m["email"] == owner_user["email"])
    owner_id = owner_data["user_id"]

    # Try to update role as member
    headers_member = {
        "Authorization": f"Bearer {member_user['token']}",
        "X-Team-Id": test_team["id"],
    }
    role_data = {"role": "member"}
    resp = client.put(
        f"/teams/{test_team['id']}/members/{owner_id}/role", json=role_data, headers=headers_member
    )

    assert resp.status_code == 403
    assert "owner" in resp.json()["detail"].lower()


def test_remove_member(client, owner_user, member_user, test_team, member_in_test_team):
    """Test removing a member from the team"""
    # Ensure member was added
    assert member_in_test_team

    # Get member's user_id
    headers = {"Authorization": f"Bearer {owner_user['token']}", "X-Team-Id": test_team["id"]}
    resp = client.get(f"/teams/{test_team['id']}/members", headers=headers)
    members = resp.json()["members"]
    member_data = next((m for m in members if m["email"] == member_user["email"]), None)

    # Member should exist
    assert member_data is not None
    member_id = member_data["user_id"]

    # Remove member
    resp = client.delete(f"/teams/{test_team['id']}/members/{member_id}", headers=headers)

    assert resp.status_code == 200
    assert resp.json()["message"] == "Member removed successfully"

    # Verify member is removed
    resp = client.get(f"/teams/{test_team['id']}/members", headers=headers)
    members_after = resp.json()["members"]
    assert not any(m["email"] == member_user["email"] for m in members_after)


def test_cannot_remove_last_owner(client, owner_user, test_team):
    """Test that the last owner cannot be removed"""
    # Get owner's user_id
    headers = {"Authorization": f"Bearer {owner_user['token']}", "X-Team-Id": test_team["id"]}
    resp = client.get(f"/teams/{test_team['id']}/members", headers=headers)
    members = resp.json()["members"]
    owner_data = next(m for m in members if m["email"] == owner_user["email"])
    owner_id = owner_data["user_id"]

    # Try to remove
    resp = client.delete(f"/teams/{test_team['id']}/members/{owner_id}", headers=headers)

    assert resp.status_code == 400
    assert "last owner" in resp.json()["detail"].lower()


def test_member_cannot_remove_members(
    client, owner_user, member_user, test_team, member_in_test_team
):
    """Test that a member cannot remove other members"""
    # Get owner's user_id
    headers_owner = {"Authorization": f"Bearer {owner_user['token']}", "X-Team-Id": test_team["id"]}
    resp = client.get(f"/teams/{test_team['id']}/members", headers=headers_owner)
    members = resp.json()["members"]
    owner_data = next(m for m in members if m["email"] == owner_user["email"])
    owner_id = owner_data["user_id"]

    # Try to remove as member
    headers_member = {
        "Authorization": f"Bearer {member_user['token']}",
        "X-Team-Id": test_team["id"],
    }
    resp = client.delete(f"/teams/{test_team['id']}/members/{owner_id}", headers=headers_member)

    # Should fail - either because member doesn't have permission or isn't in the team
    assert resp.status_code in (403, 400)
    detail = resp.json()["detail"].lower()
    assert "owner" in detail or "not a member" in detail


def test_update_team_name(client, owner_user, test_team):
    """Test updating team name as owner"""
    headers = {"Authorization": f"Bearer {owner_user['token']}", "X-Team-Id": test_team["id"]}
    update_data = {"name": "Updated Team Name"}
    resp = client.put(f"/teams/{test_team['id']}", json=update_data, headers=headers)

    assert resp.status_code == 200
    team = resp.json()
    assert team["name"] == "Updated Team Name"


def test_member_cannot_update_team_name(client, member_user, test_team, member_in_test_team):
    """Test that a member cannot update team name"""
    headers = {"Authorization": f"Bearer {member_user['token']}", "X-Team-Id": test_team["id"]}
    update_data = {"name": "Hacked Name"}
    resp = client.put(f"/teams/{test_team['id']}", json=update_data, headers=headers)

    # Should fail - either because member doesn't have permission or isn't in the team
    assert resp.status_code in (403, 400)
    detail = resp.json()["detail"].lower()
    assert "owner" in detail or "not a member" in detail


def test_delete_team(client, owner_user):
    """Test deleting a team (not Default Team)"""
    # Create a team to delete
    headers = {"Authorization": f"Bearer {owner_user['token']}"}
    team_data = {"name": "Team to Delete"}
    resp = client.post("/teams", json=team_data, headers=headers)
    team = resp.json()

    # Delete it
    headers = {"Authorization": f"Bearer {owner_user['token']}", "X-Team-Id": team["id"]}
    resp = client.delete(f"/teams/{team['id']}", headers=headers)

    assert resp.status_code == 200
    assert resp.json()["message"] == "Team deleted"


def test_cannot_delete_last_team(client, owner_user):
    """Test that users cannot delete their last team (personal team)"""
    # Get user's teams
    headers = {"Authorization": f"Bearer {owner_user['token']}"}
    resp = client.get("/users/me/teams", headers=headers)
    teams = resp.json()["teams"]

    # Should have at least one team (personal team)
    assert len(teams) >= 1

    # Find the personal team (named after the user's email username)
    personal_team = None
    username = owner_user["email"].split("@")[0]
    for team in teams:
        if team["name"] == f"{username}'s Team":
            personal_team = team
            break

    assert personal_team is not None, "Personal team not found"

    # Try to delete the personal team
    headers = {"Authorization": f"Bearer {owner_user['token']}", "X-Team-Id": personal_team["id"]}
    resp = client.delete(f"/teams/{personal_team['id']}", headers=headers)

    # Should fail because it's the personal team (last team)
    assert resp.status_code == 400
    assert "personal team" in resp.json()["detail"].lower()


def test_member_cannot_delete_team(client, member_user, test_team, member_in_test_team):
    """Test that a member cannot delete a team"""
    headers = {"Authorization": f"Bearer {member_user['token']}", "X-Team-Id": test_team["id"]}
    resp = client.delete(f"/teams/{test_team['id']}", headers=headers)

    # Should fail - either because member doesn't have permission or isn't in the team
    assert resp.status_code in (403, 400)
    detail = resp.json()["detail"].lower()
    assert "owner" in detail or "not a member" in detail


def test_cannot_delete_team_with_multiple_users(
    client, owner_user, member_user, test_team, member_in_test_team
):
    """Test that a team with multiple users cannot be deleted"""
    # Ensure member was added successfully
    assert member_in_test_team

    headers = {"Authorization": f"Bearer {owner_user['token']}", "X-Team-Id": test_team["id"]}

    # Verify team has multiple members before attempting delete
    resp = client.get(f"/teams/{test_team['id']}/members", headers=headers)
    assert resp.status_code == 200
    members = resp.json()["members"]
    assert len(members) >= 2, f"Team should have at least 2 members, but has {len(members)}"

    # Now try to delete - should fail
    resp = client.delete(f"/teams/{test_team['id']}", headers=headers)

    assert resp.status_code == 400
    assert "multiple users" in resp.json()["detail"].lower()


# ==================== Team Invitation Tests ====================


@pytest.fixture
def invited_user(client):
    """Create and authenticate an invited user"""
    # Register
    user_data = {
        "email": "invited@test.com",
        "password": "password123",
    }
    resp = client.post("/auth/register", json=user_data)
    assert resp.status_code in (200, 201, 400)  # 400 if already exists

    # Verify user in database (for testing, bypass email verification)
    verify_user_in_db("invited@test.com")

    # Login
    login_data = {
        "username": "invited@test.com",
        "password": "password123",
    }
    resp = client.post("/auth/jwt/login", data=login_data)
    assert resp.status_code == 200
    token = resp.json()["access_token"]

    return {"email": "invited@test.com", "token": token}


@pytest.fixture
def reject_user(client):
    """Create and authenticate a user who will reject invitation"""
    # Register
    user_data = {
        "email": "reject@test.com",
        "password": "password123",
    }
    resp = client.post("/auth/register", json=user_data)
    assert resp.status_code in (200, 201, 400)  # 400 if already exists

    # Verify user in database (for testing, bypass email verification)
    verify_user_in_db("reject@test.com")

    # Login
    login_data = {
        "username": "reject@test.com",
        "password": "password123",
    }
    resp = client.post("/auth/jwt/login", data=login_data)
    assert resp.status_code == 200
    token = resp.json()["access_token"]

    return {"email": "reject@test.com", "token": token}


def test_create_invitation(client, fresh_owner_user, fresh_test_team):
    """Test creating a team invitation"""
    headers = {
        "Authorization": f"Bearer {fresh_owner_user['token']}",
        "X-Team-Id": fresh_test_team["id"],
    }
    invitation_data = {"email": "newinvite@test.com", "role": "member"}
    resp = client.post(
        f"/teams/{fresh_test_team['id']}/members", json=invitation_data, headers=headers
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["message"] == "Invitation created successfully"
    assert data["email"] == "newinvite@test.com"
    assert data["role"] == "member"
    assert "invitation_id" in data
    assert "invitation_url" in data
    assert "expires_at" in data
    assert "token" in data["invitation_url"]


def test_duplicate_invitation_returns_existing_url(client, fresh_owner_user, fresh_test_team):
    """Test that creating duplicate invitation returns existing URL"""
    headers = {
        "Authorization": f"Bearer {fresh_owner_user['token']}",
        "X-Team-Id": fresh_test_team["id"],
    }
    invitation_data = {"email": "duplicate@test.com", "role": "member"}

    # Create first invitation
    resp1 = client.post(
        f"/teams/{fresh_test_team['id']}/members", json=invitation_data, headers=headers
    )
    assert resp1.status_code == 200
    first_url = resp1.json()["invitation_url"]
    first_id = resp1.json()["invitation_id"]

    # Create duplicate invitation
    resp2 = client.post(
        f"/teams/{fresh_test_team['id']}/members", json=invitation_data, headers=headers
    )
    assert resp2.status_code == 200
    second_url = resp2.json()["invitation_url"]
    second_id = resp2.json()["invitation_id"]

    # Should return same invitation
    assert first_url == second_url
    assert first_id == second_id


def test_get_pending_invitations(client, fresh_owner_user, invited_user, fresh_test_team):
    """Test getting pending invitations for a user"""
    # Create invitation
    headers = {
        "Authorization": f"Bearer {fresh_owner_user['token']}",
        "X-Team-Id": fresh_test_team["id"],
    }
    invitation_data = {"email": invited_user["email"], "role": "member"}
    resp = client.post(
        f"/teams/{fresh_test_team['id']}/members", json=invitation_data, headers=headers
    )
    assert resp.status_code == 200

    # Get invitations as invited user
    headers = {"Authorization": f"Bearer {invited_user['token']}"}
    resp = client.get("/invitations/me", headers=headers)

    assert resp.status_code == 200
    data = resp.json()
    assert "invitations" in data
    assert len(data["invitations"]) > 0

    # Check invitation details
    invitation = data["invitations"][0]
    assert invitation["email"] == invited_user["email"]
    assert invitation["team_id"] == fresh_test_team["id"]
    assert invitation["status"] == "pending"
    assert invitation["invited_by_email"] == fresh_owner_user["email"]


def test_accept_invitation(client, fresh_owner_user, invited_user, fresh_test_team):
    """Test accepting a team invitation"""
    # Create invitation
    headers = {
        "Authorization": f"Bearer {fresh_owner_user['token']}",
        "X-Team-Id": fresh_test_team["id"],
    }
    invitation_data = {"email": invited_user["email"], "role": "member"}
    resp = client.post(
        f"/teams/{fresh_test_team['id']}/members", json=invitation_data, headers=headers
    )
    assert resp.status_code == 200
    token = resp.json()["invitation_url"].split("token=")[1]

    # Accept invitation
    headers = {"Authorization": f"Bearer {invited_user['token']}"}
    accept_data = {"token": token}
    resp = client.post("/invitations/accept", json=accept_data, headers=headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data["message"] == "Invitation accepted successfully"
    assert data["team_id"] == fresh_test_team["id"]
    assert data["role"] == "member"

    # Verify user is now in the team
    resp = client.get("/users/me/teams", headers=headers)
    assert resp.status_code == 200
    teams = resp.json()["teams"]
    team_ids = [t["id"] for t in teams]
    assert fresh_test_team["id"] in team_ids


def test_reject_invitation(client, fresh_owner_user, reject_user, fresh_test_team):
    """Test rejecting a team invitation"""
    # Create invitation
    headers = {
        "Authorization": f"Bearer {fresh_owner_user['token']}",
        "X-Team-Id": fresh_test_team["id"],
    }
    invitation_data = {"email": reject_user["email"], "role": "member"}
    resp = client.post(
        f"/teams/{fresh_test_team['id']}/members", json=invitation_data, headers=headers
    )
    assert resp.status_code == 200
    invitation_id = resp.json()["invitation_id"]

    # Reject invitation
    headers = {"Authorization": f"Bearer {reject_user['token']}"}
    resp = client.post(f"/invitations/{invitation_id}/reject", headers=headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data["message"] == "Invitation rejected successfully"

    # Verify user is not in the team
    resp = client.get("/users/me/teams", headers=headers)
    assert resp.status_code == 200
    teams = resp.json()["teams"]
    team_ids = [t["id"] for t in teams]
    assert fresh_test_team["id"] not in team_ids


def test_get_team_invitations(client, fresh_owner_user, fresh_test_team):
    """Test getting all invitations for a team (owner only)"""
    headers = {
        "Authorization": f"Bearer {fresh_owner_user['token']}",
        "X-Team-Id": fresh_test_team["id"],
    }

    # Create an invitation first
    invitation_data = {"email": "testinvite@test.com", "role": "member"}
    resp = client.post(
        f"/teams/{fresh_test_team['id']}/members", json=invitation_data, headers=headers
    )
    assert resp.status_code == 200

    # Now get all invitations for the team
    resp = client.get(f"/teams/{fresh_test_team['id']}/invitations", headers=headers)

    assert resp.status_code == 200
    data = resp.json()
    assert "invitations" in data
    assert data["team_id"] == fresh_test_team["id"]

    # Should have at least the invitation we just created
    assert len(data["invitations"]) > 0

    # Check that invitations have all required fields
    invitation = data["invitations"][0]
    assert "id" in invitation
    assert "email" in invitation
    assert "status" in invitation
    assert "invited_by_email" in invitation
    assert "expires_at" in invitation


def test_cancel_invitation(client, fresh_owner_user, fresh_test_team):
    """Test cancelling a pending invitation"""
    # Create invitation
    headers = {
        "Authorization": f"Bearer {fresh_owner_user['token']}",
        "X-Team-Id": fresh_test_team["id"],
    }
    invitation_data = {"email": "cancel@test.com", "role": "member"}
    resp = client.post(
        f"/teams/{fresh_test_team['id']}/members", json=invitation_data, headers=headers
    )
    assert resp.status_code == 200
    invitation_id = resp.json()["invitation_id"]

    # Cancel invitation
    resp = client.delete(
        f"/teams/{fresh_test_team['id']}/invitations/{invitation_id}", headers=headers
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["message"] == "Invitation cancelled successfully"

    # Verify invitation is marked as cancelled
    resp = client.get(f"/teams/{fresh_test_team['id']}/invitations", headers=headers)
    assert resp.status_code == 200
    invitations = resp.json()["invitations"]
    cancelled_invitation = next((inv for inv in invitations if inv["id"] == invitation_id), None)
    assert cancelled_invitation is not None
    assert cancelled_invitation["status"] == "cancelled"


def test_cannot_accept_invitation_wrong_email(
    client, fresh_owner_user, member_user, fresh_test_team
):
    """Test that a user cannot accept invitation meant for different email"""
    # Create invitation for one user
    headers = {
        "Authorization": f"Bearer {fresh_owner_user['token']}",
        "X-Team-Id": fresh_test_team["id"],
    }
    invitation_data = {"email": "someone@test.com", "role": "member"}
    resp = client.post(
        f"/teams/{fresh_test_team['id']}/members", json=invitation_data, headers=headers
    )
    assert resp.status_code == 200
    token = resp.json()["invitation_url"].split("token=")[1]

    # Try to accept as different user
    headers = {"Authorization": f"Bearer {member_user['token']}"}
    accept_data = {"token": token}
    resp = client.post("/invitations/accept", json=accept_data, headers=headers)

    assert resp.status_code == 403
    assert "not for your email" in resp.json()["detail"].lower()


def test_cannot_cancel_non_pending_invitation(
    client, fresh_owner_user, invited_user, fresh_test_team
):
    """Test that accepted/rejected invitations cannot be cancelled"""
    # Create and accept invitation
    headers = {
        "Authorization": f"Bearer {fresh_owner_user['token']}",
        "X-Team-Id": fresh_test_team["id"],
    }
    invitation_data = {"email": "accepted@test.com", "role": "member"}
    resp = client.post(
        f"/teams/{fresh_test_team['id']}/members", json=invitation_data, headers=headers
    )
    assert resp.status_code == 200
    invitation_id = resp.json()["invitation_id"]
    token = resp.json()["invitation_url"].split("token=")[1]

    # Register and accept as new user
    user_data = {"email": "accepted@test.com", "password": "password123"}
    client.post("/auth/register", json=user_data)

    # Verify user in database (for testing, bypass email verification)
    verify_user_in_db("accepted@test.com")

    login_data = {"username": "accepted@test.com", "password": "password123"}
    resp = client.post("/auth/jwt/login", data=login_data)
    new_token = resp.json()["access_token"]

    headers_new = {"Authorization": f"Bearer {new_token}"}
    accept_data = {"token": token}
    resp = client.post("/invitations/accept", json=accept_data, headers=headers_new)
    assert resp.status_code == 200

    # Try to cancel the accepted invitation
    headers = {
        "Authorization": f"Bearer {fresh_owner_user['token']}",
        "X-Team-Id": fresh_test_team["id"],
    }
    resp = client.delete(
        f"/teams/{fresh_test_team['id']}/invitations/{invitation_id}", headers=headers
    )

    assert resp.status_code == 400
    assert "cannot cancel" in resp.json()["detail"].lower()
