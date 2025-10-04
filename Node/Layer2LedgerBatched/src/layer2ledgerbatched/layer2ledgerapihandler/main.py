from fastapi import Depends, FastAPI, Request
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Dict
import redis
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, AsyncEngine, async_sessionmaker

#from src.api import users, transfers, deposits, withdrawals
from layer2ledgerbatched.common.config.config import Environment, get_settings
from layer2ledgerbatched.common.redis.redis_driver.distributed_lock import DistributedLock
from layer2ledgerbatched.layer2ledgerapihandler.api.models.requests.sample_request import SampleRequest
from layer2ledgerbatched.common.db.models import Base
from layer2ledgerbatched.layer2ledgerapihandler.api.routes import transfer
from layer2ledgerbatched.layer2ledgerapihandler.api.models.responses.common_response import CommonResponse
from layer2ledgerbatched.layer2ledgerapihandler.utils.sessions import get_redis, get_db_session, get_redis_lock_manager


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    settings = get_settings()
    redis_pool = redis.asyncio.ConnectionPool.from_url(
            f"redis://{settings.redis.host}:{settings.redis.port}",
            max_connections=20
        )
    redis_client = redis.asyncio.Redis(connection_pool=redis_pool)
    redis_lock_manager = DistributedLock(redis_client)

    # Ensure Lua scripts are loaded to redis at startup
    await redis_lock_manager.setup()
    
    app.state.redis_client = redis_client
    app.state.redis_lock_manager = redis_lock_manager

    postgres_engine: AsyncEngine = create_async_engine(
        settings.database_url, 
        echo=True,
        pool_size=20, 
        pool_timeout=30,
    )
    session_maker = async_sessionmaker(
        bind=postgres_engine, autoflush=False, expire_on_commit=False
    )
    app.state.db_session_maker = session_maker
    # on startup
    async with postgres_engine.begin() as conn:
        # This will create the tables, use with caution in production
        # await conn.run_sync(Base.metadata.drop_all) # if you want to drop tables on startup
        await conn.run_sync(Base.metadata.create_all)
    yield

    # Shutdown: Close connections
    await redis_client.aclose()
    await postgres_engine.dispose()

app = FastAPI(lifespan=lifespan)

TRANSFER_ROUTER_PREFIX = "/transfer"
app.include_router(transfer.router, prefix=TRANSFER_ROUTER_PREFIX, tags=["transfer"])

@app.get("/", response_model = CommonResponse)
async def root(    
    pg_session: AsyncSession = Depends(get_db_session),
    redis_conn: redis.asyncio.Redis = Depends(get_redis),
    redis_lock_manager = Depends(get_redis_lock_manager)) -> CommonResponse:
    return CommonResponse(error_code=0, error_message="API is running")

from layer2ledgerbatched.common.db.models import KeyValueStore
from layer2ledgerbatched.common.redis.redis_models.models import RedisKeyValueStore

@app.post("/test_db", response_model = CommonResponse)
async def test_db(
    item: SampleRequest,
    pg_session: AsyncSession = Depends(get_db_session),
    redis_conn: redis.asyncio.Redis = Depends(get_redis)) -> CommonResponse:
    
    # Write to PostgreSQL
    db_item = KeyValueStore(key=item.key, value=item.value)
    pg_session.add(db_item)
    await pg_session.commit()

    # Write to Redis
    await redis_conn.set(item.key, item.value)

    return CommonResponse(error_code=0, error_message="Successfully wrote to DB and Redis")
