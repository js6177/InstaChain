import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from typing import Generator


# Replace with your database URL
DATABASE_PATH = os.path.expanduser('~') + "/.IC/Layer2Ledger"
DATABASE_URL = f"sqlite:///{DATABASE_PATH}/Layer2Ledger.db"  # Using SQLite for example

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class DatabaseSession:
    def __enter__(self) -> Session:
        self.db = SessionLocal()
        return self.db

    def __exit__(self, exc_type, exc_value, traceback):
        self.db.close()

def get_db() -> DatabaseSession:
    return DatabaseSession()