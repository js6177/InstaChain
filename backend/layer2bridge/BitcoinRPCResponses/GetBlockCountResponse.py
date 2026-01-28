from dataclasses import dataclass, field
import string
from typing import List

from BitcoinRPCResponses.BitcoinRPCResponse import BitcoinRpcResponse

@dataclass
class BitcoinRpcGetBlockHeightResponse(BitcoinRpcResponse):
    height: int = 0