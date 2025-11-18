import pytest


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
    
    # Login
    login_data = {
        "username": "owner@test.com",
        "password": "password123",
    }
    resp = client.post("/auth/jwt/login", data=login_data)
    assert resp.status_code == 200
    token = resp.json()["access_token"]
    
    return {"email": "owner@test.com", "token": token}


@pytest.fixture(scope="module")
def member_user(client):
    """Create and authenticate a member user"""
    # Register
    user_data = {
        "email": "member@test.com",
        "password": "password123",
    }
    resp = client.post("/auth/register", json=user_data)
    assert resp.status_code in (200, 201, 400)  # 400 if already exists
    
    # Login
    login_data = {
        "username": "member@test.com",
        "password": "password123",
    }
    resp = client.post("/auth/jwt/login", data=login_data)
    assert resp.status_code == 200
    token = resp.json()["access_token"]
    
    return {"email": "member@test.com", "token": token}


@pytest.fixture(scope="module")
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
    headers = {
        "Authorization": f"Bearer {owner_user['token']}",
        "X-Team-Id": test_team["id"]
    }
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
    headers = {
        "Authorization": f"Bearer {owner_user['token']}",
        "X-Team-Id": test_team["id"]
    }
    invite_data = {
        "email": member_user["email"],
        "role": "member"
    }
    resp = client.post(f"/teams/{test_team['id']}/members", json=invite_data, headers=headers)
    
    assert resp.status_code == 200
    data = resp.json()
    assert data["message"] == "User invited successfully"
    assert data["email"] == member_user["email"]
    assert data["role"] == "member"


def test_invite_duplicate_member(client, owner_user, member_user, test_team):
    """Test inviting a member who is already in the team"""
    headers = {
        "Authorization": f"Bearer {owner_user['token']}",
        "X-Team-Id": test_team["id"]
    }
    invite_data = {
        "email": member_user["email"],
        "role": "member"
    }
    resp = client.post(f"/teams/{test_team['id']}/members", json=invite_data, headers=headers)
    
    assert resp.status_code == 400
    assert "already a member" in resp.json()["detail"]


def test_invite_nonexistent_user(client, owner_user, test_team):
    """Test inviting a user that doesn't exist"""
    headers = {
        "Authorization": f"Bearer {owner_user['token']}",
        "X-Team-Id": test_team["id"]
    }
    invite_data = {
        "email": "nonexistent@test.com",
        "role": "member"
    }
    resp = client.post(f"/teams/{test_team['id']}/members", json=invite_data, headers=headers)
    
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()


def test_member_can_view_members(client, member_user, test_team):
    """Test that a member can view team members"""
    headers = {
        "Authorization": f"Bearer {member_user['token']}",
        "X-Team-Id": test_team["id"]
    }
    resp = client.get(f"/teams/{test_team['id']}/members", headers=headers)
    
    assert resp.status_code == 200
    data = resp.json()
    assert "members" in data
    assert len(data["members"]) >= 2  # owner and member


def test_update_member_role_to_owner(client, owner_user, member_user, test_team):
    """Test promoting a member to owner"""
    # First get the member's user_id
    headers = {
        "Authorization": f"Bearer {owner_user['token']}",
        "X-Team-Id": test_team["id"]
    }
    resp = client.get(f"/teams/{test_team['id']}/members", headers=headers)
    members = resp.json()["members"]
    member_data = next(m for m in members if m["email"] == member_user["email"])
    member_id = member_data["user_id"]
    
    # Promote to owner
    role_data = {"role": "owner"}
    resp = client.put(
        f"/teams/{test_team['id']}/members/{member_id}/role",
        json=role_data,
        headers=headers
    )
    
    assert resp.status_code == 200
    data = resp.json()
    assert data["message"] == "Role updated successfully"
    assert data["new_role"] == "owner"


def test_update_member_role_to_member(client, owner_user, member_user, test_team):
    """Test demoting an owner to member"""
    # First get the member's user_id
    headers = {
        "Authorization": f"Bearer {owner_user['token']}",
        "X-Team-Id": test_team["id"]
    }
    resp = client.get(f"/teams/{test_team['id']}/members", headers=headers)
    members = resp.json()["members"]
    member_data = next(m for m in members if m["email"] == member_user["email"])
    member_id = member_data["user_id"]
    
    # Demote to member
    role_data = {"role": "member"}
    resp = client.put(
        f"/teams/{test_team['id']}/members/{member_id}/role",
        json=role_data,
        headers=headers
    )
    
    assert resp.status_code == 200
    data = resp.json()
    assert data["message"] == "Role updated successfully"
    assert data["new_role"] == "member"


def test_cannot_demote_last_owner(client, owner_user, test_team):
    """Test that the last owner cannot be demoted"""
    # Get owner's user_id
    headers = {
        "Authorization": f"Bearer {owner_user['token']}",
        "X-Team-Id": test_team["id"]
    }
    resp = client.get(f"/teams/{test_team['id']}/members", headers=headers)
    members = resp.json()["members"]
    owner_data = next(m for m in members if m["email"] == owner_user["email"])
    owner_id = owner_data["user_id"]
    
    # Try to demote
    role_data = {"role": "member"}
    resp = client.put(
        f"/teams/{test_team['id']}/members/{owner_id}/role",
        json=role_data,
        headers=headers
    )
    
    assert resp.status_code == 400
    assert "last owner" in resp.json()["detail"].lower()


def test_member_cannot_invite(client, member_user, test_team):
    """Test that a member cannot invite other users"""
    headers = {
        "Authorization": f"Bearer {member_user['token']}",
        "X-Team-Id": test_team["id"]
    }
    invite_data = {
        "email": "another@test.com",
        "role": "member"
    }
    resp = client.post(f"/teams/{test_team['id']}/members", json=invite_data, headers=headers)
    
    assert resp.status_code == 403
    assert "owner" in resp.json()["detail"].lower()


def test_member_cannot_update_roles(client, owner_user, member_user, test_team):
    """Test that a member cannot change roles"""
    # Get owner's user_id
    headers = {
        "Authorization": f"Bearer {owner_user['token']}",
        "X-Team-Id": test_team["id"]
    }
    resp = client.get(f"/teams/{test_team['id']}/members", headers=headers)
    members = resp.json()["members"]
    owner_data = next(m for m in members if m["email"] == owner_user["email"])
    owner_id = owner_data["user_id"]
    
    # Try to update role as member
    headers_member = {
        "Authorization": f"Bearer {member_user['token']}",
        "X-Team-Id": test_team["id"]
    }
    role_data = {"role": "member"}
    resp = client.put(
        f"/teams/{test_team['id']}/members/{owner_id}/role",
        json=role_data,
        headers=headers_member
    )
    
    assert resp.status_code == 403
    assert "owner" in resp.json()["detail"].lower()


def test_remove_member(client, owner_user, member_user, test_team):
    """Test removing a member from the team"""
    # Get member's user_id
    headers = {
        "Authorization": f"Bearer {owner_user['token']}",
        "X-Team-Id": test_team["id"]
    }
    resp = client.get(f"/teams/{test_team['id']}/members", headers=headers)
    members = resp.json()["members"]
    member_data = next(m for m in members if m["email"] == member_user["email"])
    member_id = member_data["user_id"]
    
    # Remove member
    resp = client.delete(
        f"/teams/{test_team['id']}/members/{member_id}",
        headers=headers
    )
    
    assert resp.status_code == 200
    assert resp.json()["message"] == "Member removed successfully"
    
    # Verify member is removed
    resp = client.get(f"/teams/{test_team['id']}/members", headers=headers)
    members = resp.json()["members"]
    emails = [m["email"] for m in members]
    assert member_user["email"] not in emails


def test_cannot_remove_last_owner(client, owner_user, test_team):
    """Test that the last owner cannot be removed"""
    # Get owner's user_id
    headers = {
        "Authorization": f"Bearer {owner_user['token']}",
        "X-Team-Id": test_team["id"]
    }
    resp = client.get(f"/teams/{test_team['id']}/members", headers=headers)
    members = resp.json()["members"]
    owner_data = next(m for m in members if m["email"] == owner_user["email"])
    owner_id = owner_data["user_id"]
    
    # Try to remove
    resp = client.delete(
        f"/teams/{test_team['id']}/members/{owner_id}",
        headers=headers
    )
    
    assert resp.status_code == 400
    assert "last owner" in resp.json()["detail"].lower()


def test_member_cannot_remove_members(client, owner_user, member_user, test_team):
    """Test that a member cannot remove other members"""
    # First re-add the member
    headers_owner = {
        "Authorization": f"Bearer {owner_user['token']}",
        "X-Team-Id": test_team["id"]
    }
    invite_data = {
        "email": member_user["email"],
        "role": "member"
    }
    client.post(f"/teams/{test_team['id']}/members", json=invite_data, headers=headers_owner)
    
    # Get owner's user_id
    resp = client.get(f"/teams/{test_team['id']}/members", headers=headers_owner)
    members = resp.json()["members"]
    owner_data = next(m for m in members if m["email"] == owner_user["email"])
    owner_id = owner_data["user_id"]
    
    # Try to remove as member
    headers_member = {
        "Authorization": f"Bearer {member_user['token']}",
        "X-Team-Id": test_team["id"]
    }
    resp = client.delete(
        f"/teams/{test_team['id']}/members/{owner_id}",
        headers=headers_member
    )
    
    assert resp.status_code == 403
    assert "owner" in resp.json()["detail"].lower()


def test_update_team_name(client, owner_user, test_team):
    """Test updating team name as owner"""
    headers = {
        "Authorization": f"Bearer {owner_user['token']}",
        "X-Team-Id": test_team["id"]
    }
    update_data = {"name": "Updated Team Name"}
    resp = client.put(f"/teams/{test_team['id']}", json=update_data, headers=headers)
    
    assert resp.status_code == 200
    team = resp.json()
    assert team["name"] == "Updated Team Name"


def test_member_cannot_update_team_name(client, member_user, test_team):
    """Test that a member cannot update team name"""
    headers = {
        "Authorization": f"Bearer {member_user['token']}",
        "X-Team-Id": test_team["id"]
    }
    update_data = {"name": "Hacked Name"}
    resp = client.put(f"/teams/{test_team['id']}", json=update_data, headers=headers)
    
    assert resp.status_code == 403
    assert "owner" in resp.json()["detail"].lower()


def test_delete_team(client, owner_user):
    """Test deleting a team"""
    # Create a team to delete
    headers = {"Authorization": f"Bearer {owner_user['token']}"}
    team_data = {"name": "Team to Delete"}
    resp = client.post("/teams", json=team_data, headers=headers)
    team = resp.json()
    
    # Delete it
    headers = {
        "Authorization": f"Bearer {owner_user['token']}",
        "X-Team-Id": team["id"]
    }
    resp = client.delete(f"/teams/{team['id']}", headers=headers)
    
    assert resp.status_code == 200
    assert resp.json()["message"] == "Team deleted"


def test_member_cannot_delete_team(client, member_user, test_team):
    """Test that a member cannot delete a team"""
    headers = {
        "Authorization": f"Bearer {member_user['token']}",
        "X-Team-Id": test_team["id"]
    }
    resp = client.delete(f"/teams/{test_team['id']}", headers=headers)
    
    assert resp.status_code == 403
    assert "owner" in resp.json()["detail"].lower()


def test_cannot_delete_team_with_multiple_users(client, owner_user, member_user, test_team):
    """Test that a team with multiple users cannot be deleted"""
    headers = {
        "Authorization": f"Bearer {owner_user['token']}",
        "X-Team-Id": test_team["id"]
    }
    resp = client.delete(f"/teams/{test_team['id']}", headers=headers)
    
    assert resp.status_code == 400
    assert "multiple users" in resp.json()["detail"].lower()
