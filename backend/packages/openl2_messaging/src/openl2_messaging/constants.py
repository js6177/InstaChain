#lower 32 bits are used to specify the asset
ASSET_BITCOIN = 1
ASSET_ETHEREUM = 2

ASSET_TESTNET_FLAG = (1 << 32) #bit 32 is the testnet flag
ASSET_STABLECOIN_FLAG = (1 << 33)
# variable that holds what asset the node supports
# For now, a node can support only 1 asset, though in the future, multi-asset nodes are possible
NODE_ASSET_ID = ASSET_BITCOIN|ASSET_TESTNET_FLAG