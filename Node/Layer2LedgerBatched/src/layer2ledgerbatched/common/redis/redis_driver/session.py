from typing import AsyncGenerator
import redis
from layer2ledgerbatched.common.config.config import get_settings

settings = get_settings("prod")

redis_pool: redis.asyncio.ConnectionPool = redis.asyncio.ConnectionPool.from_url(
            f"redis://{settings.redis.host}:{settings.redis.port}",
            max_connections=20)

redis_client: redis.asyncio.Redis = redis.asyncio.Redis(connection_pool=redis_pool)

async def get_redis_conn() -> AsyncGenerator[redis.asyncio.Redis, None]:
    async with redis_client as conn:
        yield conn