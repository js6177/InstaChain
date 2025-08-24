from pydantic import BaseModel
from typing import List

class AckWithdrawalRequestsRequest(BaseModel):
    layer2_withdrawal_ids: List[str]