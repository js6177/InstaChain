from pydantic import BaseModel

class RedisKeyValueStore(BaseModel):
    key: str
    value: str
