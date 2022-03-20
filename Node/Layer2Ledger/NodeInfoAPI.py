import os
import ErrorMessage
from InstaChainAPI import InstachainRequestHandler

#unique randomly generated alphanumeric string valid for the lifetime of the node + ledger
#used as a nonce for signing transactions to prevent cross-node relay attacks, has no cryptographic value 
NODE_ID = os.environ.get('NODE_ID')

DEPOSIT_WALLET_MASTER_PUBKEY = os.environ.get('DEPOSIT_WALLET_MASTER_PUBKEY')

#lower 32 bits are used to specify the asset
ASSET_BITCOIN = 1
ASSET_ETHEREUM = 2

ASSET_TESTNET_FLAG = (1 << 32) #bit 32 is the testnet flag
ASSET_STABLECOIN_FLAG = (1 << 33)

# variable that holds what asset the node supports
# For now, a node can support only 1 asset, though in the future, multi-asset nodes are possible
NODE_ASSET_ID = ASSET_BITCOIN|ASSET_TESTNET_FLAG

class getNodeInfo(InstachainRequestHandler):
    def processRequest(self):
        version = {'major_version': 1, 'minor_version': 0, 'patch_version': 0, 'API_version': 1}
        deposit_address_derivation_path = "pkh(" + DEPOSIT_WALLET_MASTER_PUBKEY + "/44/1/(i/2147483647)/(i%2147483647))"
        self.result = ErrorMessage.build_error_message(ErrorMessage.ERROR_SUCCESS)
        self.result['node_info'] = {'node_id': NODE_ID, 'node_name': 'Tesnet Node', 'asset_id': NODE_ASSET_ID, 'deposit_address_derivation_path': deposit_address_derivation_path, 'version': version}