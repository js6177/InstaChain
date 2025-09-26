from fastapi import Depends, FastAPI
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Dict
import redis
from sqlalchemy.ext.asyncio import AsyncSession

#from src.api import users, transfers, deposits, withdrawals
from layer2ledgerbatched.layer2ledgerapihandler.api.models.requests.sample_request import SampleRequest
from layer2ledgerbatched.common.db.session import engine, get_db_session
from layer2ledgerbatched.common.db.models import Base
from layer2ledgerbatched.common.redis.redis_driver.session import get_redis_conn

from layer2ledgerbatched.layer2ledgerapihandler.api.routes import transfer

from layer2ledgerbatched.layer2ledgerapihandler.api.models.responses.common_response import CommonResponse


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # on startup
    async with engine.begin() as conn:
        # This will create the tables, use with caution in production
        # await conn.run_sync(Base.metadata.drop_all) # if you want to drop tables on startup
        await conn.run_sync(Base.metadata.create_all)
    yield
    # on shutdown
    pass

app = FastAPI(lifespan=lifespan)

app.include_router(transfer.router, prefix="/transfer", tags=["transfer"])

@app.get("/", response_model = CommonResponse)
async def root(    
    pg_session: AsyncSession = Depends(get_db_session),
    redis_conn: redis.asyncio.Redis = Depends(get_redis_conn)) -> CommonResponse:
    return CommonResponse(error_code=0, error_message="API is running")

from layer2ledgerbatched.common.db.models import KeyValueStore
from layer2ledgerbatched.common.redis.redis_models.models import RedisKeyValueStore

@app.post("/test_db", response_model = CommonResponse)
async def test_db(
    item: SampleRequest,
    pg_session: AsyncSession = Depends(get_db_session),
    redis_conn: redis.asyncio.Redis = Depends(get_redis_conn)) -> CommonResponse:
    
    # Write to PostgreSQL
    db_item = KeyValueStore(key=item.key, value=item.value)
    pg_session.add(db_item)
    await pg_session.commit()

    # Write to Redis
    await redis_conn.set(item.key, item.value)

    return CommonResponse(error_code=0, error_message="Successfully wrote to DB and Redis")
