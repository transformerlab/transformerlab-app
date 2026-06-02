import pytest

from transformerlab.services import share_link_service as svc
from transformerlab.db.session import get_async_session


async def _session():
    async for s in get_async_session():
        return s


@pytest.mark.asyncio
async def test_mint_creates_active_link():
    session = await _session()
    link = await svc.mint_link(
        session,
        resource_type="experiment_notes",
        resource_id="exp-1",
        team_id="team-1",
        user_id="user-1",
    )
    assert link.token
    assert link.revoked_at is None
    assert link.resource_type == "experiment_notes"


@pytest.mark.asyncio
async def test_mint_twice_revokes_previous():
    session = await _session()
    first = await svc.mint_link(session, "experiment_notes", "exp-2", "team-1", "user-1")
    second = await svc.mint_link(session, "experiment_notes", "exp-2", "team-1", "user-1")
    assert first.token != second.token
    refreshed_first = await svc.resolve_token(session, first.token)
    assert refreshed_first is None
    active = await svc.get_active_link(session, "experiment_notes", "exp-2")
    assert active is not None
    assert active.token == second.token


@pytest.mark.asyncio
async def test_revoke_marks_revoked_at():
    session = await _session()
    link = await svc.mint_link(session, "experiment_chart", "exp-3", "team-1", "user-1")
    await svc.revoke_active_link(session, "experiment_chart", "exp-3")
    assert await svc.resolve_token(session, link.token) is None
    assert await svc.get_active_link(session, "experiment_chart", "exp-3") is None


@pytest.mark.asyncio
async def test_revoke_when_none_active_is_noop():
    session = await _session()
    await svc.revoke_active_link(session, "experiment_notes", "does-not-exist")


@pytest.mark.asyncio
async def test_resolve_unknown_token_returns_none():
    session = await _session()
    assert await svc.resolve_token(session, "not-a-real-token") is None


@pytest.mark.asyncio
async def test_mint_rejects_unknown_resource_type():
    session = await _session()
    with pytest.raises(ValueError):
        await svc.mint_link(session, "experiment_logs", "exp-1", "team-1", "user-1")


@pytest.mark.asyncio
async def test_notes_and_chart_are_independent():
    session = await _session()
    notes = await svc.mint_link(session, "experiment_notes", "exp-iso", "team-1", "user-1")
    chart = await svc.mint_link(session, "experiment_chart", "exp-iso", "team-1", "user-1")
    assert await svc.resolve_token(session, notes.token) is not None
    assert await svc.resolve_token(session, chart.token) is not None
