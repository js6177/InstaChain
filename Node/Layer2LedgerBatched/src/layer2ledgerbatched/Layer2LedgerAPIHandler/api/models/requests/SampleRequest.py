from pydantic import BaseModel

class SampleRequest(BaseModel):
    key: str = None
    value: str = None