from sqlalchemy import Column, String, select
from sqlalchemy.orm import Mapped, mapped_column
from Layer2Ledger.database.database import Base, AsyncSession

class KeyValueStore(Base):
    __tablename__ = "key_value_store"

    key: Mapped[str] = mapped_column(String, primary_key=True, index=True)
    value: Mapped[str] = mapped_column(String, nullable=False)

    @staticmethod
    async def get(db: AsyncSession, key: str, default: str = None) -> str:
        """Get a value from the store by key."""
        result = await db.execute(select(KeyValueStore).filter(KeyValueStore.key == key))
        row = result.scalars().first()
        return row.value if row else default


    @staticmethod
    async def set(db: AsyncSession, key: str, value: str):
        """Set a value in the store by key."""
        try:
            result = await db.execute(select(KeyValueStore).filter(KeyValueStore.key == key))
            row = result.scalars().first()
            if not row:
                row = KeyValueStore(key=key, value=value)
                db.add(row)
            else:
                row.value = value
        except Exception as e:
            raise


    @staticmethod
    async def increment_int(db: AsyncSession, key: str, increment: int = 1, default: int = 0) -> int:
        """Increment an integer value in the store."""
        try:
            result = await db.execute(select(KeyValueStore).filter(KeyValueStore.key == key))
            row = result.scalars().first()
            if not row:
                current_value = default
                row = KeyValueStore(key=key, value=str(current_value))
                db.add(row)
            else:
                current_value = int(row.value)
            
            new_value = current_value + increment
            row.value = str(new_value)
            return new_value
        except Exception as e:
            raise
