from pydantic import BaseModel
from typing import List, Union, Optional

class MasterKeys(BaseModel):
    master_xprv: str
    master_xpub: str
    derivation_path: str
    testnet: bool

class BitcoinCoreDescriptor(BaseModel):
    desc: str
    active: bool
    internal: bool
    range: List[int]
    next_index: int
    timestamp: Union[int, str]
    label: str
