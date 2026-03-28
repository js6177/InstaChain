from fastapi import Depends, FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator, Callable, Dict
import redis
import json
import time
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, AsyncEngine, async_sessionmaker
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import StreamingResponse

from config_loader.loader import get_layer2ledgerbatched_common_config, Environment
from layer2ledgerbatched.common.redis.redis_driver.distributed_lock import DistributedLock
from openl2_layer2ledger_api.models.requests import SampleRequest
from layer2ledgerbatched.common.db.models import Base
from layer2ledgerbatched.layer2ledgerapihandler.api.routes import transfer, deposit, withdrawal, explorer, info
from openl2_layer2ledger_api import TRANSFER_ROUTER_PREFIX, DEPOSIT_ROUTER_PREFIX, WITHDRAWAL_ROUTER_PREFIX, EXPLORER_ROUTER_PREFIX, INFO_ROUTER_PREFIX
from openl2_layer2ledger_api.models.responses import CommonResponse
from layer2ledgerbatched.layer2ledgerapihandler.utils.sessions import get_redis, get_db_session, get_redis_lock_manager

# Type alias for the next function in the middleware chain
CallNext = Callable[[Request], Any]
    
class LoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self, 
        request: Request, 
        call_next: CallNext
    ) -> Response:
        # 1. Capture Request Body
        request_body_bytes: bytes = await request.body()
        
        start_time: float = time.time()
        
        # 2. Process the request
        # Note: we pass the original request; FastAPI handles the body stream internally
        response: StreamingResponse = await call_next(request)
        
        process_time_ms: float = (time.time() - start_time) * 1000

        # 3. Capture Response Body
        # Since response.body_iterator is a generator, we must consume it to log it
        response_body_chunks: list[bytes] = []
        async for chunk in response.body_iterator:
            # Check if the chunk is a string and encode it if necessary
            if isinstance(chunk, str):
                chunk = chunk.encode("utf-8")
            response_body_chunks.append(chunk)
        
        full_response_body: bytes = b"".join(response_body_chunks)

        # 4. Structured Logging
        log_entry: Dict[str, Any] = {
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
            "duration_ms": round(process_time_ms, 2),
            "request_payload": self._to_json(request_body_bytes),
            "response_payload": self._to_json(full_response_body),
        }

        print(json.dumps(log_entry, indent=2))

        # 5. Reconstruct the Response
        # Because we consumed the iterator, we must return a new Response object
        return Response(
            content=full_response_body,
            status_code=response.status_code,
            headers=dict(response.headers),
            media_type=response.media_type
        )

    def _to_json(self, data: bytes) -> Any:
        """Helper to safely parse bytes to JSON or string."""
        if not data:
            return None
        try:
            return json.loads(data.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            return data.decode("utf-8", errors="replace")
        

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    settings = get_layer2ledgerbatched_common_config()
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
        settings.database.database_url, 
        echo=False,
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

app = FastAPI(lifespan=lifespan, redirect_slashes=False)

origins = [
    "http://localhost:5173",  # Allow the Vite frontend
    "http://127.0.0.1:5173", # Allow the Vite frontend
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(LoggingMiddleware)

app.include_router(transfer.router, prefix=TRANSFER_ROUTER_PREFIX, tags=["transfer"])
app.include_router(deposit.router, prefix=DEPOSIT_ROUTER_PREFIX, tags=["deposit"])
app.include_router(withdrawal.router, prefix=WITHDRAWAL_ROUTER_PREFIX, tags=["withdrawal"])
app.include_router(explorer.router, prefix=EXPLORER_ROUTER_PREFIX, tags=["explorer"])
app.include_router(info.router, prefix=INFO_ROUTER_PREFIX, tags=["info"])

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("layer2ledgerbatched.layer2ledgerapihandler.main:app", host="0.0.0.0", port=8080, reload=False)
