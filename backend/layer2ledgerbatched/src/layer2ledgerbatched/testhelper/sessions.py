from __future__ import annotations

from collections.abc import AsyncGenerator

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from config_loader.loader import get_layer2ledgerbatched_common_config


def create_db_engine() -> AsyncEngine:
    settings = get_layer2ledgerbatched_common_config()
    return create_async_engine(
        settings.database.database_url,
        echo=False,
        pool_size=5,
        pool_timeout=30,
    )


async def get_db_session(request: Request) -> AsyncGenerator[AsyncSession, None]:
    session_maker: async_sessionmaker[AsyncSession] = request.app.state.db_session_maker
    async with session_maker() as session:
        yield session
