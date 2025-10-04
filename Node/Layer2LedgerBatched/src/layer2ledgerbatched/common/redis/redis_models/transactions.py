from pydantic import BaseModel, Field
from typing import List
import datetime

from layer2ledgerbatched.common.db.models import Transaction, TransactionType

PENDING_TRANSACTIONS_LIST_KEY = "PendingTransactions"

class RedisTransaction(BaseModel):
    timestamp: datetime.datetime = Field(default_factory=datetime.datetime.utcnow)
    amount: int
    fee: int
    source_address_pubkey: str
    destination_address_pubkey: str
    transaction_type: TransactionType
    layer2_transaction_id: str
    signature: str
    signature_date: int
    layer1_transaction_id: str = ""
    layer2_withdrawal_id: str = ""

    class Config:
        from_attributes = True


    @classmethod
    def from_sqlalchemy(cls, tx: Transaction) -> "RedisTransaction":
        return cls.from_orm(tx)

    def to_sqlalchemy(self) -> Transaction:
        return Transaction(**self.dict())

class PendingTransaction(BaseModel):
    transaction: RedisTransaction
    lock_token: str
    addresses_locked: List[str]