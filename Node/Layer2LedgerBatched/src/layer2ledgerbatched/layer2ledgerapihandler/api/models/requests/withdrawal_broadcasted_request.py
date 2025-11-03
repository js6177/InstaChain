from pydantic import BaseModel
from typing import List

class Layer1BroadcastedWithdrawalTransaction(BaseModel):
    layer1_transaction_id: str
    layer1_transaction_vout: int
    layer1_address: str
    amount: int
    layer2_withdrawal_id: str
    signature: str

class WithdrawalBroadcastedRequest(BaseModel):
    transactions: List[Layer1BroadcastedWithdrawalTransaction]