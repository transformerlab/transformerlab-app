import pytest
from pydantic import ValidationError
from transformerlab.schemas.task import GroupChildConfig, GroupLaunchRequest, GroupYamlSpec, TaskYamlSpec


def test_group_child_config_minimal():
    cfg = GroupChildConfig(name="job-a")
    assert cfg.name == "job-a"
    assert cfg.run is None


def test_group_child_config_full():
    cfg = GroupChildConfig(
        name="train",
        run="python train.py",
        setup="pip install -r requirements.txt",
        subtype="interactive",
        interactive_type="vscode",
        resources={"accelerators": "NVIDIA", "num_nodes": 1},
        env_vars={"LR": "0.001"},
    )
    assert cfg.resources["accelerators"] == "NVIDIA"


def test_group_child_config_rejects_unknown():
    with pytest.raises(ValidationError):
        GroupChildConfig(name="x", unknown_field="bad")


def test_group_launch_request_defaults():
    req = GroupLaunchRequest(
        experiment_id="exp-1",
        jobs=[GroupChildConfig(name="a", run="python a.py")],
    )
    assert req.failure_policy == "continue"


def test_group_launch_request_invalid_policy():
    with pytest.raises(ValidationError):
        GroupLaunchRequest(
            experiment_id="exp-1",
            failure_policy="explode",
            jobs=[GroupChildConfig(name="a")],
        )


def test_group_yaml_spec():
    spec = GroupYamlSpec(
        failure_policy="stop_all",
        jobs=[GroupChildConfig(name="a", run="python a.py")],
    )
    assert spec.failure_policy == "stop_all"
    assert len(spec.jobs) == 1


def test_task_yaml_spec_run_optional_when_group_present():
    spec = TaskYamlSpec(
        name="my-task",
        group=GroupYamlSpec(jobs=[GroupChildConfig(name="a", run="python a.py")]),
    )
    assert spec.run is None


def test_task_yaml_spec_run_required_without_group():
    with pytest.raises(ValidationError):
        TaskYamlSpec(name="my-task")  # no run, no group
