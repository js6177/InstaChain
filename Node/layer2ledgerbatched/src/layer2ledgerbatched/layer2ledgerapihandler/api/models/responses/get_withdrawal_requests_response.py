from typing import List
from .common_response import CommonResponse

from pydantic import BaseModel

class WithdrawalRequest(BaseModel):
    layer1_address: str
    layer1_transaction_id: str | None  # transaction id of the confirmed layer1 transaction. Can be None if the withdrawal has not been broadcasted yet
    status: int  # status of this withdrawal
    amount: int  # amount withdrawing
    layer2_withdrawal_id: str
    server_signature: str | None  # signed with server's key. Temporarily None. TODO: implement server signature
    layer2_transaction_id: str  # transaction id that requested this withdrawal
    withdrawal_requested_timestamp: int  # unix time in seconds
    withdrawal_requested_timestamp_str: str | None  # human readable timestamp, can be None. Is only used to make eat more human-readable


class GetWithdrawalRequestsResponse(CommonResponse):
    withdrawal_requests: List[WithdrawalRequest] = None
