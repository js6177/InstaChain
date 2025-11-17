from pydantic import BaseModel

class SampleRequest(BaseModel):
    key: str
    value: str