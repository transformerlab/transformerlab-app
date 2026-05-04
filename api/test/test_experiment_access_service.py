from unittest.mock import AsyncMock, MagicMock
from datetime import datetime, timezone

import transformerlab.services.experiment_access_service as svc


async def test_touch_experiment_upserts_record():
    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = None
    mock_session.execute.return_value = mock_result

    await svc.touch_experiment(mock_session, "user1", "team1", "exp1")

    mock_session.add.assert_called_once()
    mock_session.commit.assert_called_once()


async def test_touch_experiment_updates_existing_record():
    mock_session = AsyncMock()
    existing = MagicMock()
    existing.last_opened_at = datetime(2024, 1, 1, tzinfo=timezone.utc)
    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = existing
    mock_session.execute.return_value = mock_result

    await svc.touch_experiment(mock_session, "user1", "team1", "exp1")

    assert existing.last_opened_at > datetime(2024, 1, 1, tzinfo=timezone.utc)
    mock_session.commit.assert_called_once()


async def test_get_recent_experiment_ids_returns_ordered_list():
    mock_session = AsyncMock()
    record1 = MagicMock()
    record1.experiment_id = "exp_b"
    record2 = MagicMock()
    record2.experiment_id = "exp_a"
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [record1, record2]
    mock_session.execute.return_value = mock_result

    result = await svc.get_recent_experiment_ids(mock_session, "user1", "team1", limit=3)

    assert result == ["exp_b", "exp_a"]
