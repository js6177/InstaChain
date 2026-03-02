from typing import List, Dict, Any, Optional
from bitcoin_core_rpc import (
    BitcoinRPCClient,
    LoadWalletResponse,
    ListSinceBlockResponse,
    GetTransactionResponse,
    AddressGroupingItem,
    GetBlockHeaderResponse
)
from config_models.models import Layer2BridgeBitcoinConfFileSettings
from OnboardingLogger import OnboardingLogger

DEFAULT_TESTNET = True
TESTNET_TARGETCONFIRMATIONS = 3
MAINNET_TARGETCONFIRMATIONS = 6
SATOSHI_PER_BITCOIN = 100000000

class BitcoinRPC:
    def __init__(self, rpc_config: Layer2BridgeBitcoinConfFileSettings, wallet_name: str, testnet: bool = DEFAULT_TESTNET):
        self.client = BitcoinRPCClient(rpc_config, wallet_name)
        self.testnet = testnet
        self.wallet_name = wallet_name
        OnboardingLogger(f"rpc_port: {rpc_config.rpcport}")

    def getMinimumTransactionAmount(self) -> int:
        return 1000

    def getTargetConfirmations(self) -> int:
        return TESTNET_TARGETCONFIRMATIONS if self.testnet else MAINNET_TARGETCONFIRMATIONS

    async def loadWallet(self) -> LoadWalletResponse:
        try:
            response = await self.client.loadwallet(self.wallet_name)
            if response.result:
                return response.result
            if response.is_wallet_already_loaded:
                return LoadWalletResponse(name=self.wallet_name, warning="Already loaded")
            if response.error:
                raise Exception(f"Failed to load wallet: {response.error.message}")
            raise Exception("Failed to load wallet: Unknown error")
        except Exception as e:
            OnboardingLogger(e)
            raise

    async def broadcastTransaction(self, pendingWithdrawals: Dict[str, Any]) -> str:
        amounts = {}
        subtractfeefrom = []
        for pendingWithdrawal in pendingWithdrawals.values():
            subtractfeefrom.append(pendingWithdrawal.destination_address)
            existingAmount = amounts.get(pendingWithdrawal.destination_address, 0.0)
            amounts[pendingWithdrawal.destination_address] = (pendingWithdrawal.amount / SATOSHI_PER_BITCOIN) + existingAmount
        
        OnboardingLogger(f"broadcastTransaction: {amounts}")
        try:
            txid = await self.client.sendmany(amounts, minconf=1, subtractfeefrom=subtractfeefrom)
            OnboardingLogger(f"/broadcastTransaction: {txid}")
            return txid
        except Exception as e:
            OnboardingLogger(e)
            raise

    async def getConfirmedTransactions(self, lastblockhash: str = '') -> ListSinceBlockResponse:
        targetConfirmations = self.getTargetConfirmations() if lastblockhash else 1
        OnboardingLogger(f'lastblockhash: {lastblockhash}, targetConfirmations: {targetConfirmations}')
        
        try:
            response = await self.client.listsinceblock(lastblockhash, targetConfirmations)
            return response
        except Exception as e:
            OnboardingLogger(f"listsinceblock error: {e}")
            raise

    async def getTransaction(self, transaction_id: str) -> GetTransactionResponse:
        try:
            return await self.client.gettransaction(transaction_id)
        except Exception as e:
            OnboardingLogger(e)
            raise
    
    async def getAddressGroupings(self) -> List[List[AddressGroupingItem]]:
        try:
            return await self.client.listaddressgroupings()
        except Exception as e:
            OnboardingLogger(e)
            raise

    async def getBlockHeader(self, blockhash: str) -> GetBlockHeaderResponse:
        try:
            return await self.client.getblockheader(blockhash)
        except Exception as e:
            OnboardingLogger(e)
            raise
    
    async def getBlockHeight(self) -> int:
        try:
            return await self.client.getblockcount()
        except Exception as e:
            OnboardingLogger(e)
            raise
