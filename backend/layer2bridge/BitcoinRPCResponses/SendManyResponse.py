from dataclasses import dataclass
import string
from BitcoinRPCResponses.BitcoinRPCResponse import BitcoinRpcResponse


@dataclass
class BitcoinRpcSendManyResponse(BitcoinRpcResponse):
    transaction_id: string = ""