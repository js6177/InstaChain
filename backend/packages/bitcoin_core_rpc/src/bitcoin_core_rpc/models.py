from pydantic import BaseModel, Field, RootModel
from typing import Any, Generic, TypeVar, Optional, Union

T = TypeVar('T')

class BitcoinRPCRequest(BaseModel):
    jsonrpc: str = "1.0"
    id: str = "bitcoin-core-rpc"
    method: str
    params: list[Any] = Field(default_factory=list)

class BitcoinRPCError(BaseModel):
    code: int
    message: str
    data: Optional[Any] = None

class BitcoinRPCResponse(BaseModel, Generic[T]):
    result: Optional[T] = None
    error: Optional[BitcoinRPCError] = None
    id: str

    @property
    def is_wallet_already_loaded(self) -> bool:
        return self.error is not None and self.error.code == -35

    @property
    def is_wallet_already_exists(self) -> bool:
        return self.error is not None and self.error.code == -4

class GetBestBlockHashResponse(BaseModel):
    hash: str

class SoftforkBIP9(BaseModel):
    status: str
    bit: Optional[int] = None
    statistics: Optional[dict[str, Any]] = None

class Softfork(BaseModel):
    type: str
    bip9: Optional[SoftforkBIP9] = None
    active: bool
    height: Optional[int] = None

class GetBlockChainInfoResponse(BaseModel):
    chain: str
    blocks: int
    headers: int
    bestblockhash: str
    difficulty: float
    mediantime: int
    verificationprogress: float
    initialblockdownload: bool
    chainwork: str
    size_on_disk: int
    pruned: bool
    pruneheight: Optional[int] = None
    automatic_pruning: Optional[bool] = None
    prune_target_size: Optional[int] = None
    softforks: Optional[dict[str, Softfork]] = None
    warnings: list[str]
    bits: Optional[str] = None
    target: Optional[str] = None
    time: Optional[int] = None

class CreateWalletResponse(BaseModel):
    name: str
    warning: Optional[str] = None

class LoadWalletResponse(BaseModel):
    name: str
    warning: Optional[str] = None

class DescriptorImportRequest(BaseModel):
    desc: str
    active: bool = False
    timestamp: Union[int, str] = "now"
    range: Optional[Union[int, list[int]]] = None
    internal: bool = False
    next_index: Optional[int] = None

class ImportDescriptorResult(BaseModel):
    success: bool
    warnings: Optional[list[str]] = None
    error: Optional[dict[str, Any]] = None

class ListSinceBlockTransaction(BaseModel):
    address: Optional[str] = None
    category: str
    amount: float
    label: Optional[str] = None
    vout: int
    fee: Optional[float] = None
    confirmations: int
    blockhash: Optional[str] = None
    blockindex: Optional[int] = None
    blocktime: Optional[int] = None
    txid: str
    time: int
    timereceived: int
    bip125_replaceable: str
    abandoned: Optional[bool] = None

class ListSinceBlockResponse(BaseModel):
    transactions: list[ListSinceBlockTransaction]
    lastblock: str

class GetTransactionDetail(BaseModel):
    address: Optional[str] = None
    category: str
    amount: float
    label: Optional[str] = None
    vout: int
    fee: Optional[float] = None
    abandoned: Optional[bool] = None

class GetTransactionResponse(BaseModel):
    amount: float
    fee: Optional[float] = None
    confirmations: int
    blockhash: Optional[str] = None
    blockindex: Optional[int] = None
    blocktime: Optional[int] = None
    txid: str
    time: int
    timereceived: int
    bip125_replaceable: str
    details: list[GetTransactionDetail]
    hex: str

class AddressGroupingItem(RootModel):
    root: list[Any]  # [address, amount, label]

    @property
    def address(self) -> str:
        return str(self.root[0])

    @property
    def amount(self) -> float:
        return float(self.root[1])

    @property
    def label(self) -> Optional[str]:
        if len(self.root) > 2:
            return str(self.root[2])
        return None

class GetBlockHeaderResponse(BaseModel):
    hash: str
    confirmations: int
    height: int
    version: int
    versionHex: str
    merkleroot: str
    time: int
    mediantime: int
    nonce: int
    bits: str
    difficulty: float
    chainwork: str
    nTx: int
    previousblockhash: Optional[str] = None
    nextblockhash: Optional[str] = None
