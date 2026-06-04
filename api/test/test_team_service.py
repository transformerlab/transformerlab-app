import io
import pytest
import types
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID

from fastapi import HTTPException
from PIL import Image

from transformerlab.shared.models.models import InvitationStatus


# ==================== Helpers ====================


def _make_png_bytes(mode: str = "RGB") -> bytes:
    buf = io.BytesIO()
    color = (255, 0, 0) if mode == "RGB" else (255, 0, 0, 128)
    Image.new(mode, (10, 10), color=color).save(buf, format="PNG")
    return buf.getvalue()


def _make_mock_session():
    session = MagicMock()
    session.add = MagicMock()
    session.commit = AsyncMock()
    session.refresh = AsyncMock()
    session.execute = AsyncMock()
    session.delete = AsyncMock()
    return session


# ==================== Logo validation ====================


def test_normalize_uuid_ids_filters_invalid_values():
    from transformerlab.services.team_service import _normalize_uuid_ids

    valid_1 = "12345678-1234-1234-1234-1234567890ab"
    valid_2 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"

    result = _normalize_uuid_ids([valid_1, "not-a-uuid", None, valid_2])  # type: ignore[list-item]

    assert result == [UUID(valid_1), UUID(valid_2)]


def test_validate_logo_rejects_non_image_content_type():
    from transformerlab.services.team_service import _validate_and_process_logo

    with pytest.raises(HTTPException) as exc:
        _validate_and_process_logo(b"data", content_type="application/pdf", filename="file.pdf")
    assert exc.value.status_code == 400
    assert "Invalid file type" in exc.value.detail


def test_validate_logo_rejects_bad_extension():
    from transformerlab.services.team_service import _validate_and_process_logo

    with pytest.raises(HTTPException) as exc:
        _validate_and_process_logo(b"data", content_type="image/png", filename="file.exe")
    assert exc.value.status_code == 400
    assert "Invalid file extension" in exc.value.detail


def test_validate_logo_rejects_oversized_file():
    from transformerlab.services.team_service import _validate_and_process_logo

    big = b"x" * (1 * 1024 * 1024 + 1)
    with pytest.raises(HTTPException) as exc:
        _validate_and_process_logo(big, content_type="image/png", filename="logo.png")
    assert exc.value.status_code == 400
    assert "exceeds maximum" in exc.value.detail


def test_validate_logo_rejects_invalid_image_data():
    from transformerlab.services.team_service import _validate_and_process_logo

    with pytest.raises(HTTPException) as exc:
        _validate_and_process_logo(b"not-an-image", content_type="image/png", filename="logo.png")
    assert exc.value.status_code == 400
    assert "Invalid image file" in exc.value.detail


def test_validate_logo_converts_rgba_to_rgb():
    from transformerlab.services.team_service import _validate_and_process_logo

    result = _validate_and_process_logo(_make_png_bytes("RGBA"), content_type="image/png", filename="logo.png")
    assert result.mode == "RGB"


def test_validate_logo_accepts_valid_rgb_png():
    from transformerlab.services.team_service import _validate_and_process_logo

    result = _validate_and_process_logo(_make_png_bytes("RGB"), content_type="image/png", filename="logo.png")
    assert result.mode == "RGB"


async def test_set_team_logo_writes_png_bytes_to_async_storage(monkeypatch):
    from transformerlab.services import team_service

    write_mock = AsyncMock()

    class _AsyncWriter:
        async def __aenter__(self):
            return types.SimpleNamespace(write=write_mock)

        async def __aexit__(self, _exc_type, _exc, _tb):
            return False

    storage_mock = types.SimpleNamespace(
        join=lambda base, name: f"{base}/{name}",
        open=AsyncMock(return_value=_AsyncWriter()),
    )

    monkeypatch.setattr(team_service, "storage", storage_mock)

    result = await team_service.set_team_logo("/tmp/workspace", _make_png_bytes("RGBA"), "image/png", "logo.png")

    assert result["status"] == "success"
    write_mock.assert_awaited_once()
    written_bytes = write_mock.await_args.args[0]
    assert isinstance(written_bytes, bytes)
    assert written_bytes.startswith(b"\x89PNG\r\n\x1a\n")


# ==================== Personal team detection ====================


def test_is_personal_team_true():
    from transformerlab.services.team_service import _is_personal_team

    user = MagicMock()
    user.first_name = "Alice"
    user.email = "alice@example.com"
    team = MagicMock()
    team.name = "Alice's Team"
    assert _is_personal_team(user, team) is True


def test_is_personal_team_false():
    from transformerlab.services.team_service import _is_personal_team

    user = MagicMock()
    user.first_name = "Alice"
    user.email = "alice@example.com"
    team = MagicMock()
    team.name = "Research Group"
    assert _is_personal_team(user, team) is False


def test_is_personal_team_falls_back_to_email_prefix():
    from transformerlab.services.team_service import _is_personal_team

    user = MagicMock()
    user.first_name = None
    user.email = "bob@example.com"
    team = MagicMock()
    team.name = "bob's Team"
    assert _is_personal_team(user, team) is True


# ==================== Team creation limit ====================


def test_max_teams_per_user_unset_is_unlimited(monkeypatch):
    from transformerlab.services.team_service import _get_max_teams_per_user

    monkeypatch.delenv("TFL_MAX_TEAMS_PER_USER", raising=False)
    assert _get_max_teams_per_user() is None


def test_max_teams_per_user_valid_int(monkeypatch):
    from transformerlab.services.team_service import _get_max_teams_per_user

    monkeypatch.setenv("TFL_MAX_TEAMS_PER_USER", "3")
    assert _get_max_teams_per_user() == 3


def test_max_teams_per_user_invalid_value_is_unlimited(monkeypatch):
    from transformerlab.services.team_service import _get_max_teams_per_user

    monkeypatch.setenv("TFL_MAX_TEAMS_PER_USER", "not-a-number")
    assert _get_max_teams_per_user() is None


def test_max_teams_per_user_non_positive_is_unlimited(monkeypatch):
    from transformerlab.services.team_service import _get_max_teams_per_user

    monkeypatch.setenv("TFL_MAX_TEAMS_PER_USER", "0")
    assert _get_max_teams_per_user() is None
    monkeypatch.setenv("TFL_MAX_TEAMS_PER_USER", "-2")
    assert _get_max_teams_per_user() is None


def test_max_teams_per_user_empty_is_unlimited(monkeypatch):
    from transformerlab.services.team_service import _get_max_teams_per_user

    monkeypatch.setenv("TFL_MAX_TEAMS_PER_USER", "   ")
    assert _get_max_teams_per_user() is None


def _make_user(first_name="Alice", email="alice@example.com", user_id="user-1"):
    user = MagicMock()
    user.first_name = first_name
    user.email = email
    user.id = user_id
    return user


def _make_user_team(team_id, role):
    ut = MagicMock()
    ut.team_id = team_id
    ut.role = role
    return ut


def _make_team(team_id, name):
    team = MagicMock()
    team.id = team_id
    team.name = name
    return team


async def test_count_owned_non_personal_teams_excludes_personal_and_member(monkeypatch):
    from transformerlab.services import team_service
    from transformerlab.shared.models.models import TeamRole

    user = _make_user()
    session = _make_mock_session()

    user_teams = [
        _make_user_team("t-personal", TeamRole.OWNER.value),
        _make_user_team("t-owned-1", TeamRole.OWNER.value),
        _make_user_team("t-owned-2", TeamRole.OWNER.value),
        _make_user_team("t-member", TeamRole.MEMBER.value),
    ]
    teams = [
        _make_team("t-personal", "Alice's Team"),
        _make_team("t-owned-1", "Research Group"),
        _make_team("t-owned-2", "Side Project"),
    ]

    monkeypatch.setattr(team_service.db_team, "get_user_teams", AsyncMock(return_value=user_teams))
    monkeypatch.setattr(team_service.db_team, "get_teams_by_ids", AsyncMock(return_value=teams))

    count = await team_service._count_owned_non_personal_teams(session, user)
    assert count == 2


async def test_count_owned_non_personal_teams_zero_when_only_personal(monkeypatch):
    from transformerlab.services import team_service
    from transformerlab.shared.models.models import TeamRole

    user = _make_user()
    session = _make_mock_session()

    user_teams = [_make_user_team("t-personal", TeamRole.OWNER.value)]
    teams = [_make_team("t-personal", "Alice's Team")]

    monkeypatch.setattr(team_service.db_team, "get_user_teams", AsyncMock(return_value=user_teams))
    monkeypatch.setattr(team_service.db_team, "get_teams_by_ids", AsyncMock(return_value=teams))

    assert await team_service._count_owned_non_personal_teams(session, user) == 0


async def test_create_team_raises_when_at_limit(monkeypatch):
    from transformerlab.services import team_service

    monkeypatch.setenv("TFL_MAX_TEAMS_PER_USER", "2")
    monkeypatch.setattr(team_service, "_count_owned_non_personal_teams", AsyncMock(return_value=2))
    insert_mock = AsyncMock()
    monkeypatch.setattr(team_service.db_team, "insert_team", insert_mock)

    user = _make_user()
    session = _make_mock_session()

    with pytest.raises(HTTPException) as exc:
        await team_service.create_team(session, "New Team", user)
    assert exc.value.status_code == 403
    assert "maximum number of teams" in exc.value.detail
    insert_mock.assert_not_called()


async def test_create_team_allows_when_under_limit(monkeypatch):
    from transformerlab.services import team_service

    monkeypatch.setenv("TFL_MAX_TEAMS_PER_USER", "5")
    monkeypatch.setattr(team_service, "_count_owned_non_personal_teams", AsyncMock(return_value=1))
    monkeypatch.setattr(team_service.db_team, "insert_team", AsyncMock(return_value=_make_team("t-new", "New Team")))
    monkeypatch.setattr(team_service.db_team, "add_user_to_team", AsyncMock())
    # Skip storage provisioning and default-experiment creation side effects.
    monkeypatch.delenv("TFL_REMOTE_STORAGE_ENABLED", raising=False)
    monkeypatch.delenv("TFL_STORAGE_PROVIDER", raising=False)
    monkeypatch.setattr(team_service, "set_organization_id", lambda _id: None)
    monkeypatch.setattr(team_service.Experiment, "create_or_get", AsyncMock())

    user = _make_user()
    session = _make_mock_session()

    result = await team_service.create_team(session, "New Team", user)
    assert result == {"id": "t-new", "name": "New Team"}


async def test_create_team_unlimited_when_env_unset(monkeypatch):
    from transformerlab.services import team_service

    monkeypatch.delenv("TFL_MAX_TEAMS_PER_USER", raising=False)
    count_mock = AsyncMock(return_value=99)
    monkeypatch.setattr(team_service, "_count_owned_non_personal_teams", count_mock)
    monkeypatch.setattr(team_service.db_team, "insert_team", AsyncMock(return_value=_make_team("t-new", "New Team")))
    monkeypatch.setattr(team_service.db_team, "add_user_to_team", AsyncMock())
    monkeypatch.delenv("TFL_REMOTE_STORAGE_ENABLED", raising=False)
    monkeypatch.delenv("TFL_STORAGE_PROVIDER", raising=False)
    monkeypatch.setattr(team_service, "set_organization_id", lambda _id: None)
    monkeypatch.setattr(team_service.Experiment, "create_or_get", AsyncMock())

    user = _make_user()
    session = _make_mock_session()

    result = await team_service.create_team(session, "New Team", user)
    assert result == {"id": "t-new", "name": "New Team"}
    # Count is never consulted when the limit is unset.
    count_mock.assert_not_called()


# ==================== Member management ====================


async def test_remove_member_raises_if_not_in_team():
    from transformerlab.services.team_service import remove_member

    session = _make_mock_session()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    session.execute.return_value = mock_result

    with pytest.raises(HTTPException) as exc:
        await remove_member(session, "team-1", "user-99")
    assert exc.value.status_code == 404


async def test_update_member_role_raises_on_invalid_role():
    from transformerlab.services.team_service import update_member_role

    session = _make_mock_session()
    with pytest.raises(HTTPException) as exc:
        await update_member_role(session, "team-1", "user-1", "superadmin")
    assert exc.value.status_code == 400
    assert "Invalid role" in exc.value.detail


# ==================== Invitation logic ====================


async def test_accept_invitation_raises_if_not_found():
    from transformerlab.services.team_service import accept_invitation

    session = _make_mock_session()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    session.execute.return_value = mock_result

    user = MagicMock()
    user.email = "alice@example.com"
    user.id = "user-1"

    with pytest.raises(HTTPException) as exc:
        await accept_invitation(session, user, token="bad-token")
    assert exc.value.status_code == 404


async def test_accept_invitation_raises_if_wrong_email():
    from transformerlab.services.team_service import accept_invitation

    session = _make_mock_session()

    invitation = MagicMock()
    invitation.email = "other@example.com"
    invitation.status = InvitationStatus.PENDING.value
    invitation.expires_at = datetime.utcnow() + timedelta(days=1)

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = invitation
    session.execute.return_value = mock_result

    user = MagicMock()
    user.email = "alice@example.com"
    user.id = "user-1"

    with pytest.raises(HTTPException) as exc:
        await accept_invitation(session, user, token="some-token")
    assert exc.value.status_code == 403


async def test_accept_invitation_by_id_raises_if_not_found():
    from transformerlab.services.team_service import accept_invitation

    session = _make_mock_session()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    session.execute.return_value = mock_result

    user = MagicMock()
    user.email = "alice@example.com"
    user.id = "user-1"

    with pytest.raises(HTTPException) as exc:
        await accept_invitation(session, user, invitation_id="inv-bad")
    assert exc.value.status_code == 404


async def test_reject_invitation_raises_if_not_pending():
    from transformerlab.services.team_service import reject_invitation

    session = _make_mock_session()

    invitation = MagicMock()
    invitation.email = "alice@example.com"
    invitation.status = InvitationStatus.ACCEPTED.value

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = invitation
    session.execute.return_value = mock_result

    with pytest.raises(HTTPException) as exc:
        await reject_invitation(session, "inv-1", "alice@example.com")
    assert exc.value.status_code == 400
