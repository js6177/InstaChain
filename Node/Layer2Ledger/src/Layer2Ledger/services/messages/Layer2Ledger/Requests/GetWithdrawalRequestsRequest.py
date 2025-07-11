from pydantic import BaseModel

class GetWithdrawalRequestsRequest(BaseModel):
    latest_timestamp: int