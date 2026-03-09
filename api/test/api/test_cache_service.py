"""Tests for api/transformerlab/services/cache_service.py.

All tests use an isolated in-memory cashews backend (reset via setup("mem://")
before each test) and clean up org context afterwards.
"""

from __future__ import annotations

import pytest

from lab.dirs import set_organization_id
from transformerlab.services.cache_service import _NONE_SENTINEL, cache, cached, setup


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
async def fresh_cache():
    """Fresh in-memory cache + clean org context for every test."""
    set_organization_id(None)
    setup("mem://")
    yield
    await cache.clear_all()
    set_organization_id(None)


# ---------------------------------------------------------------------------
# Basic get / set
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cache_miss_returns_none():
    set_organization_id("org-1")
    assert await cache.get("nonexistent:key") is None


@pytest.mark.asyncio
async def test_set_and_get_roundtrip():
    set_organization_id("org-1")
    payload = {"model_id": "llama-3", "size": 8}
    await cache.set("models:detail:llama-3", payload, ttl="5m")
    result = await cache.get("models:detail:llama-3")
    assert result == payload


@pytest.mark.asyncio
async def test_set_and_get_list():
    set_organization_id("org-1")
    await cache.set("models:list", ["model-a", "model-b"], ttl="5m")
    assert await cache.get("models:list") == ["model-a", "model-b"]


# ---------------------------------------------------------------------------
# Org / tenant isolation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_org_isolation_different_orgs_get_different_values():
    """Two distinct orgs must never share cache entries."""
    set_organization_id("org-1")
    await cache.set("models:list", ["org1-model"], ttl="5m")

    # org-2 has no entry for this key yet
    set_organization_id("org-2")
    assert await cache.get("models:list") is None

    await cache.set("models:list", ["org2-model"], ttl="5m")
    assert await cache.get("models:list") == ["org2-model"]

    # confirm org-1 value is unchanged
    set_organization_id("org-1")
    assert await cache.get("models:list") == ["org1-model"]


# ---------------------------------------------------------------------------
# No-org passthrough
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_without_org_context_returns_none():
    set_organization_id(None)
    assert await cache.get("any:key") is None


@pytest.mark.asyncio
async def test_set_without_org_context_is_noop():
    set_organization_id(None)
    await cache.set("any:key", "value", ttl="5m")
    # Still None because set was skipped
    assert await cache.get("any:key") is None


# ---------------------------------------------------------------------------
# Tag invalidation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_invalidate_by_tag_removes_all_tagged_entries():
    set_organization_id("org-1")
    await cache.set("models:list", ["m1", "m2"], ttl="5m", tags=["models"])
    await cache.set("models:detail:m1", {"id": "m1"}, ttl="5m", tags=["models", "model:m1"])

    await cache.invalidate("models")

    assert await cache.get("models:list") is None
    assert await cache.get("models:detail:m1") is None


@pytest.mark.asyncio
async def test_invalidate_single_tag_leaves_other_tags_intact():
    set_organization_id("org-1")
    await cache.set("models:list", ["m1"], ttl="5m", tags=["models"])
    await cache.set("datasets:list", ["d1"], ttl="5m", tags=["datasets"])

    await cache.invalidate("models")

    assert await cache.get("models:list") is None
    # datasets entry is unaffected
    assert await cache.get("datasets:list") == ["d1"]


@pytest.mark.asyncio
async def test_invalidate_multiple_tags_at_once():
    set_organization_id("org-1")
    await cache.set("models:list", ["m1"], ttl="5m", tags=["models"])
    await cache.set("datasets:list", ["d1"], ttl="5m", tags=["datasets"])
    await cache.set("experiments:list", ["e1"], ttl="5m", tags=["experiments"])

    await cache.invalidate("models", "datasets")

    assert await cache.get("models:list") is None
    assert await cache.get("datasets:list") is None
    assert await cache.get("experiments:list") == ["e1"]


@pytest.mark.asyncio
async def test_tag_invalidation_is_org_scoped():
    """Invalidating a tag for org-1 must not affect org-2's entries."""
    set_organization_id("org-1")
    await cache.set("models:list", ["org1-model"], ttl="5m", tags=["models"])

    set_organization_id("org-2")
    await cache.set("models:list", ["org2-model"], ttl="5m", tags=["models"])

    # Invalidate only org-1's "models" tag
    set_organization_id("org-1")
    await cache.invalidate("models")
    assert await cache.get("models:list") is None

    # org-2's data survives
    set_organization_id("org-2")
    assert await cache.get("models:list") == ["org2-model"]


@pytest.mark.asyncio
async def test_invalidate_without_org_context_is_noop():
    """With no org context invalidate() should silently do nothing."""
    set_organization_id("org-1")
    await cache.set("models:list", ["m1"], ttl="5m", tags=["models"])

    set_organization_id(None)
    await cache.invalidate("models")  # should be a no-op

    # org-1's entry must still be present
    set_organization_id("org-1")
    assert await cache.get("models:list") == ["m1"]


# ---------------------------------------------------------------------------
# delete (single-key removal)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_removes_single_entry():
    set_organization_id("org-1")
    await cache.set("experiments:abc", {"id": "abc"}, ttl="5m")
    await cache.delete("experiments:abc")
    assert await cache.get("experiments:abc") is None


@pytest.mark.asyncio
async def test_delete_does_not_affect_sibling_keys():
    set_organization_id("org-1")
    await cache.set("experiments:abc", {"id": "abc"}, ttl="5m")
    await cache.set("experiments:xyz", {"id": "xyz"}, ttl="5m")
    await cache.delete("experiments:abc")
    assert await cache.get("experiments:xyz") == {"id": "xyz"}


# ---------------------------------------------------------------------------
# get_or_set
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_or_set_calls_fn_on_miss():
    set_organization_id("org-1")
    call_count = 0

    async def loader() -> list[str]:
        nonlocal call_count
        call_count += 1
        return ["model-x"]

    result = await cache.get_or_set("models:list", loader, ttl="5m", tags=["models"])
    assert result == ["model-x"]
    assert call_count == 1


@pytest.mark.asyncio
async def test_get_or_set_does_not_call_fn_on_hit():
    set_organization_id("org-1")
    call_count = 0

    async def loader() -> list[str]:
        nonlocal call_count
        call_count += 1
        return ["model-x"]

    await cache.get_or_set("models:list", loader, ttl="5m", tags=["models"])
    result2 = await cache.get_or_set("models:list", loader, ttl="5m", tags=["models"])

    assert result2 == ["model-x"]
    assert call_count == 1  # fn called only once


@pytest.mark.asyncio
async def test_get_or_set_accepts_sync_fn():
    set_organization_id("org-1")

    def sync_loader() -> dict[str, str]:
        return {"sync": "result"}

    result = await cache.get_or_set("sync:key", sync_loader, ttl="5m")
    assert result == {"sync": "result"}
    # Second call hits cache
    assert await cache.get_or_set("sync:key", sync_loader, ttl="5m") == {"sync": "result"}


@pytest.mark.asyncio
async def test_get_or_set_caches_none_result():
    """A None return from fn should be cached so fn is not called again."""
    set_organization_id("org-1")
    call_count = 0

    async def loader() -> None:
        nonlocal call_count
        call_count += 1
        return None

    result1 = await cache.get_or_set("missing:resource", loader, ttl="5m")
    result2 = await cache.get_or_set("missing:resource", loader, ttl="5m")

    assert result1 is None
    assert result2 is None
    assert call_count == 1  # fn invoked only once; None was cached


@pytest.mark.asyncio
async def test_get_or_set_without_org_bypasses_cache():
    """No org context → fn is called on every invocation."""
    set_organization_id(None)
    call_count = 0

    async def loader() -> str:
        nonlocal call_count
        call_count += 1
        return "data"

    await cache.get_or_set("key", loader, ttl="5m")
    await cache.get_or_set("key", loader, ttl="5m")

    assert call_count == 2  # no caching without org context


# ---------------------------------------------------------------------------
# None value edge cases
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_none_sentinel_is_not_leaked_to_callers():
    """The internal _NONE_SENTINEL string must never be returned to callers."""
    set_organization_id("org-1")
    await cache.set("null:key", None, ttl="5m")
    result = await cache.get("null:key")
    # Caller receives None, not the raw sentinel string
    assert result is None
    assert result != _NONE_SENTINEL


# ---------------------------------------------------------------------------
# clear_all
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_clear_all_wipes_all_orgs():
    set_organization_id("org-1")
    await cache.set("k1", "v1", ttl="5m")

    set_organization_id("org-2")
    await cache.set("k2", "v2", ttl="5m")

    await cache.clear_all()

    set_organization_id("org-1")
    assert await cache.get("k1") is None

    set_organization_id("org-2")
    assert await cache.get("k2") is None


# ---------------------------------------------------------------------------
# @cached decorator
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cached_decorator_caches_async_function():
    call_count = 0

    set_organization_id("org-1")

    @cached(key="dec:static", ttl="5m", tags=["dec"])
    async def my_func() -> list[str]:
        nonlocal call_count
        call_count += 1
        return ["hello"]

    assert await my_func() == ["hello"]
    assert await my_func() == ["hello"]
    assert call_count == 1  # factory called only once


@pytest.mark.asyncio
async def test_cached_decorator_caches_sync_function():
    call_count = 0

    set_organization_id("org-1")

    @cached(key="dec:sync", ttl="5m")
    def my_sync_func() -> dict[str, str]:
        nonlocal call_count
        call_count += 1
        return {"sync": True}

    assert await my_sync_func() == {"sync": True}
    assert await my_sync_func() == {"sync": True}
    assert call_count == 1


@pytest.mark.asyncio
async def test_cached_decorator_interpolates_key_from_args():
    call_count = 0

    set_organization_id("org-1")

    @cached(key="item:{item_id}", ttl="5m", tags=["items"])
    async def get_item(item_id: str) -> dict[str, str]:
        nonlocal call_count
        call_count += 1
        return {"id": item_id}

    assert await get_item("abc") == {"id": "abc"}
    assert await get_item("abc") == {"id": "abc"}
    assert call_count == 1

    # Different arg → different cache key → calls factory again
    assert await get_item("xyz") == {"id": "xyz"}
    assert call_count == 2


@pytest.mark.asyncio
async def test_cached_decorator_bypasses_without_org():
    call_count = 0

    @cached(key="dec:noorg", ttl="5m")
    async def my_func() -> str:
        nonlocal call_count
        call_count += 1
        return "data"

    await my_func()
    await my_func()
    assert call_count == 2  # no caching without org


@pytest.mark.asyncio
async def test_cached_decorator_respects_invalidation():
    call_count = 0

    set_organization_id("org-1")

    @cached(key="dec:inv", ttl="5m", tags=["mytag"])
    async def my_func() -> str:
        nonlocal call_count
        call_count += 1
        return f"v{call_count}"

    assert await my_func() == "v1"
    await cache.invalidate("mytag")
    assert await my_func() == "v2"
    assert call_count == 2
