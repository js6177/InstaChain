from sqlalchemy import Column, String
from sqlalchemy.orm import Mapped, mapped_column
from Layer2Ledger.database.database import Base, DatabaseSession

class KeyValueStore(Base):
    __tablename__ = "key_value_store"

    key: Mapped[str] = mapped_column(String, primary_key=True, index=True)
    value: Mapped[str] = mapped_column(String, nullable=False)

    @staticmethod
    def get(db: DatabaseSession, key: str, default: str = None) -> str:
        """Get a value from the store by key."""
        row = db.query(KeyValueStore).filter(KeyValueStore.key == key).first()
        return row.value if row else default


    @staticmethod
    def set(db: DatabaseSession, key: str, value: str):
        """Set a value in the store by key."""
        try:
            row = db.query(KeyValueStore).filter(KeyValueStore.key == key).first()
            if not row:
                row = KeyValueStore(key=key, value=value)
                db.add(row)
            else:
                row.value = value
        except Exception as e:
            raise


    @staticmethod
    def increment_int(db: DatabaseSession, key: str, increment: int = 1, default: int = 0) -> int:
        """Increment an integer value in the store."""
        try:
            row = db.query(KeyValueStore).filter(KeyValueStore.key == key).first()
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
