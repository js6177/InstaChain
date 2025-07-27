import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from typing import Generator
from Layer2Ledger.config.config import config

# Construct the database URL from the configuration
db_config = config.database_connection
DATABASE_URL = f"{db_config.database_engine}+psycopg://{db_config.user}:{db_config.password}@{db_config.host}:{db_config.port}/{db_config.database_name}"

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
