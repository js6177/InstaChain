// Lower 32 bits specify the asset.
export const ASSET_BITCOIN = 1;
export const ASSET_ETHEREUM = 2;

export const ASSET_TESTNET_FLAG = 2 ** 31;
export const ASSET_STABLECOIN_FLAG = 2 ** 30;

/** Numeric asset id for the node (Bitcoin testnet). */
export const NODE_ASSET_ID = (ASSET_BITCOIN | ASSET_TESTNET_FLAG) >>> 0;

/** Hex asset id returned by node info */
export const NODE_ASSET_ID_HEX = `0x${NODE_ASSET_ID.toString(16)}`;

export const SATOSHI_PER_BITCOIN = 100_000_000;
