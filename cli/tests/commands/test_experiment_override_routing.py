"""Regression tests for the ``--experiment/-e`` override and server routing.

Bug: passing ``-e <experiment>`` resolved the experiment id without running
``check_configs()``. ``check_configs()`` is the only caller of
``set_base_url(config.get("server"))``, so the override path left the module
default (``DEFAULT_BASE_URL`` = the unreachable ``alpha.lab.cloud:8338``) in
place and every ``-e`` request was sent to the wrong host. The default (no
``-e``) path went through ``require_current_experiment()`` -> ``check_configs()``
and therefore routed to the configured server.
"""

import pytest

import transformerlab_cli.util.shared as shared_mod
import transformerlab_cli.util.config as config_mod
from transformerlab_cli.state import cli_state
from transformerlab_cli.commands import task as task_cmd
from transformerlab_cli.commands import job as job_cmd
from transformerlab_cli.commands import notes as notes_cmd

CONFIGURED_SERVER = "http://beta.lab.cloud"


def _write_valid_config():
    """Persist a complete config pointing at a non-default server."""
    config_mod.cached_config = None
    config_mod._save_config(
        {
            "server": CONFIGURED_SERVER,
            "team_id": "team-1",
            "user_email": "researcher@example.com",
            "current_experiment": "gamma",
        }
    )


@pytest.fixture()
def reset_base_url(monkeypatch):
    """Force the stale module default and use json format to avoid network."""
    monkeypatch.setattr(cli_state, "output_format", "json")
    shared_mod.set_base_url(shared_mod.DEFAULT_BASE_URL)
    assert shared_mod.BASE_URL() == "http://alpha.lab.cloud:8338"
    yield
    shared_mod.set_base_url(shared_mod.DEFAULT_BASE_URL)


@pytest.mark.parametrize("module", [task_cmd, job_cmd, notes_cmd])
def test_experiment_override_routes_to_configured_server(module, reset_base_url):
    """`-e <exp>` must still apply the configured server, not the stale default."""
    _write_valid_config()

    resolved = module._resolve_experiment_id("delta")

    assert resolved == "delta"
    assert shared_mod.BASE_URL() == CONFIGURED_SERVER, (
        f"{module.__name__}._resolve_experiment_id left BASE_URL at the stale default instead of the configured server"
    )


@pytest.mark.parametrize("module", [task_cmd, job_cmd, notes_cmd])
def test_default_experiment_path_still_routes_to_configured_server(module, reset_base_url):
    """The no-override path keeps routing to the configured server (unchanged)."""
    _write_valid_config()

    resolved = module._resolve_experiment_id(None)

    assert resolved == "gamma"
    assert shared_mod.BASE_URL() == CONFIGURED_SERVER
