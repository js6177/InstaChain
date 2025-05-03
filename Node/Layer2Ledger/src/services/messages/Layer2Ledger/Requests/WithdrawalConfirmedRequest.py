from pydantic import BaseModel

class WithdrawalConfirmedRequest(BaseModel):
    layer1_transaction_id: str
    layer1_transaction_vout: int
    layer1_address: str
    amount: int
    signature: str