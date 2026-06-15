"""Tests for the storage usage snapshot writer (db + service layers).

Uses a real in-memory SQLite database so the upsert / per-day idempotency logic
is actually exercised; the CloudWatch read is mocked out.
"""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from transformerlab.db.storage_usage import upsert_daily_snapshot
from transformerlab.services import storage_usage_snapshot_service as snap
from transformerlab.services.storage_usage_service import StorageUsageReport, TeamStorageUsage
from transformerlab.shared.models.models import Base, StorageUsageSnapshot


async def _make_session_factory():
    """Build an isolated in-memory DB and return (engine, sessionmaker).

    StaticPool keeps every session on the same in-memory connection.
    """
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    return engine, async_sessionmaker(engine, expire_on_commit=False)


async def _all_snapshots(session):
    result = await session.execute(select(StorageUsageSnapshot))
    return list(result.scalars().all())


# ==================== upsert_daily_snapshot ====================


async def test_upsert_is_idempotent_per_utc_day():
    engine, Session = await _make_session_factory()
    try:
        async with Session() as session:
            morning = datetime(2026, 6, 10, 8, 0, 0)
            await upsert_daily_snapshot(
                session, team_id="t1", total_bytes=100, has_data=True, as_of=None, captured_at=morning
            )
            await session.commit()

            # Same UTC day, later time -> update the existing row, not insert.
            evening = datetime(2026, 6, 10, 20, 0, 0)
            await upsert_daily_snapshot(
                session, team_id="t1", total_bytes=250, has_data=True, as_of=None, captured_at=evening
            )
            await session.commit()

            rows = await _all_snapshots(session)
            assert len(rows) == 1
            assert rows[0].total_bytes == 250
            assert rows[0].captured_at == evening

            # Next UTC day -> a new row (history grows).
            next_day = datetime(2026, 6, 11, 8, 0, 0)
            await upsert_daily_snapshot(
                session, team_id="t1", total_bytes=300, has_data=True, as_of=None, captured_at=next_day
            )
            await session.commit()

            rows = await _all_snapshots(session)
            assert len(rows) == 2
            assert sorted(r.total_bytes for r in rows) == [250, 300]
    finally:
        await engine.dispose()


# ==================== snapshot_storage_usage ====================


def _report(teams, *, supported=True, provider="aws", total_bytes=0, message=None):
    return StorageUsageReport(
        provider=provider,
        supported=supported,
        fetched_at=datetime.now(timezone.utc),
        teams=teams,
        total_bytes=total_bytes,
        message=message,
    )


async def test_snapshot_persists_every_team_and_converts_as_of():
    as_of_aware = datetime(2026, 6, 9, 12, 0, tzinfo=timezone.utc)
    report = _report(
        [
            TeamStorageUsage("t1", "Team One", "workspace-t1", 2000, as_of_aware, True),
            TeamStorageUsage("t2", "Team Two", "workspace-t2", 0, None, False),
        ],
        total_bytes=2000,
    )

    engine, Session = await _make_session_factory()
    try:
        async with Session() as session:
            with patch.object(snap, "get_team_storage_usage", AsyncMock(return_value=report)):
                result = await snap.snapshot_storage_usage(session)

            assert result.supported is True
            assert result.teams_written == 2
            assert result.total_bytes == 2000

            rows = {r.team_id: r for r in await _all_snapshots(session)}
            assert rows["t1"].total_bytes == 2000
            assert rows["t1"].has_data is True
            # tz-aware as_of is stored as naive UTC.
            assert rows["t1"].as_of == datetime(2026, 6, 9, 12, 0, 0)
            assert rows["t1"].as_of.tzinfo is None

            assert rows["t2"].total_bytes == 0
            assert rows["t2"].has_data is False
            assert rows["t2"].as_of is None
    finally:
        await engine.dispose()


async def test_snapshot_rerun_same_day_does_not_duplicate():
    report = _report(
        [TeamStorageUsage("t1", "Team One", "workspace-t1", 2000, None, True)],
        total_bytes=2000,
    )
    engine, Session = await _make_session_factory()
    try:
        async with Session() as session:
            with patch.object(snap, "get_team_storage_usage", AsyncMock(return_value=report)):
                await snap.snapshot_storage_usage(session)
                await snap.snapshot_storage_usage(session)  # same UTC day

            rows = await _all_snapshots(session)
            assert len(rows) == 1  # second run updated, did not append
    finally:
        await engine.dispose()


async def test_snapshot_noop_when_unsupported():
    report = _report([], supported=False, provider="gcp", message="not aws")
    engine, Session = await _make_session_factory()
    try:
        async with Session() as session:
            with patch.object(snap, "get_team_storage_usage", AsyncMock(return_value=report)):
                result = await snap.snapshot_storage_usage(session)

            assert result.supported is False
            assert result.teams_written == 0
            assert await _all_snapshots(session) == []
    finally:
        await engine.dispose()
