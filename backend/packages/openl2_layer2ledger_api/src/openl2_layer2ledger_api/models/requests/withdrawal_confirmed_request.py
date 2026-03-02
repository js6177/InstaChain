from typing import List
from pydantic import BaseModel

class Layer1WithdrawalConfirmedTransaction(BaseModel):
    layer1_transaction_id: str
    layer1_transaction_vout: int
    layer1_address: str
    amount: int
    signature: str

class WithdrawalConfirmedRequest(BaseModel):
    transactions: List[Layer1WithdrawalConfirmedTransaction]