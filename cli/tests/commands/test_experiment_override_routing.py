"""Regression tests for the ``--experiment/-e`` override and server routing.

Bug: passing ``-e <experiment>`` resolved the experiment id without running
``check_configs()``. ``check_configs()`` is the only caller of
``set_base_url(config.get("server"))``, so the override path left the module
default (``DEFAULT_BASE_URL`` = the unreachable ``alpha.lab.cloud:8338``) in
place and every ``-e`` request was sent to the wrong host. The default (no
``-e``) path went through ``require_current_experiment()`` -> ``check_configs()``
and therefore routed to the configured server.

The resolver now lives in a single place (``config.resolve_experiment_id``); the
task, job, and notes command groups all import and call that one function.
"""

import pytest

import transformerlab_cli.util.shared as shared_mod
import transformerlab_cli.util.config as config_mod
from transformerlab_cli.state import cli_state
from transformerlab_cli.commands import task as task_cmd
from transformerlab_cli.commands import job as job_cmd
from transformerlab_cli.commands import notes as notes_cmd

CONFIGURED_SERVER = "http://beta.lab.cloud"
STALE_DEFAULT = "http://alpha.lab.cloud:8338"
COMMAND_MODULES = [task_cmd, job_cmd, notes_cmd]


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


@pytest.fixture(autouse=True)
def _force_stale_base_url(monkeypatch):
    """Start each test from the stale module default; json format avoids network."""
    monkeypatch.setattr(cli_state, "output_format", "json")
    shared_mod.set_base_url(STALE_DEFAULT)
    assert shared_mod.BASE_URL() == STALE_DEFAULT
    yield
    shared_mod.set_base_url(shared_mod.DEFAULT_BASE_URL)


@pytest.mark.parametrize("module", COMMAND_MODULES)
def test_command_modules_share_single_resolver(module):
    """Each command group delegates to the one shared resolver (no duplicate copies)."""
    assert module.resolve_experiment_id is config_mod.resolve_experiment_id


def test_experiment_override_routes_to_configured_server():
    """`-e <exp>` must apply the configured server, not the stale default."""
    _write_valid_config()

    resolved = config_mod.resolve_experiment_id("delta")

    assert resolved == "delta"
    assert shared_mod.BASE_URL() == CONFIGURED_SERVER


def test_default_experiment_path_routes_to_configured_server():
    """The no-override path keeps routing to the configured server."""
    _write_valid_config()

    resolved = config_mod.resolve_experiment_id(None)

    assert resolved == "gamma"
    assert shared_mod.BASE_URL() == CONFIGURED_SERVER
