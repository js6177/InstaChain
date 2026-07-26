import type { ConfirmedTransactionCategoryValue } from "../db/schema";

export function buildConfirmedTransactionKey(
	transactionId: string,
	transactionVout: number,
	category: ConfirmedTransactionCategoryValue | string,
): string {
	return `${transactionId}:${transactionVout}:${category}`;
}
