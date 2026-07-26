import type { TransactionInsert, TransactionRow } from "../db/schema";
import { TransactionType } from "../db/schema";

export const PENDING_TRANSACTIONS_LIST_KEY = "PendingTransactions";
export const PENDING_WITHDRAWALS_LIST_KEY = "PendingWithdrawals";

export interface RedisTransaction {
	timestamp: string;
	amount: number;
	fee: number;
	source_address_pubkey: string;
	destination_address_pubkey: string;
	transaction_type: number;
	layer2_transaction_id: string;
	signature: string;
	signature_date: number;
	layer1_transaction_id: string;
	layer2_withdrawal_id: string;
	batch_height: number;
}

export interface PendingTransaction {
	transaction: RedisTransaction;
	lock_token: string | null;
	addresses_locked: string[];
}

export interface RedisWithdrawalRequest {
	layer1_address: string;
	layer1_transaction_id: string | null;
	status: number;
	amount: number;
	layer2_withdrawal_id: string;
	server_signature: string | null;
	layer2_transaction_id: string;
	withdrawal_requested_timestamp: number;
	withdrawal_requested_timestamp_str: string;
	batch_height: number;
}

export interface PendingWithdrawal {
	transaction: RedisTransaction;
	withdrawal_request: RedisWithdrawalRequest;
	lock_token: string | null;
	addresses_locked: string[];
}

export function transactionRowToRedis(row: TransactionRow): RedisTransaction {
	return {
		timestamp: row.timestamp?.toISOString() ?? new Date().toISOString(),
		amount: row.amount,
		fee: row.fee,
		source_address_pubkey: row.sourceAddressPubkey,
		destination_address_pubkey: row.destinationAddressPubkey,
		transaction_type: row.transactionType,
		layer2_transaction_id: row.layer2TransactionId,
		signature: row.signature,
		signature_date: row.signatureDate,
		layer1_transaction_id: row.layer1TransactionId,
		layer2_withdrawal_id: row.layer2WithdrawalId,
		batch_height: row.batchHeight,
	};
}

export function redisTransactionToInsert(
	tx: RedisTransaction,
): TransactionInsert {
	return {
		amount: tx.amount,
		fee: tx.fee,
		sourceAddressPubkey: tx.source_address_pubkey,
		destinationAddressPubkey: tx.destination_address_pubkey,
		transactionType: tx.transaction_type,
		layer2TransactionId: tx.layer2_transaction_id,
		signature: tx.signature,
		signatureDate: tx.signature_date,
		layer1TransactionId: tx.layer1_transaction_id,
		layer2WithdrawalId: tx.layer2_withdrawal_id,
		batchHeight: tx.batch_height,
	};
}

export function createRedisTransaction(
	partial: Partial<RedisTransaction> &
		Pick<
			RedisTransaction,
			| "amount"
			| "fee"
			| "source_address_pubkey"
			| "destination_address_pubkey"
			| "transaction_type"
			| "layer2_transaction_id"
			| "signature"
		>,
): RedisTransaction {
	return {
		timestamp: new Date().toISOString(),
		signature_date: 0,
		layer1_transaction_id: "",
		layer2_withdrawal_id: "",
		batch_height: 0,
		...partial,
	};
}

export function createTransferRedisTransaction(params: {
	amount: number;
	fee: number;
	sourceAddressPubkey: string;
	destinationAddressPubkey: string;
	layer2TransactionId: string;
	signature: string;
}): RedisTransaction {
	return createRedisTransaction({
		amount: params.amount,
		fee: params.fee,
		source_address_pubkey: params.sourceAddressPubkey,
		destination_address_pubkey: params.destinationAddressPubkey,
		transaction_type: TransactionType.TRX_TRANSFER,
		layer2_transaction_id: params.layer2TransactionId,
		signature: params.signature,
	});
}
