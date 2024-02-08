from dataclasses import dataclass
import string

from BitcoinRPCResponses.BitcoinRPCResponse import BitcoinRpcResponse

@dataclass
class BitcoinRpcLoadWalletResponse(BitcoinRpcResponse):
    name: string = ""
    warning: string = ""
