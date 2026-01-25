import os
import Layer2Ledger.core.ErrorMessage as ErrorMessage
from Layer2Ledger.API.InstaChainAPI import InstachainRequestHandler
from Layer2Ledger.services.messages.Layer2Ledger.Responses.GetNodeInfoResponse import GetNodeInfoResponse, NodeInfo, Layer1NetworkInfo, Version
import json
from Layer2Ledger.config.config import config
from fastapi import Request
from Layer2Ledger.database.database import AsyncSession

#unique randomly generated alphanumeric string valid for the lifetime of the node + ledger
#used as a nonce for signing transactions to prevent cross-node relay attacks, has no cryptographic value 
NODE_ID = config.NODE_ID

DEPOSIT_WALLET_MASTER_PUBKEY = config.DEPOSIT_WALLET_MASTER_PUBKEY

#lower 32 bits are used to specify the asset
ASSET_BITCOIN = 1
ASSET_ETHEREUM = 2

ASSET_TESTNET_FLAG = (1 << 32) #bit 32 is the testnet flag
ASSET_STABLECOIN_FLAG = (1 << 33)

#minimum transaction amount for withdrawals
MINIMUM_LAYER1_TRANSACTION_AMOUNT = config.MINIMUM_LAYER1_TRANSACTION_AMOUNT

# variable that holds what asset the node supports
# For now, a node can support only 1 asset, though in the future, multi-asset nodes are possible
NODE_ASSET_ID = ASSET_BITCOIN|ASSET_TESTNET_FLAG

from Layer2Ledger.core.signing_keys import ONBOARDING_DEPOSIT_SIGNING_KEY_PUBKEY


class getNodeInfo(InstachainRequestHandler):
    async def getParameters(self, request: Request):
        # Retain the getParameters function
        pass

    async def processRequest(self, db: AsyncSession):
        version = Version(major_version=1, minor_version=0, patch_version=0, API_version=1)
        layer1_network_info = Layer1NetworkInfo(minimum_transaction_amount=MINIMUM_LAYER1_TRANSACTION_AMOUNT)
        node_info = NodeInfo(
            node_id=NODE_ID,
            node_name='Tesnet Node',
            asset_id=NODE_ASSET_ID,
            deposit_address_derivation_path="pkh(" + DEPOSIT_WALLET_MASTER_PUBKEY + "/44/1/(i/2147483647)/(i%2147483647))",
            onboarding_deposit_signing_key_pubkey=ONBOARDING_DEPOSIT_SIGNING_KEY_PUBKEY,
            version=version,
            layer1_network_info=layer1_network_info
        )
        self.result = GetNodeInfoResponse(
            node_info=node_info,
            **ErrorMessage.build_error_message(ErrorMessage.ERROR_SUCCESS)
        )
