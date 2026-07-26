/** Keys stored in the bridge `KeyValue` table. */
export const BridgeKeyValueKey = {
	LAST_CONFIRMED_BLOCK_HASH: "lastConfirmedBlockHash",
	LAST_WITHDRAWAL_TIMESTAMP: "lastwithdrawalTimestamp",
	LAST_BROADCAST_BLOCK_HEIGHT: "lastBroadcastBlockHeight",
	BROADCAST_TRANSACTION_BLOCK_DELAY: "broadcastTransactionBlockDelay",
} as const;

export type BridgeKeyValueKeyName =
	(typeof BridgeKeyValueKey)[keyof typeof BridgeKeyValueKey];
