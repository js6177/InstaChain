from sqlalchemy import Column, Integer, String, DateTime, Float
from sqlalchemy.sql import func
from Layer2Ledger.database.database import Base, get_db
import datetime

TIMER_PRECISION = 3
TRANSACTION_DURATION_LOGGING_ENABLED = False

class TransactionDuration(Base):
    __tablename__ = "transaction_durations"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    duration = Column(Float)
    transaction_id = Column(String, index=True)
    action = Column(String)
    item_count = Column(Integer)

    @staticmethod
    def logDuration(previousTimestamp, _transaction_id, _action, _item_count = 0):
        if TRANSACTION_DURATION_LOGGING_ENABLED:
            t2 = datetime.datetime.now()
            delta = t2 - previousTimestamp
            with get_db() as db:
                try:
                    log = TransactionDuration(
                        action=_action,
                        item_count=_item_count,
                        duration=round(delta.total_seconds() * 1000, TIMER_PRECISION),
                        transaction_id=_transaction_id
                    )
                    db.add(log)
                    db.commit()
                except Exception as e:
                    db.rollback()
                    # No need to raise an exception here, this is not a critical operation

