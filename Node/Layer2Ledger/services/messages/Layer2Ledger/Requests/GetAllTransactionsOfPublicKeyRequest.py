from pydantic import BaseModel
from typing import List

class GetAllTransactionsOfPublicKeyRequest(BaseModel):
    public_keys: List[str]