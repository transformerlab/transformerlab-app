from unittest.mock import AsyncMock, MagicMock

from sqlalchemy.exc import IntegrityError

import transformerlab.services.experiment_access_service as svc


async def test_touch_experiment_upserts_record():
    mock_session = AsyncMock()
    mock_session.add = MagicMock()
    mock_result = MagicMock(rowcount=0)
    mock_session.execute.return_value = mock_result

    await svc.touch_experiment(mock_session, "user1", "team1", "exp1")

    mock_session.add.assert_called_once()
    mock_session.commit.assert_called_once()


async def test_touch_experiment_updates_existing_record():
    mock_session = AsyncMock()
    mock_session.add = MagicMock()
    mock_result = MagicMock(rowcount=1)
    mock_session.execute.return_value = mock_result

    await svc.touch_experiment(mock_session, "user1", "team1", "exp1")

    mock_session.add.assert_not_called()
    mock_session.commit.assert_called_once()


async def test_touch_experiment_handles_insert_race_integrity_error():
    mock_session = AsyncMock()
    mock_session.add = MagicMock()
    mock_result = MagicMock(rowcount=0)
    mock_session.execute.return_value = mock_result
    mock_session.commit.side_effect = [
        IntegrityError("stmt", "params", Exception("duplicate key")),
    ]

    await svc.touch_experiment(mock_session, "user1", "team1", "exp1")

    mock_session.rollback.assert_called_once()


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
