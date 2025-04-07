from pydantic import BaseModel

class WithdrawalBroadcastedRequest(BaseModel):
    layer1_transaction_id: str
    layer1_transaction_vout: int
    layer1_address: str
    amount: int
    layer2_withdrawal_id: str
    signature: str