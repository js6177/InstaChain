export function buildLayer1TransactionId(
	layer1TransactionId: string,
	layer1TransactionVout: number,
): string {
	return `${layer1TransactionId}:${layer1TransactionVout}`;
}

export function buildLayer2WithdrawalId(layer2TransactionId: string): string {
	return `w_${layer2TransactionId}`;
}
