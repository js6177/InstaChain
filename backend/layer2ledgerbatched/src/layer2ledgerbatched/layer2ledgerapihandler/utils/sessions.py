# --- Dependencies ---
from typing import AsyncGenerator
from fastapi import Request
import redis
from sqlalchemy.ext.asyncio import AsyncSession

from layer2ledgerbatched.common.redis.redis_driver.distributed_lock import DistributedLock


async def get_redis(request: Request) -> redis.Redis:
    """Dependency to get the Redis client from the app state."""
    return request.app.state.redis_client

async def get_db_session(request: Request) -> AsyncGenerator[AsyncSession, None]:
    """Dependency to get a new SQLAlchemy session."""
    session_maker = request.app.state.db_session_maker
    async with session_maker() as session:
        yield session

async def get_redis_lock_manager(request: Request) -> DistributedLock:
    """Dependency to get the DistributedLock manager from the app state."""
    return request.app.state.redis_lock_manager