"""Unit tests for profile name resolution and path helpers."""

import os
import transformerlab_cli.util.profile as profile
import transformerlab_cli.util.shared as shared


def _reset():
    profile.set_active(None)


def test_default_when_nothing_selected(monkeypatch):
    monkeypatch.delenv("LAB_PROFILE", raising=False)
    assert profile.resolve_profile_name(None) == "default"


def test_env_var_selects_profile(monkeypatch):
    monkeypatch.setenv("LAB_PROFILE", "staging")
    assert profile.resolve_profile_name(None) == "staging"


def test_flag_overrides_env(monkeypatch):
    monkeypatch.setenv("LAB_PROFILE", "staging")
    assert profile.resolve_profile_name("prod") == "prod"


def test_blank_values_fall_through_to_default(monkeypatch):
    monkeypatch.setenv("LAB_PROFILE", "  ")
    assert profile.resolve_profile_name("") == "default"


def test_invalid_name_raises():
    import pytest

    for bad in ["../etc", "a/b", "a b", "a\tb"]:
        with pytest.raises(ValueError):
            profile.resolve_profile_name(bad)


def test_default_paths_are_root(monkeypatch, tmp_path):
    monkeypatch.setattr(shared, "CONFIG_DIR", str(tmp_path))
    profile.set_active("default")
    assert profile.config_dir() == str(tmp_path)
    assert profile.config_path() == os.path.join(str(tmp_path), "config.json")
    assert profile.credentials_path() == os.path.join(str(tmp_path), "credentials")
    _reset()


def test_named_paths_under_profiles_dir(monkeypatch, tmp_path):
    monkeypatch.setattr(shared, "CONFIG_DIR", str(tmp_path))
    profile.set_active("prod")
    expected_dir = os.path.join(str(tmp_path), "profiles", "prod")
    assert profile.config_dir() == expected_dir
    assert profile.config_path() == os.path.join(expected_dir, "config.json")
    assert profile.credentials_path() == os.path.join(expected_dir, "credentials")
    _reset()


def test_list_profiles_includes_default_and_named(monkeypatch, tmp_path):
    monkeypatch.setattr(shared, "CONFIG_DIR", str(tmp_path))
    os.makedirs(os.path.join(str(tmp_path), "profiles", "prod"))
    os.makedirs(os.path.join(str(tmp_path), "profiles", "staging"))
    names = profile.list_profiles()
    assert names == ["default", "prod", "staging"]


def test_delete_profile_removes_dir(monkeypatch, tmp_path):
    monkeypatch.setattr(shared, "CONFIG_DIR", str(tmp_path))
    pdir = os.path.join(str(tmp_path), "profiles", "prod")
    os.makedirs(pdir)
    profile.delete_profile("prod")
    assert not os.path.exists(pdir)


def test_delete_default_refused(monkeypatch, tmp_path):
    import pytest

    monkeypatch.setattr(shared, "CONFIG_DIR", str(tmp_path))
    with pytest.raises(ValueError):
        profile.delete_profile("default")
