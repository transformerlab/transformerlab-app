import pytest
from lab import dirs
from lab.storage import _current_tfl_storage_uri


@pytest.fixture(autouse=True)
def reset_storage_uri():
    yield
    _current_tfl_storage_uri.set(None)


def test_set_tfl_storage_uri_overrides_context_var():
    dirs.set_tfl_storage_uri("s3://custom-bucket")
    assert _current_tfl_storage_uri.get() == "s3://custom-bucket"


def test_set_tfl_storage_uri_none_clears():
    dirs.set_tfl_storage_uri("s3://something")
    dirs.set_tfl_storage_uri(None)
    assert _current_tfl_storage_uri.get() is None
