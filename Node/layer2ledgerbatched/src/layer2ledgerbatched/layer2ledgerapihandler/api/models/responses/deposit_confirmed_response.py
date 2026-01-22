from typing import List
from .common_response import CommonResponse

class Layer1DepositConfirmedTransaction(CommonResponse):
    layer1_transaction_id: str
    layer1_transaction_vout: int

class DepositConfirmedResponse(CommonResponse):
    transactions: List[Layer1DepositConfirmedTransaction]