"""Tests for prepend_remote_workdir_cd.

Regression coverage for the `//main.py` quirk: on remote providers the run command
executes from the provider's default cwd (e.g. `/` for Lambda cloud-init), not the
directory where lab.copy_file_mounts() synced the task files. prepend_remote_workdir_cd
prefixes a `cd` into the recorded workdir so a bare `python main.py` resolves.
"""

from transformerlab.services.compute_provider.launch_credentials import WORKDIR_SENTINEL_PATH
from transformerlab.services.compute_provider.launch_template import prepend_remote_workdir_cd
from transformerlab.shared.models.models import ProviderType

EXPECTED_PREFIX = f'cd "$(cat {WORKDIR_SENTINEL_PATH} 2>/dev/null || echo "$HOME")" && '


def test_prefixes_cd_for_remote_provider_with_file_mounts():
    for provider_type in (
        ProviderType.LAMBDA.value,
        ProviderType.RUNPOD.value,
        ProviderType.SKYPILOT.value,
        ProviderType.VASTAI.value,
        ProviderType.DSTACK.value,
    ):
        out = prepend_remote_workdir_cd(
            "python main.py",
            task_id="task-123",
            file_mounts=True,
            provider_type=provider_type,
        )
        assert out == EXPECTED_PREFIX + "python main.py", provider_type


def test_local_provider_is_not_prefixed():
    # Local already forces cwd == $HOME == the file-drop dir.
    out = prepend_remote_workdir_cd(
        "python main.py",
        task_id="task-123",
        file_mounts=True,
        provider_type=ProviderType.LOCAL.value,
    )
    assert out == "python main.py"


def test_no_prefix_when_file_mounts_not_enabled():
    # No synced files (inlined run, or dict-form file_mounts handled natively):
    # copy_file_mounts isn't injected, so there's no sentinel and no workdir to cd into.
    for file_mounts in (False, None, {"/remote": "/local"}):
        out = prepend_remote_workdir_cd(
            "python main.py",
            task_id="task-123",
            file_mounts=file_mounts,
            provider_type=ProviderType.LAMBDA.value,
        )
        assert out == "python main.py", file_mounts


def test_no_prefix_without_task_id():
    out = prepend_remote_workdir_cd(
        "python main.py",
        task_id=None,
        file_mounts=True,
        provider_type=ProviderType.LAMBDA.value,
    )
    assert out == "python main.py"


def test_preserves_shell_operators_in_command():
    # The whole command is later shlex.quoted as one payload to tfl-remote-trap, so
    # operators must be carried through verbatim after the cd prefix.
    cmd = "python main.py --epochs 3 && echo done"
    out = prepend_remote_workdir_cd(
        cmd,
        task_id="task-123",
        file_mounts=True,
        provider_type=ProviderType.RUNPOD.value,
    )
    assert out == EXPECTED_PREFIX + cmd
