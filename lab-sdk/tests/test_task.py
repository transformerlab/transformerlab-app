import os
import importlib
import pytest


def _fresh(monkeypatch):
    for mod in ["lab.task", "lab.dirs", "lab.experiment"]:
        if mod in importlib.sys.modules:
            importlib.sys.modules.pop(mod)


@pytest.mark.asyncio
async def test_task_get_dir(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.task import Task

    task = Task("test-task")
    d = await task.get_dir()
    assert d.endswith(os.path.join("tasks", "test-task"))


@pytest.mark.asyncio
async def test_task_create_and_get(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.task import Task

    # Create task and verify it exists
    task = await Task.create("test_task")
    assert task is not None
    task_dir = await task.get_dir()
    assert os.path.isdir(task_dir)
    index_file = os.path.join(task_dir, "index.json")
    assert os.path.isfile(index_file)

    # Get the task and verify its properties
    task2 = await Task.get("test_task")
    assert isinstance(task2, Task)
    data = await task2.get_json_data()
    assert data["id"] == "test_task"


@pytest.mark.asyncio
async def test_task_default_json(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.task import Task

    task = await Task.create("test_task_default")
    data = await task.get_json_data()
    assert data["id"] == "test_task_default"
    assert data["name"] == ""
    assert data["type"] == ""
    assert data["inputs"] == {}
    assert data["config"] == {}
    assert data["plugin"] == ""
    assert data["outputs"] == {}
    assert data["experiment_id"] is None
    assert data["remote_task"] is False
    assert "created_at" in data
    assert "updated_at" in data


@pytest.mark.asyncio
async def test_task_set_metadata(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.task import Task

    task = await Task.create("test_task_metadata")

    # Test setting all metadata fields
    await task.set_metadata(
        name="Test Task",
        type="training",
        inputs={"input1": "value1"},
        config={"epochs": 10},
        plugin="test_plugin",
        outputs={"output1": "result1"},
        experiment_id="exp1",
        remote_task=True,
    )
    data = await task.get_json_data()
    assert data["name"] == "Test Task"
    assert data["type"] == "training"
    assert data["inputs"] == {"input1": "value1"}
    assert data["config"] == {"epochs": 10}
    assert data["plugin"] == "test_plugin"
    assert data["outputs"] == {"output1": "result1"}
    assert data["experiment_id"] == "exp1"
    assert data["remote_task"] is True
    assert "updated_at" in data

    # Test partial updates
    await task.set_metadata(name="Updated Task", type="evaluation")
    data = await task.get_json_data()
    assert data["name"] == "Updated Task"
    assert data["type"] == "evaluation"
    # Other fields should remain unchanged
    assert data["plugin"] == "test_plugin"


@pytest.mark.asyncio
async def test_task_get_metadata(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.task import Task

    task = await Task.create("test_task_get")
    await task.set_metadata(name="My Task", type="training")
    metadata = await task.get_metadata()
    assert metadata["id"] == "test_task_get"
    assert metadata["name"] == "My Task"
    assert metadata["type"] == "training"


@pytest.mark.asyncio
async def test_task_list_all(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.task import Task

    # Create multiple tasks
    task1 = await Task.create("task1")
    await task1.set_metadata(name="Task 1", type="training")
    task2 = await Task.create("task2")
    await task2.set_metadata(name="Task 2", type="evaluation")

    # List all tasks
    all_tasks = await Task.list_all()
    assert isinstance(all_tasks, list)
    assert len(all_tasks) >= 2

    # Verify tasks are in the list
    task_ids = [t["id"] for t in all_tasks]
    assert "task1" in task_ids
    assert "task2" in task_ids

    # Verify tasks are sorted by created_at descending
    if len(all_tasks) > 1:
        created_dates = [t.get("created_at", "") for t in all_tasks]
        assert created_dates == sorted(created_dates, reverse=True)


@pytest.mark.asyncio
async def test_task_list_by_type(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.task import Task

    # Create tasks with different types
    task1 = await Task.create("task_training")
    await task1.set_metadata(type="training")
    task2 = await Task.create("task_eval")
    await task2.set_metadata(type="evaluation")
    task3 = await Task.create("task_training2")
    await task3.set_metadata(type="training")

    # List tasks by type
    training_tasks = await Task.list_by_type("training")
    assert len(training_tasks) >= 2
    assert all(t["type"] == "training" for t in training_tasks)

    eval_tasks = await Task.list_by_type("evaluation")
    assert len(eval_tasks) >= 1
    assert all(t["type"] == "evaluation" for t in eval_tasks)


@pytest.mark.asyncio
async def test_task_list_by_experiment(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.task import Task

    # Create tasks with different experiment IDs
    task1 = await Task.create("task_exp1_1")
    await task1.set_metadata(experiment_id=1)
    task2 = await Task.create("task_exp1_2")
    await task2.set_metadata(experiment_id=1)
    task3 = await Task.create("task_exp2_1")
    await task3.set_metadata(experiment_id=2)

    # List tasks by experiment
    exp1_tasks = await Task.list_by_experiment(1)
    assert len(exp1_tasks) >= 2
    assert all(t["experiment_id"] == 1 for t in exp1_tasks)

    exp2_tasks = await Task.list_by_experiment(2)
    assert len(exp2_tasks) >= 1
    assert all(t["experiment_id"] == 2 for t in exp2_tasks)


@pytest.mark.asyncio
async def test_task_list_by_type_in_experiment(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.task import Task

    # Create tasks with different combinations
    task1 = await Task.create("task_exp1_training")
    await task1.set_metadata(type="training", experiment_id=1)
    task2 = await Task.create("task_exp1_eval")
    await task2.set_metadata(type="evaluation", experiment_id=1)
    task3 = await Task.create("task_exp2_training")
    await task3.set_metadata(type="training", experiment_id=2)

    # List tasks by type and experiment
    exp1_training = await Task.list_by_type_in_experiment("training", 1)
    assert len(exp1_training) >= 1
    assert all(t["type"] == "training" and t["experiment_id"] == 1 for t in exp1_training)

    exp2_training = await Task.list_by_type_in_experiment("training", 2)
    assert len(exp2_training) >= 1
    assert all(t["type"] == "training" and t["experiment_id"] == 2 for t in exp2_training)


@pytest.mark.asyncio
async def test_task_get_by_id(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.task import Task

    # Create a task
    task = await Task.create("test_task_get_by_id")
    await task.set_metadata(name="Test Task")

    # Get task by ID
    task_data = await Task.get_by_id("test_task_get_by_id")
    assert task_data is not None
    assert task_data["id"] == "test_task_get_by_id"
    assert task_data["name"] == "Test Task"

    # Get non-existent task
    task_data_none = await Task.get_by_id("non_existent_task")
    assert task_data_none is None


@pytest.mark.asyncio
async def test_task_delete_all(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.task import Task

    # Create some tasks
    await Task.create("task_to_delete_1")
    await Task.create("task_to_delete_2")

    # Verify they exist
    all_tasks = await Task.list_all()
    assert len(all_tasks) >= 2

    # Delete all tasks
    await Task.delete_all()

    # Verify tasks directory is empty or doesn't exist
    from lab.dirs import get_tasks_dir

    tasks_dir = await get_tasks_dir()
    if os.path.exists(tasks_dir):
        assert len(os.listdir(tasks_dir)) == 0


@pytest.mark.asyncio
async def test_task_list_all_empty_dir(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.task import Task

    # List all tasks when none exist
    all_tasks = await Task.list_all()
    assert isinstance(all_tasks, list)
    # Should return empty list, not raise error
