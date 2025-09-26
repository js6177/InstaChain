from typing import List
from .common_response import CommonResponse

class Layer1BroadcastedWithdrawalTransactionStatus(CommonResponse):
    layer2_withdrawal_id: str

class WithdrawalBroadcastedResponse(CommonResponse):
    transactions: List[Layer1BroadcastedWithdrawalTransactionStatus] = None