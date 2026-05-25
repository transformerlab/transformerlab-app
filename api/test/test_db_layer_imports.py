# api/test/test_db_layer_imports.py
"""Guards the #1282 refactor: the API package and new db modules import cleanly
(no circular imports), and user_model.py stays gone once removed."""

import importlib


def test_api_package_imports():
    # transformerlab.api does not exist as a module (api/api.py is a standalone
    # entry-point script, not part of the transformerlab package). Instead we
    # import transformerlab.routers, which is what api.py imports heavily and
    # which exercises the full app import graph including db, services, and
    # shared utilities.
    importlib.import_module("transformerlab.routers")


def test_db_user_and_team_import():
    importlib.import_module("transformerlab.db.user")
    importlib.import_module("transformerlab.db.team")


def test_user_model_module_is_gone():
    import pytest

    with pytest.raises(ModuleNotFoundError):
        importlib.import_module("transformerlab.shared.models.user_model")
