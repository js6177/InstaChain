export const TransactionType = {
	TRX_TRANSFER: 1,
	TRX_DEPOSIT: 2,
	TRX_WITHDRAWAL_INITIATED: 3,
	TRX_WITHDRAWAL_BROADCASTED: 4,
	TRX_WITHDRAWAL_CANCELED: 5,
	TRX_WITHDRAWAL_CONFIRMED: 6,
	INSTRUCTION_GET_DEPOSIT_ADDRESS: 7,
	INSTRUCTION_LAYER1_AUDIT: 8,
} as const;

export type TransactionType =
	(typeof TransactionType)[keyof typeof TransactionType];

export function buildGetDepositAddressMessage(
	nodeId: string,
	nodeAssetId: string,
	layer2AddressPublicKey: string,
	nonce: string,
): string {
	return `${nodeId} ${nodeAssetId} ${TransactionType.INSTRUCTION_GET_DEPOSIT_ADDRESS} ${layer2AddressPublicKey} ${nonce}`;
}

export function buildDepositMessage(
	nodeId: string,
	layer1TransactionId: string,
	layer1TransactionVout: number,
	layer1Address: string,
	amount: number,
	nonce: string,
): string {
	return `${nodeId} ${TransactionType.TRX_DEPOSIT} ${layer1TransactionId} ${layer1TransactionVout} ${layer1Address} ${amount} ${nonce}`;
}

export function buildTransferMessage(
	nodeId: string,
	nodeAssetId: string,
	sourcePubkey: string,
	destinationAddressPubkey: string,
	amount: number,
	fee: number,
	nonce: string,
): string {
	return `${nodeId} ${nodeAssetId} ${TransactionType.TRX_TRANSFER} ${sourcePubkey} ${destinationAddressPubkey} ${amount} ${fee} ${nonce}`;
}

export function buildWithdrawalRequestMessage(
	nodeId: string,
	nodeAssetId: string,
	sourcePubkey: string,
	withdrawalAddress: string,
	nonce: string,
	amount: number,
): string {
	return `${nodeId} ${nodeAssetId} ${TransactionType.TRX_WITHDRAWAL_INITIATED} ${sourcePubkey} ${withdrawalAddress} ${nonce} ${amount}`;
}

export function buildWithdrawalBroadcastedMessage(
	nodeId: string,
	layer1TransactionId: string,
	layer1TransactionVout: number,
	layer1Address: string,
	amount: number,
	withdrawalId: string,
): string {
	return `${nodeId} ${TransactionType.TRX_WITHDRAWAL_BROADCASTED} ${layer1TransactionId} ${layer1TransactionVout} ${layer1Address} ${amount} ${withdrawalId}`;
}

export function buildWithdrawalConfirmedMessage(
	nodeId: string,
	layer1TransactionId: string,
	layer1TransactionVout: number,
	layer1Address: string,
	amount: number,
): string {
	return `${nodeId} ${TransactionType.TRX_WITHDRAWAL_CONFIRMED} ${layer1TransactionId} ${layer1TransactionVout} ${layer1Address} ${amount}`;
}

export function buildLayer1AuditReportMessage(
	nodeId: string,
	blockHeight: number,
	balance: number,
): string {
	return `${nodeId} ${TransactionType.INSTRUCTION_LAYER1_AUDIT} ${blockHeight} ${balance}`;
}
