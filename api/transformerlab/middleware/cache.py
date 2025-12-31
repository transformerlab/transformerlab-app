from typing import Optional, Callable, Any, TypeVar, ParamSpec
import logging
import hashlib

from fastapi_cache import FastAPICache
from fastapi_cache.backends.redis import RedisBackend
from fastapi_cache.backends.inmemory import InMemoryBackend
from redis import asyncio as aioredis
from redis.asyncio import Redis

logger = logging.getLogger(__name__)

P = ParamSpec("P")
T = TypeVar("T")


def custom_key_builder(
    func: Callable,
    namespace: str = "",
    request: Optional[Any] = None,
    response: Optional[Any] = None,
    *args,
    **kwargs,
) -> str:
    """
    Custom key builder that creates consistent cache keys.
    Excludes request headers (like auth tokens) to allow shared caching across users.
    Only uses: namespace, function name, and explicit function arguments.
    """
    # Build key from namespace (usually derived from path) and function name
    prefix = f"{namespace}:{func.__module__}:{func.__name__}"

    # Only include explicit kwargs (path/query params), not request/response objects
    filtered_kwargs = {
        k: v
        for k, v in kwargs.items()
        if k not in ("request", "response", "session", "user_and_team", "owner_info", "user")
        and not hasattr(v, "__dict__")  # Skip complex objects
    }

    # Create a hash of the arguments for the key
    if filtered_kwargs:
        arg_str = str(sorted(filtered_kwargs.items()))
        arg_hash = hashlib.md5(arg_str.encode()).hexdigest()[:8]
        return f"{prefix}:{arg_hash}"

    return prefix


class CacheConfig:
    """Configuration for Redis cache"""

    REDIS_URL: str = "redis://localhost:6379"
    CACHE_PREFIX: str = "transformerlab:"
    DEFAULT_TTL: int = 300

    @classmethod
    def from_env(cls) -> None:
        """Load configuration from environment variables"""
        import os

        cls.REDIS_URL = os.getenv("REDIS_URL", cls.REDIS_URL)
        cls.CACHE_PREFIX = os.getenv("CACHE_PREFIX", cls.CACHE_PREFIX)
        cls.DEFAULT_TTL = int(os.getenv("CACHE_DEFAULT_TTL", str(cls.DEFAULT_TTL)))


_redis_client: Optional[Redis] = None


async def get_redis_client() -> Optional[Redis]:
    """Get the Redis client instance"""
    return _redis_client


async def init_cache() -> None:
    """Initialize FastAPI cache with Redis backend, or InMemory fallback if Redis unavailable"""
    global _redis_client

    try:
        CacheConfig.from_env()
        # IMPORTANT: decode_responses must be False for fastapi-cache2
        # It expects bytes, not strings
        _redis_client = await aioredis.from_url(
            CacheConfig.REDIS_URL,
            encoding="utf-8",
            decode_responses=False,  # Changed to False
            socket_connect_timeout=5,
            socket_timeout=5,
        )

        # Test connection
        await _redis_client.ping()

        FastAPICache.init(
            RedisBackend(_redis_client),
            prefix=CacheConfig.CACHE_PREFIX,
            key_builder=custom_key_builder,
        )
        logger.info(f"✓ Redis cache initialized at {CacheConfig.REDIS_URL}")

    except Exception as e:
        logger.error(f"✗ Failed to connect to Redis: {e}")
        logger.warning("Falling back to in-memory cache")
        _redis_client = None
        # Initialize with in-memory backend as fallback
        FastAPICache.init(
            InMemoryBackend(),
            prefix=CacheConfig.CACHE_PREFIX,
            key_builder=custom_key_builder,
        )
        logger.info("✓ In-memory cache initialized as fallback")


async def close_cache() -> None:
    """Close Redis connection gracefully"""
    global _redis_client

    try:
        if _redis_client:
            await _redis_client.close()
        await FastAPICache.clear()
        logger.info("✓ Redis cache closed")
    except Exception as e:
        logger.error(f"Error closing cache: {e}")
    finally:
        _redis_client = None


async def clear_cache(namespace: str = "") -> None:
    """
    Clear cache entries matching a namespace.

    Args:
        namespace: Pattern to match. Empty string clears all cache.
    """
    await FastAPICache.clear(namespace=namespace)


async def clear_function_cache(module: str, name: str, **kwargs) -> None:
    """
    Clear cache for a specific function.

    Args:
        module: The module path of the function (e.g. 'transformerlab.routers.experiment.experiment')
        name: The function name (e.g. 'experiment_get')
        **kwargs: If provided, clear the specific key for these arguments.
                 If empty, clear all cached entries for this function.
    """
    # Reconstruct the namespace part that custom_key_builder produces
    # custom_key_builder uses: f"{namespace}:{func.__module__}:{func.__name__}"
    # With default namespace="", it produces ":module:name"
    func_prefix = f":{module}:{name}"

    # FastAPICache prepends the global prefix
    full_prefix = f"{CacheConfig.CACHE_PREFIX}{func_prefix}"

    if not kwargs:
        # Clear all entries for this function
        # RedisBackend.clear uses 'keys {namespace}:*'
        # We want to match '{full_prefix}:*'
        await FastAPICache.clear(namespace=full_prefix)
        logger.info(f"Cleared all cache for {module}:{name}")
    else:
        # Clear specific entry
        # Reconstruct the hash logic from custom_key_builder
        filtered_kwargs = {
            k: v
            for k, v in kwargs.items()
            if k not in ("request", "response", "session", "user_and_team", "owner_info", "user")
            and not hasattr(v, "__dict__")
        }

        if filtered_kwargs:
            arg_str = str(sorted(filtered_kwargs.items()))
            arg_hash = hashlib.md5(arg_str.encode()).hexdigest()[:8]
            key = f"{full_prefix}:{arg_hash}"

            if _redis_client:
                await _redis_client.delete(key)
                logger.info(f"Cleared cache key {key}")
