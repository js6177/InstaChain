from pydantic import BaseModel
from typing import List

class Layer1AddressBalance(BaseModel):
    layer1_address: str
    balance: int

class PostLayer1AuditReportRequest(BaseModel):
    block_height: int
    layer1_address_balances: List[Layer1AddressBalance]
    signature: str