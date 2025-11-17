from typing import AsyncGenerator
import pytest
import pytest_asyncio
from redis.asyncio import ConnectionPool, Redis
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from layer2ledgerbatched.common.config.config import get_common_settings, Environment, CommonSettings
from layer2ledgerbatched.layer2ledgerapihandler.config.config import get_settings as get_layer2ledgerapihandler_settings, Layer2LedgerAPIHandlerSettings
from layer2ledgerbatched.common.db.models import Base
from layer2ledgerbatched.common.redis.redis_driver.distributed_lock import DistributedLock
from layer2ledgerbatched.layer2ledgerapihandler.main import app, lifespan

# Automatic setup for all tests
@pytest_asyncio.fixture(scope="function", autouse=True)
async def setup_test_environment():
    async with lifespan(app):
        yield

@pytest.fixture(scope="session")
def common_settings() -> CommonSettings:
    return get_common_settings(Environment.TEST)

@pytest.fixture(scope="session")
def layer2ledgerapihandler_settings() -> Layer2LedgerAPIHandlerSettings:
    return get_layer2ledgerapihandler_settings(Environment.TEST)

@pytest_asyncio.fixture(scope="function")
async def redis_client() -> AsyncGenerator[Redis, None]:
    settings = get_common_settings(Environment.TEST)
    pool = ConnectionPool.from_url(f"redis://{settings.redis.host}:{settings.redis.port}", max_connections=10)
    client = Redis(connection_pool=pool)
    yield client
    await client.aclose()

@pytest_asyncio.fixture(scope="function")
async def postgresql_session() -> AsyncGenerator[AsyncSession, None]:
    settings = get_common_settings(Environment.TEST)
    engine = create_async_engine(settings.database_url, echo=False, pool_size=10, pool_timeout=30)
    async_session = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)
    async with async_session() as session:
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
