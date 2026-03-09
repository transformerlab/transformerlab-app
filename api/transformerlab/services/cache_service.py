"""General-purpose in-memory cache with automatic org/team scoping.

Overview
--------
The module exposes a single **``cache``** singleton.  Import it anywhere in the
API layer (services, routers) and call its async methods directly.  All keys and
tags are automatically prefixed with the **current org/team ID** (read from the
request context ``ContextVar``), so two different tenants hitting the same URL
can never see each other's cached data.

When there is **no org context** (e.g. background tasks at startup) the cache is
bypassed transparently – all reads return ``None`` and writes are no-ops.

Patterns
--------
**Pattern 1 – ``@cached`` decorator (most common)**::

    from transformerlab.services.cache_service import cached

    @cached(key="models:list", ttl="30s", tags=["models"])
    async def list_models():
        ...

    # Dynamic keys with {param} interpolation:
    @cached(key="job:{job_id}", ttl="5m", tags=["jobs"])
    async def get_job(job_id: str):
        ...

    # Works on FastAPI routes too (place @cached below @router.get):
    @router.get("/models")
    @cached(key="models:list", ttl="30s", tags=["models"])
    async def list_models_route():
        ...

**Pattern 2 – ``get_or_set`` (when you need the factory pattern)**::

    from transformerlab.services.cache_service import cache

    models = await cache.get_or_set(
        "models:list",
        fn=lab.list_models,   # sync or async callable, called on miss
        ttl="30s",
        tags=["models"],
    )

**Pattern 3 – conditional caching (e.g. jobs with lifecycle-aware TTLs)**::

    job = await lab.get_job(job_id)
    if job["status"] == "COMPLETED":
        await cache.set(f"job:{job_id}", job, ttl="24h", tags=["jobs", f"job:{job_id}"])
    elif job["status"] == "FAILED":
        await cache.set(f"job:{job_id}", job, ttl="10m", tags=["jobs", f"job:{job_id}"])
    # RUNNING / QUEUED: skip caching entirely – fall through
    return job

**Pattern 4 – explicit get / set**::

    result = await cache.get("experiment:abc")
    if result is None:
        result = await lab.get_experiment("abc")
        await cache.set("experiment:abc", result,
                        ttl="60s", tags=["experiments", "experiment:abc"])

**Pattern 5 – tag invalidation**::

    await cache.invalidate("models")                    # all models for current org
    await cache.invalidate(f"experiment:{exp_id}")      # single experiment
    await cache.invalidate("jobs", "experiments")       # multiple tags at once

    # Admin: wipe everything (all orgs)
    await cache.clear_all()

Backend
-------
The backend is configured by the ``CACHE_URL`` constant defined at the top of
this module (default: ``"mem://"``).  To switch backends, change that variable:

* ``"mem://?size=5000"``       – memory with a custom max-entry cap
* ``"redis://localhost:6379"`` – Redis for multi-node deployments

``setup()`` must be called once at application startup (the API lifespan handler
does this automatically).
"""

from __future__ import annotations

import functools
import inspect
import logging
import os
from collections.abc import Callable
from datetime import timedelta
from typing import Any

from cashews import cache as _cashews

from lab.dirs import get_organization_id

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Backend configuration
# ---------------------------------------------------------------------------

# Change this variable to switch cache backends.  Common options:
#   "mem://"                 – in-process memory (default, single-node)
#   "mem://?size=5000"       – memory with a custom max-entry cap
#   "redis://localhost:6379" – Redis for multi-node deployments
CACHE_URL = "mem://"

# Set TLAB_CACHE_DISABLED=true to turn the cache into a no-op.
# All reads will miss and all writes will be skipped.  Useful for debugging
# or in environments where stale data is never acceptable.
CACHE_DISABLED: bool = os.getenv("TLAB_CACHE_DISABLED", "").lower() == "true"

# ---------------------------------------------------------------------------
# Internal sentinels
# ---------------------------------------------------------------------------

# Returned by cashews.get(default=_MISS) when the key does not exist.
# Using a module-level object() gives us fast identity checks with the
# in-memory backend.  If a Redis backend is ever added, swap this for a
# unique string constant and compare with == instead of `is`.
_MISS = object()

# Stored in the cache when the caller explicitly caches Python ``None``.
# A unique string survives serialisation (pickle / JSON) so it works with
# both in-memory and remote backends.
_NONE_SENTINEL = "__tlab_cached_none__"

# Type alias for TTL values accepted by cashews.
TTL = str | int | timedelta


# ---------------------------------------------------------------------------
# Main cache class
# ---------------------------------------------------------------------------


class OrgScopedCache:
    """Thin wrapper around cashews that scopes every key/tag to the current org.

    Never instantiate this class directly – use the module-level ``cache``
    singleton created at the bottom of this file.
    """

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _scoped_key(self, key: str) -> str | None:
        """Return ``{provider_segment}:{org_id}:{key}``, or *None* when no org."""
        from os import getenv

        org_id = get_organization_id()
        if not org_id:
            return None

        provider = (getenv("TFL_STORAGE_PROVIDER") or "aws").strip().lower()
        remote_enabled = (getenv("TFL_REMOTE_STORAGE_ENABLED") or "false").lower() == "true"
        remote_flag = "true" if remote_enabled else "false"
        provider_segment = f"{provider}+{remote_flag}"

        return f"{provider_segment}:{org_id}:{key}"

    def _scoped_tags(self, tags: list[str] | None) -> list[str]:
        """Prefix every tag with the current org ID."""
        org_id = get_organization_id()
        if not org_id or not tags:
            return []
        return [f"{org_id}:{t}" for t in tags]

    @staticmethod
    async def _call(fn: Callable[[], Any]) -> Any:
        """Invoke *fn*, awaiting it when it returns a coroutine."""
        result = fn()
        if inspect.isawaitable(result):
            result = await result
        return result

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def get(self, key: str) -> Any | None:
        """Return the cached value for *key* in the current org, or ``None``.

        ``None`` is returned both on a cache miss *and* when ``None`` itself
        was explicitly cached.  Use :meth:`get_or_set` when you need to
        distinguish these cases.
        """
        scoped = self._scoped_key(key)
        if scoped is None:
            return None
        try:
            result = await _cashews.get(scoped, default=_MISS)
            if result is _MISS:
                return None  # cache miss
            return None if result == _NONE_SENTINEL else result
        except Exception:
            logger.exception("cache.get failed for key=%r – bypassing cache", key)
            return None

    async def set(
        self,
        key: str,
        value: Any,
        ttl: TTL = "60s",
        tags: list[str] | None = None,
    ) -> None:
        """Store *value* under *key* for the current org.

        Parameters
        ----------
        key:
            Plain string key, e.g. ``"models:list"`` or ``"job:abc123"``.
        value:
            Any picklable Python object.  ``None`` is stored safely.
        ttl:
            Time-to-live passed directly to cashews.  Accepts an integer
            (seconds), a :class:`~datetime.timedelta`, or a human-readable
            string such as ``"30s"``, ``"5m"``, ``"2h"``.
        tags:
            Optional list of tag strings used for bulk invalidation.
            Tags are automatically scoped to the current org.
        """
        scoped = self._scoped_key(key)
        if scoped is None:
            return  # no org context – skip
        stored = _NONE_SENTINEL if value is None else value
        scoped_tags = self._scoped_tags(tags)
        try:
            await _cashews.set(scoped, stored, expire=ttl, tags=scoped_tags)
        except Exception:
            logger.exception("cache.set failed for key=%r – continuing without cache", key)

    async def get_or_set(
        self,
        key: str,
        fn: Callable[[], Any],
        ttl: TTL = "60s",
        tags: list[str] | None = None,
    ) -> Any:
        """Return the cached value, or call *fn* to populate it on a miss.

        *fn* may be a plain callable or an async callable; both are
        supported.  Its return value is cached, including ``None``.

        Example::

            models = await cache.get_or_set(
                "models:list",
                fn=lab.list_models,
                ttl="30s",
                tags=["models"],
            )
        """
        scoped = self._scoped_key(key)
        if scoped is None:
            # No org context → bypass cache entirely.
            return await self._call(fn)

        try:
            raw = await _cashews.get(scoped, default=_MISS)
        except Exception:
            logger.exception("cache.get failed inside get_or_set for key=%r – calling fn", key)
            return await self._call(fn)

        if raw is not _MISS:
            # Cache hit – unwrap None sentinel if needed.
            return None if raw == _NONE_SENTINEL else raw

        # Cache miss – call fn then store result.
        value = await self._call(fn)
        stored = _NONE_SENTINEL if value is None else value
        scoped_tags = self._scoped_tags(tags)
        try:
            await _cashews.set(scoped, stored, expire=ttl, tags=scoped_tags)
        except Exception:
            logger.exception("cache.set failed inside get_or_set for key=%r – continuing", key)
        return value

    async def delete(self, key: str) -> None:
        """Remove a single cache entry for the current org."""
        scoped = self._scoped_key(key)
        if scoped is None:
            return
        try:
            await _cashews.delete(scoped)
        except Exception:
            logger.exception("cache.delete failed for key=%r", key)

    async def invalidate(self, *tags: str) -> None:
        """Invalidate all cache entries carrying any of *tags* for the current org.

        Tags are automatically scoped to the current org, so this never
        affects another tenant's data.

        Example::

            await cache.invalidate("models")                    # wipe model list
            await cache.invalidate(f"experiment:{exp_id}")      # single experiment
            await cache.invalidate("jobs", "experiments")       # multiple tags
        """
        if not tags:
            return
        scoped_tags = self._scoped_tags(list(tags))
        if not scoped_tags:
            return
        try:
            await _cashews.delete_tags(*scoped_tags)
        except Exception:
            logger.exception("cache.invalidate failed for tags=%r", tags)

    async def clear_all(self) -> None:
        """Wipe the **entire** cache across all orgs.

        Intended for admin use (e.g. a ``POST /admin/cache/clear`` endpoint)
        or test teardown.  Prefer :meth:`invalidate` for targeted eviction.
        """
        try:
            await _cashews.clear()
        except Exception:
            logger.exception("cache.clear_all failed")


# ---------------------------------------------------------------------------
# Module-level singleton and setup
# ---------------------------------------------------------------------------

cache = OrgScopedCache()


# ---------------------------------------------------------------------------
# Decorator
# ---------------------------------------------------------------------------


def cached(
    key: str,
    ttl: TTL = "60s",
    tags: list[str] | None = None,
) -> Callable:
    """Decorator that caches the return value of a sync or async function.

    Works on plain functions, service methods, and FastAPI route handlers.
    Both *key* and *tags* may contain ``{param}`` placeholders that are
    interpolated from the decorated function's arguments at call time.

    Examples::

        @cached(key="models:list", ttl="30s", tags=["models"])
        async def list_models():
            ...

        @cached(key="job:{job_id}", ttl="5m", tags=["jobs", "jobs:{job_id}"])
        async def get_job(job_id: str):
            ...

        @router.get("/models")
        @cached(key="models:list", ttl="30s", tags=["models"])
        async def list_models_route():
            ...
    """

    def decorator(fn: Callable) -> Callable:
        sig = inspect.signature(fn)

        @functools.wraps(fn)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            # Bind actual call arguments so we can interpolate {param} in the key and tags.
            bound = sig.bind(*args, **kwargs)
            bound.apply_defaults()
            resolved_key = key.format(**bound.arguments)
            resolved_tags = [t.format(**bound.arguments) for t in tags] if tags else tags

            async def _call_wrapped() -> Any:
                result = fn(*args, **kwargs)
                if inspect.isawaitable(result):
                    result = await result
                return result

            return await cache.get_or_set(resolved_key, _call_wrapped, ttl=ttl, tags=resolved_tags)

        return wrapper

    return decorator


def setup(cache_url: str = CACHE_URL) -> None:
    """Configure the cashews backend.  Call once at application startup.

    Uses ``CACHE_URL`` defined at the top of this module by default.
    Pass an explicit URL to override (useful in tests).

    When ``TLAB_CACHE_DISABLED=true`` the cache is configured but immediately
    disabled via cashews's built-in no-op mode, so all operations pass through
    without caching.
    """
    if CACHE_DISABLED:
        _cashews.setup(cache_url, disable=True)
        logger.info("Cache disabled via TLAB_CACHE_DISABLED")
    else:
        _cashews.setup(cache_url)
        backend = cache_url.split("://")[0]
        logger.info("Cache configured with backend: %s", backend)
