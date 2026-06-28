from typing import AsyncGenerator
import pytest
import pytest_asyncio
from redis.asyncio import ConnectionPool, Redis
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from config_loader.loader import Environment, get_layer2ledgerbatched_common_config, get_layer2ledgerbatched_layer2ledgerapihandler_config
from config_models.models import Layer2LedgerCommonSettings, Layer2LedgerAPIHandlerSettings
from layer2ledgerbatched.common.db.models import Base
from layer2ledgerbatched.common.redis.redis_driver.distributed_lock import DistributedLock
from layer2ledgerbatched.layer2ledgerapihandler.main import app, lifespan

# Automatic setup for all tests
@pytest_asyncio.fixture(scope="function", autouse=True)
async def setup_test_environment():
    async with lifespan(app):
        yield

@pytest.fixture(scope="session")
def common_settings() -> Layer2LedgerCommonSettings:
    return get_layer2ledgerbatched_common_config()

@pytest.fixture(scope="session")
def layer2ledgerapihandler_settings() -> Layer2LedgerAPIHandlerSettings:
    return get_layer2ledgerbatched_layer2ledgerapihandler_config()

@pytest_asyncio.fixture(scope="function")
async def redis_client() -> AsyncGenerator[Redis, None]:
    settings = get_layer2ledgerbatched_common_config()
    pool = ConnectionPool.from_url(f"redis://{settings.redis.host}:{settings.redis.port}", max_connections=10)
    client = Redis(connection_pool=pool)
    yield client
    await client.aclose()

@pytest_asyncio.fixture(scope="function")
async def postgresql_session() -> AsyncGenerator[AsyncSession, None]:
    settings = get_layer2ledgerbatched_common_config()
    engine = create_async_engine(settings.database.database_url, echo=False, pool_size=10, pool_timeout=30)
    async_session = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_session() as session:
        # Delete rows instead of drop_all — drop_all needs ACCESS EXCLUSIVE locks and
        # hangs when apihandler/dbwriter (or other pools) hold connections to this DB.
        for table in reversed(Base.metadata.sorted_tables):
            await session.execute(delete(table))
        await session.commit()
        yield session
    await engine.dispose()

@pytest_asyncio.fixture(scope="function")
async def distributed_lock(redis_client: Redis) -> AsyncGenerator[DistributedLock, None]:
    """Your class fixture using Redis client fixture"""
    lock_manager = DistributedLock(redis_client)
    await lock_manager.setup()
    yield lock_manager


@pytest_asyncio.fixture(scope="function", autouse=True)
async def clear_redis(redis_client: Redis) -> AsyncGenerator[None, None]:
    """Clears the Redis database before each test."""
    print("--> Clearing Redis")
    await redis_client.flushdb()
    yield # The test runs here
