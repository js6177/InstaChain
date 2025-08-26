from fastapi import FastAPI
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Dict

#from src.api import users, transfers, deposits, withdrawals
from layer2ledgerbatched.common.db.session import engine
from layer2ledgerbatched.common.db.models import Base

from layer2ledgerbatched.Layer2LedgerAPIHandler.api.routes import transfer


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

@app.get("/")
async def root() -> Dict[str, str]:
    return {"message": "Hello World"}
