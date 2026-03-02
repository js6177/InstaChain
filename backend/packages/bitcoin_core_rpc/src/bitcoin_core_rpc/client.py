import httpx
from typing import Any, Optional, Type, TypeVar, Union
from .models import (
    BitcoinRPCRequest, 
    BitcoinRPCResponse, 
    GetBlockChainInfoResponse,
    CreateWalletResponse,
    LoadWalletResponse,
    DescriptorImportRequest,
    ImportDescriptorResult,
    ImportMultiRequest,
    ImportMultiResult,
    ListSinceBlockResponse,
    GetTransactionResponse,
    AddressGroupingItem,
    GetBlockHeaderResponse
)
from config_models.models import Layer2BridgeBitcoinConfFileSettings
from pydantic import BaseModel

R = TypeVar('R')

class BitcoinRPCClient:
    def __init__(self, config: Layer2BridgeBitcoinConfFileSettings, wallet_name: Optional[str] = None):
        self.config = config
        self.wallet_name = wallet_name
        self.base_url = f"http://{config.rpchost}:{config.rpcport}"
        self.auth = (config.rpcuser, config.rpcpassword)

    @property
    def url(self) -> str:
        if self.wallet_name:
            return f"{self.base_url}/wallet/{self.wallet_name}"
        return self.base_url

    async def _call_raw(self, method: str, params: list[Any] = None, response_model: Type[R] = Any) -> BitcoinRPCResponse[R]:
        if params is None:
            params = []
        
        def serialize_param(p: Any) -> Any:
            if isinstance(p, BaseModel):
                return p.model_dump(exclude_none=True)
            if isinstance(p, list):
                return [serialize_param(i) for i in p]
            if isinstance(p, dict):
                return {k: serialize_param(v) for k, v in p.items() if v is not None}
            return p

        serialized_params = [serialize_param(p) for p in params]
        request_data = BitcoinRPCRequest(method=method, params=serialized_params)
        payload = request_data.model_dump()
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.url,
                json=payload,
                auth=self.auth,
                timeout=120.0
            )
            
            # Bitcoin Core often returns 500 for RPC errors but with a valid JSON body
            try:
                rpc_response = BitcoinRPCResponse[response_model].model_validate(response.json())
                return rpc_response
            except Exception:
                response.raise_for_status()
                raise Exception(f"Failed to parse Bitcoin RPC response: {response.text}")

    async def _call(self, method: str, params: list[Any] = None) -> Any:
        rpc_response = await self._call_raw(method, params)
        if rpc_response.error:
            raise Exception(f"Bitcoin RPC error: {rpc_response.error.code} - {rpc_response.error.message}")
        return rpc_response.result

    async def getbestblockhash(self) -> str:
        return str(await self._call("getbestblockhash"))

    async def getblockcount(self) -> int:
        return int(await self._call("getblockcount"))

    async def getblockchaininfo(self) -> GetBlockChainInfoResponse:
        result = await self._call("getblockchaininfo")
        return GetBlockChainInfoResponse.model_validate(result)

    async def createwallet(self, wallet_name: str, disable_private_keys: bool = False, 
                           blank: bool = False, passphrase: str = "", 
                           avoid_reuse: bool = False, descriptors: bool = True, 
                           load_on_startup: Optional[bool] = None) -> BitcoinRPCResponse[CreateWalletResponse]:
        params = [wallet_name, disable_private_keys, blank, passphrase, avoid_reuse, descriptors]
        if load_on_startup is not None:
            params.append(load_on_startup)
        return await self._call_raw("createwallet", params, CreateWalletResponse)

    async def loadwallet(self, filename: str, load_on_startup: Optional[bool] = None) -> BitcoinRPCResponse[LoadWalletResponse]:
        params = [filename]
        if load_on_startup is not None:
            params.append(load_on_startup)
        return await self._call_raw("loadwallet", params, LoadWalletResponse)

    async def importdescriptors(self, requests: list[DescriptorImportRequest]) -> list[ImportDescriptorResult]:
        result = await self._call("importdescriptors", [requests])
        return [ImportDescriptorResult.model_validate(r) for r in result]

    async def importmulti(self, requests: list[ImportMultiRequest], rescan: bool = True) -> list[ImportMultiResult]:
        result = await self._call("importmulti", [requests, {"rescan": rescan}])
        return [ImportMultiResult.model_validate(r) for r in result]

    async def sendmany(self, amounts: dict[str, float], minconf: int = 1, 
                       comment: str = "", subtractfeefrom: list[str] = None, 
                       replaceable: bool = False, conf_target: Optional[int] = None, 
                       estimate_mode: str = "unset") -> str:
        if subtractfeefrom is None:
            subtractfeefrom = []
        params = ["", amounts, minconf, comment, subtractfeefrom, replaceable]
        if conf_target is not None:
            params.append(conf_target)
            params.append(estimate_mode)
        result = await self._call("sendmany", params)
        return str(result)

    async def listsinceblock(self, blockhash: str = "", target_confirmations: int = 1, 
                             include_watchonly: bool = True, include_removed: bool = True) -> ListSinceBlockResponse:
        result = await self._call("listsinceblock", [blockhash, target_confirmations, include_watchonly, include_removed])
        return ListSinceBlockResponse.model_validate(result)

    async def gettransaction(self, txid: str, include_watchonly: bool = True, verbose: bool = False) -> GetTransactionResponse:
        result = await self._call("gettransaction", [txid, include_watchonly, verbose])
        return GetTransactionResponse.model_validate(result)

    async def listaddressgroupings(self) -> list[list[AddressGroupingItem]]:
        result = await self._call("listaddressgroupings")
        return [[AddressGroupingItem.model_validate(item) for item in group] for group in result]

    async def getnewaddress(self, label: str = "", address_type: Optional[str] = None) -> str:
        params = [label]
        if address_type is not None:
            params.append(address_type)
        return str(await self._call("getnewaddress", params))

    async def getblockheader(self, blockhash: str, verbose: bool = True) -> GetBlockHeaderResponse:
        result = await self._call("getblockheader", [blockhash, verbose])
        return GetBlockHeaderResponse.model_validate(result)
