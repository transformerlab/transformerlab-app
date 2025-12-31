from typing import Optional, Callable, Any, TypeVar, ParamSpec, cast
from functools import wraps
import logging
from contextlib import asynccontextmanager

from fastapi_cache import FastAPICache
from fastapi_cache.backends.redis import RedisBackend
from redis import asyncio as aioredis
from redis.asyncio import Redis

logger = logging.getLogger(__name__)

P = ParamSpec("P")
T = TypeVar("T")


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
    """Initialize FastAPI cache with Redis backend"""
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

        FastAPICache.init(RedisBackend(_redis_client), prefix=CacheConfig.CACHE_PREFIX)
        logger.info(f"✓ Redis cache initialized at {CacheConfig.REDIS_URL}")

    except Exception as e:
        logger.error(f"✗ Failed to connect to Redis: {e}")
        logger.warning("Application will run without caching")
        _redis_client = None


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
