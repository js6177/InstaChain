from pydantic import BaseModel

class WithdrawalCanceledRequest(BaseModel):
    source_address_public_key: str
    transaction_id: str
    amount: int
    signature: str