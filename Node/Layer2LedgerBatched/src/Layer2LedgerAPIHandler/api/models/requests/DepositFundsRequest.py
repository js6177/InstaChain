from pydantic import BaseModel
from typing import List

class DepositTransaction(BaseModel):
    layer1_transaction_id: str
    layer1_transaction_vout: int
    layer1_address: str
    amount: int
    nonce: str
    signature: str

class DepositFundsRequest(BaseModel):
    transactions: List[DepositTransaction]