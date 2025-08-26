from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, AsyncEngine, async_sessionmaker
from layer2ledgerbatched.common.config.config import get_settings

settings = get_settings("prod")

engine: AsyncEngine = create_async_engine(
    settings.database_url, 
    echo=True,
    pool_size=20, 
    pool_timeout=30,
)
AsyncSessionLocal = async_sessionmaker(
    bind=engine, autoflush=False, expire_on_commit=False
)

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
