from typing import AsyncGenerator
import httpx
import pytest
import pytest_asyncio
from redis.asyncio import ConnectionPool, Redis
from contextlib import AsyncExitStack

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from layer2ledgerbatched.common.config.config import get_settings, Environment
from layer2ledgerbatched.common.redis.redis_driver.distributed_lock import DistributedLock
from layer2ledgerbatched.layer2ledgerapihandler.main import app, lifespan

# Automatic setup for all tests
@pytest_asyncio.fixture(scope="function", autouse=True)
async def setup_test_environment():
    async with lifespan(app):
        yield


@pytest_asyncio.fixture(scope="function")
async def redis_client() -> AsyncGenerator[Redis, None]:
    settings = get_settings(Environment.TEST.value)
    pool = ConnectionPool.from_url(f"redis://{settings.redis.host}:{settings.redis.port}", max_connections=10)
    client = Redis(connection_pool=pool)
    yield client
    await client.aclose()

@pytest_asyncio.fixture(scope="function")
async def postgresql_session() -> AsyncGenerator[async_sessionmaker, None]:
    settings = get_settings(Environment.TEST.value)
    engine = create_async_engine(settings.database_url, echo=True, pool_size=10, pool_timeout=30)
    async_session = async_sessionmaker(engine, expire_on_commit=False)
    async with async_session() as session:
        yield session
    await engine.dispose()

@pytest_asyncio.fixture(scope="function")
async def distributed_lock(redis_client) -> DistributedLock:
    """Your class fixture using Redis client fixture"""
    lock_manager = DistributedLock(redis_client)
    await lock_manager.setup()
    yield lock_manager