import os
import Layer2Ledger.core.ErrorMessage as ErrorMessage
from InstaChainAPI import InstachainRequestHandler
from services.messages.Layer2Ledger.Responses.GetNodeInfoResponse import GetNodeInfoResponse, NodeInfo, Layer1NetworkInfo, Version
import json
from config import get_config, get_int_config

#unique randomly generated alphanumeric string valid for the lifetime of the node + ledger
#used as a nonce for signing transactions to prevent cross-node relay attacks, has no cryptographic value 
NODE_ID = get_config('NODE_ID')

DEPOSIT_WALLET_MASTER_PUBKEY = get_config('DEPOSIT_WALLET_MASTER_PUBKEY')

#lower 32 bits are used to specify the asset
ASSET_BITCOIN = 1
ASSET_ETHEREUM = 2

ASSET_TESTNET_FLAG = (1 << 32) #bit 32 is the testnet flag
ASSET_STABLECOIN_FLAG = (1 << 33)

#minimum transaction amount for withdrawals
MINIMUM_LAYER1_TRANSACTION_AMOUNT = get_int_config('MINIMUM_LAYER1_TRANSACTION_AMOUNT', 1000)

# variable that holds what asset the node supports
# For now, a node can support only 1 asset, though in the future, multi-asset nodes are possible
NODE_ASSET_ID = ASSET_BITCOIN|ASSET_TESTNET_FLAG

from signing_keys import ONBOARDING_DEPOSIT_SIGNING_KEY_PUBKEY


class getNodeInfo(InstachainRequestHandler):
    def getParameters(self):
        # Retain the getParameters function
        pass

    def processRequest(self):
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
            **ErrorMessage.build_error_message(ErrorMessage.ERROR_SUCCESS),
            node_info=node_info
        )