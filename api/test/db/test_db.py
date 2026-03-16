import os

# Create test directories before setting environment variables
os.makedirs("./test/tmp/", exist_ok=True)

os.environ["TFL_HOME_DIR"] = "./test/tmp/"
# Note: TFL_WORKSPACE_DIR is not set so that get_workspace_dir() will use the org-based
# workspace directory (./test/tmp/orgs/<team-id>/workspace) after migration


from transformerlab.db.db import (  # noqa: E402
    config_get,
    config_set,
)

from transformerlab.services import experiment_service  # noqa: E402

import transformerlab.db.session as db  # noqa: E402
from sqlalchemy import select  # noqa: E402

from transformerlab.db.session import async_session  # noqa: E402
from transformerlab.shared.models.models import Config  # noqa: E402


import pytest  # noqa: E402


@pytest.mark.asyncio
async def test_config_get_returns_none_for_missing():
    value = await config_get("missing_config_key")
    assert value is None


pytest_plugins = ("pytest_asyncio",)


pytest_plugins = ("pytest_asyncio",)


@pytest.fixture(scope="session", autouse=True)
def manage_test_tmp_dir():
    yield
    # delete the database:
    db_path = os.path.join("./test/tmp", "llmlab.sqlite3")
    if os.path.exists(db_path):
        os.remove(db_path)


@pytest.fixture(scope="module", autouse=True)
async def setup_db():
    await db.init()
    yield
    await db.close()


@pytest.fixture
async def test_experiment():
    # Converted from using DB to use service
    # Setup code to create test_experiment
    existing = experiment_service.experiment_get("test_experiment")
    if existing:
        experiment_service.experiment_delete(existing["id"])
    experiment_id = experiment_service.experiment_create("test_experiment", {})
    yield experiment_id
    # Teardown code to delete test_experiment
    experiment_service.experiment_delete(experiment_id)


# content of test_sample.py


def test_db_exists():
    global db
    assert db is not None


class TestConfig:
    @pytest.mark.asyncio
    async def test_config_set_and_get(self):
        await config_set("test_key", "test_value")
        value = await config_get("test_key")
        assert value == "test_value"
        # now try to set the same key with a different value
        await config_set("test_key", "test_value2")
        value = await config_get("test_key")
        assert value == "test_value2"
        # now try to get a key that does not exist
        value = await config_get("test_key2_SHOULD_NOT_EXIST")
        assert value is None
        # now try to set a key with None value
        await config_set("test_key3", None)
        value = await config_get("test_key3")
        assert value is None
        # now try to set a key with empty string value
        await config_set("test_key4", "")
        value = await config_get("test_key4")
        assert value == ""

    @pytest.mark.asyncio
    async def test_team_wide_config_does_not_create_duplicates(self):
        team_id = "team-1"
        key = "team_unique_key"

        # First set
        await config_set(key, "value1", user_id=None, team_id=team_id)
        # Second set with different value should update in-place, not insert a new row
        await config_set(key, "value2", user_id=None, team_id=team_id)

        async with async_session() as session:
            result = await session.execute(
                select(Config).where(
                    Config.key == key,
                    Config.user_id.is_(None),
                    Config.team_id == team_id,
                )
            )
            rows = result.scalars().all()

        assert len(rows) == 1
        assert rows[0].value == "value2"

    @pytest.mark.asyncio
    async def test_user_specific_config_does_not_create_duplicates(self):
        team_id = "team-1"
        user_id = "user-1"
        key = "user_unique_key"

        # First set
        await config_set(key, "value1", user_id=user_id, team_id=team_id)
        # Second set with different value should update in-place, not insert a new row
        await config_set(key, "value2", user_id=user_id, team_id=team_id)

        async with async_session() as session:
            result = await session.execute(
                select(Config).where(
                    Config.key == key,
                    Config.user_id == user_id,
                    Config.team_id == team_id,
                )
            )
            rows = result.scalars().all()

        assert len(rows) == 1
        assert rows[0].value == "value2"
