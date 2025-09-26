from .common_response import CommonResponse
from pydantic import BaseModel

class Layer1WithdrawalConfirmedTransactionStatus(CommonResponse):
    layer1_transaction_id: str
    layer1_transaction_vout: int

class WithdrawalConfirmedResponse(CommonResponse):
    transactions: list[Layer1WithdrawalConfirmedTransactionStatus] = None