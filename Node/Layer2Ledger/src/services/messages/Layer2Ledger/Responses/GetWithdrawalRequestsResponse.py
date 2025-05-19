from typing import List
from .CommonResponse import CommonResponse

from pydantic import BaseModel

class WithdrawalRequest(BaseModel):
    layer1_address: str
    layer1_transaction_id: str  # transaction id of the confirmed layer1 transaction
    status: int  # status of this withdrawal
    amount: int  # amount withdrawing
    layer2_withdrawal_id: str
    server_signature: str  # signed with the onboarding key
    layer2_transaction_id: str  # transaction id that requested this withdrawal
    withdrawal_requested_timestamp: int  # unix time in seconds
    withdrawal_requested_timestamp_str: str


class GetWithdrawalRequestsResponse(CommonResponse):
    withdrawal_requests: List[WithdrawalRequest] = None
