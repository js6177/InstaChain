from pydantic import BaseModel, Field
from typing import List
import datetime

from layer2ledgerbatched.common.db.models import (
    WithdrawalRequests,
    WithdrawalStatus,
)
from layer2ledgerbatched.common.redis.redis_models.transactions import RedisTransaction

PENDING_WITHDRAWALS_LIST_KEY = "PendingWithdrawals"


class RedisWithdrawalRequest(BaseModel):
    layer1_address: str
    layer1_transaction_id: str | None = None
    status: WithdrawalStatus
    amount: int
    layer2_withdrawal_id: str
    server_signature: str | None = None
    layer2_transaction_id: str
    withdrawal_requested_timestamp: int
    withdrawal_requested_timestamp_str: datetime.datetime = Field(
        default_factory=datetime.datetime.utcnow
    )
    batch_height: int = 0

    class Config:
        from_attributes = True

    @classmethod
    def from_sqlalchemy(cls, wr: WithdrawalRequests) -> "RedisWithdrawalRequest":
        return cls.model_validate(wr)

    def to_sqlalchemy(self) -> WithdrawalRequests:
        return WithdrawalRequests(**self.model_dump())


class PendingWithdrawal(BaseModel):
    transaction: RedisTransaction
    withdrawal_request: RedisWithdrawalRequest
    lock_token: str | None
    addresses_locked: List[str]
