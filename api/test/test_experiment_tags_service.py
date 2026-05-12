import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from transformerlab.services import experiment_service as svc


def test_normalize_tags_lowercases_and_trims():
    assert svc.normalize_tags(["  Foo ", "BAR"]) == ["foo", "bar"]


def test_normalize_tags_deduplicates_preserving_order():
    assert svc.normalize_tags(["foo", "Bar", "FOO", "bar"]) == ["foo", "bar"]


def test_normalize_tags_allows_dot_dash_underscore_digits():
    assert svc.normalize_tags(["fine-tune", "v1.0", "exp_2"]) == [
        "fine-tune",
        "v1.0",
        "exp_2",
    ]


def test_normalize_tags_rejects_spaces_inside_tag():
    with pytest.raises(ValueError, match="hello world"):
        svc.normalize_tags(["hello world"])


def test_normalize_tags_rejects_punctuation():
    with pytest.raises(ValueError, match="bad!"):
        svc.normalize_tags(["bad!"])


def test_normalize_tags_rejects_unicode():
    with pytest.raises(ValueError, match="café"):
        svc.normalize_tags(["café"])


def test_normalize_tags_rejects_over_32_chars():
    long_tag = "a" * 33
    with pytest.raises(ValueError, match="32"):
        svc.normalize_tags([long_tag])


def test_normalize_tags_accepts_exactly_32_chars():
    long_tag = "a" * 32
    assert svc.normalize_tags([long_tag]) == [long_tag]


def test_normalize_tags_rejects_empty_after_strip():
    with pytest.raises(ValueError):
        svc.normalize_tags(["   "])


def test_normalize_tags_empty_input_returns_empty_list():
    assert svc.normalize_tags([]) == []


def _mock_experiment(current_tags=None):
    """Build a mock Experiment whose get_json_data returns config.tags=current_tags."""
    mock_exp = MagicMock()
    mock_exp.get_json_data = AsyncMock(return_value={"config": {"tags": list(current_tags) if current_tags else []}})
    mock_exp.update_config_field = AsyncMock()
    return mock_exp


@patch("transformerlab.services.experiment_service.cache.invalidate", new_callable=AsyncMock)
@patch("transformerlab.services.experiment_service.Experiment.get", new_callable=AsyncMock)
async def test_experiment_add_tags_merges_with_existing(mock_get, _mock_cache):
    mock_exp = _mock_experiment(current_tags=["foo"])
    mock_get.return_value = mock_exp

    result = await svc.experiment_add_tags("exp1", ["Bar", "BAZ"])

    assert result == ["foo", "bar", "baz"]
    mock_exp.update_config_field.assert_awaited_once_with("tags", ["foo", "bar", "baz"])


@patch("transformerlab.services.experiment_service.cache.invalidate", new_callable=AsyncMock)
@patch("transformerlab.services.experiment_service.Experiment.get", new_callable=AsyncMock)
async def test_experiment_add_tags_is_idempotent(mock_get, _mock_cache):
    mock_exp = _mock_experiment(current_tags=["foo", "bar"])
    mock_get.return_value = mock_exp

    result = await svc.experiment_add_tags("exp1", ["FOO", "bar"])

    assert result == ["foo", "bar"]
    mock_exp.update_config_field.assert_awaited_once_with("tags", ["foo", "bar"])


@patch("transformerlab.services.experiment_service.cache.invalidate", new_callable=AsyncMock)
@patch("transformerlab.services.experiment_service.Experiment.get", new_callable=AsyncMock)
async def test_experiment_add_tags_handles_missing_tags_field(mock_get, _mock_cache):
    mock_exp = MagicMock()
    mock_exp.get_json_data = AsyncMock(return_value={"config": {}})
    mock_exp.update_config_field = AsyncMock()
    mock_get.return_value = mock_exp

    result = await svc.experiment_add_tags("exp1", ["foo"])

    assert result == ["foo"]


@patch("transformerlab.services.experiment_service.Experiment.get", new_callable=AsyncMock)
async def test_experiment_add_tags_enforces_max_cap(mock_get):
    existing = [f"t{i}" for i in range(19)]
    mock_exp = _mock_experiment(current_tags=existing)
    mock_get.return_value = mock_exp

    with pytest.raises(ValueError, match="20"):
        await svc.experiment_add_tags("exp1", ["new1", "new2"])
    mock_exp.update_config_field.assert_not_awaited()


@patch("transformerlab.services.experiment_service.cache.invalidate", new_callable=AsyncMock)
@patch("transformerlab.services.experiment_service.Experiment.get", new_callable=AsyncMock)
async def test_experiment_remove_tags_removes_present(mock_get, _mock_cache):
    mock_exp = _mock_experiment(current_tags=["foo", "bar", "baz"])
    mock_get.return_value = mock_exp

    result = await svc.experiment_remove_tags("exp1", ["Bar"])

    assert result == ["foo", "baz"]
    mock_exp.update_config_field.assert_awaited_once_with("tags", ["foo", "baz"])


@patch("transformerlab.services.experiment_service.cache.invalidate", new_callable=AsyncMock)
@patch("transformerlab.services.experiment_service.Experiment.get", new_callable=AsyncMock)
async def test_experiment_remove_tags_absent_is_noop(mock_get, _mock_cache):
    mock_exp = _mock_experiment(current_tags=["foo"])
    mock_get.return_value = mock_exp

    result = await svc.experiment_remove_tags("exp1", ["missing"])

    assert result == ["foo"]
    mock_exp.update_config_field.assert_awaited_once_with("tags", ["foo"])


def test_aggregate_tags_dedupes_and_sorts():
    experiments = [
        {"id": "a", "config": {"tags": ["foo", "bar"]}},
        {"id": "b", "config": {"tags": ["bar", "baz"]}},
        {"id": "c", "config": {}},
        {"id": "d", "config": {"tags": []}},
    ]
    assert svc.aggregate_tags(experiments) == ["bar", "baz", "foo"]


def test_aggregate_tags_handles_string_config_blob():
    experiments = [{"id": "a", "config": '{"tags": ["zeta", "alpha"]}'}]
    assert svc.aggregate_tags(experiments) == ["alpha", "zeta"]


def test_aggregate_tags_skips_non_string_entries():
    experiments = [{"id": "a", "config": {"tags": ["foo", 42, None, "bar"]}}]
    assert svc.aggregate_tags(experiments) == ["bar", "foo"]


def test_aggregate_tags_empty_input():
    assert svc.aggregate_tags([]) == []
