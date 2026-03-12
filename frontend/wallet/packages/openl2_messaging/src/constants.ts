// lower 32 bits are used to specify the asset
export const ASSET_BITCOIN = 1;
export const ASSET_ETHEREUM = 2;

export const ASSET_TESTNET_FLAG = Math.pow(2, 32); // 4294967296
export const ASSET_STABLECOIN_FLAG = Math.pow(2, 33); // 8589934592

// variable that holds what asset the node supports
// For now, a node can support only 1 asset, though in the future, multi-asset nodes are possible
export const NODE_ASSET_ID = ASSET_BITCOIN | ASSET_TESTNET_FLAG;

export const SATOSHI_PER_BITCOIN = 100000000;
