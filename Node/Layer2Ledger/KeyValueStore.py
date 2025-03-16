from sqlalchemy import Column, String
from database import Base, get_db

class KeyValueStore(Base):
    __tablename__ = "key_value_store"

    key = Column(String, primary_key=True, index=True)
    value = Column(String, nullable=False)

    @staticmethod
    def get(key: str, default: str = None) -> str:
        """Get a value from the store by key."""
        db = next(get_db())
        try:
            row = db.query(KeyValueStore).filter(KeyValueStore.key == key).first()
            return row.value if row else default
        finally:
            db.close()

    @staticmethod
    def set(key: str, value: str):
        """Set a value in the store by key."""
        db = next(get_db())
        try:
            row = db.query(KeyValueStore).filter(KeyValueStore.key == key).first()
            if not row:
                row = KeyValueStore(key=key, value=value)
                db.add(row)
            else:
                row.value = value
            db.commit()
        except Exception as e:
            db.rollback()
            raise e
        finally:
            db.close()

    @staticmethod
    def increment_int(key: str, increment: int = 1, default: int = 0) -> int:
        """Increment an integer value in the store."""
        db = next(get_db())
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
            db.commit()
            return new_value
        except Exception as e:
            db.rollback()
            raise e
        finally:
            db.close() 