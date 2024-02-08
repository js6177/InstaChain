from dataclasses import dataclass

@dataclass
class BitcoinRpcResponse:
    success: bool = False  # True if the request was successful, False if the request threw an exception
    exception: Exception = None  # the exception thrown by the request, if any
