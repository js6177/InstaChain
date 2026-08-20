import { t } from "elysia";

export const PushTransactionRequest = t.Object({
	amount: t.Number(),
	destination_address_public_key: t.String(),
	fee: t.Number(),
	signature: t.String(),
	source_address_public_key: t.String(),
	transaction_id: t.String(),
});

export const GetDepositAddressRequest = t.Object({
	layer2_address_pubkey: t.String(),
	nonce: t.String(),
	signature: t.String(),
});

export const DepositsConfirmed = t.Object({
	layer1_transaction_id: t.String(),
	layer1_transaction_vout: t.Number(),
	layer1_address: t.String(),
	amount: t.Number(),
	nonce: t.String(),
	signature: t.String(),
});

export const DepositConfirmedRequest = t.Object({
	transactions: t.Array(DepositsConfirmed),
});

export const RequestWithdrawalRequest = t.Object({
	amount: t.Number(),
	layer1_withdrawal_address: t.String(),
	layer2_transaction_id: t.String(),
	signature: t.String(),
	source_address_public_key: t.String(),
});

export const GetWithdrawalRequestsRequest = t.Object({
	latest_timestamp: t.Number(),
});

export const Layer1BroadcastedWithdrawalTransaction = t.Object({
	layer1_transaction_id: t.String(),
	layer1_transaction_vout: t.Number(),
	layer1_address: t.String(),
	amount: t.Number(),
	layer2_withdrawal_id: t.String(),
	signature: t.String(),
});

export const WithdrawalBroadcastedRequest = t.Object({
	transactions: t.Array(Layer1BroadcastedWithdrawalTransaction),
});

export const Layer1WithdrawalConfirmedTransaction = t.Object({
	layer1_transaction_id: t.String(),
	layer1_transaction_vout: t.Number(),
	layer1_address: t.String(),
	amount: t.Number(),
	signature: t.String(),
});

export const WithdrawalConfirmedRequest = t.Object({
	transactions: t.Array(Layer1WithdrawalConfirmedTransaction),
});

export const GetBalanceRequest = t.Object({
	public_keys: t.Array(t.String()),
});

export const GetTransactionRequest = t.Object({
	layer2_transaction_id: t.String(),
});

export const GetTransactionsRequest = t.Object({
	public_keys: t.Array(t.String()),
});

export const GetFeeRequest = t.Object({});

export const StartProfilerSessionRequest = t.Object({
	session_id: t.String({ minLength: 1 }),
	apis: t.Array(t.String({ minLength: 1 }), { minItems: 1 }),
	/** Display name shown in explorer profiler visualization. */
	title: t.String({ minLength: 1 }),
	/** Free-form details shown with the visualization (e.g. stress env vars). */
	description: t.String(),
});

export const StopProfilerSessionRequest = t.Object({
	session_id: t.String({ minLength: 1 }),
});

export const GetProfilerSessionRequest = t.Object({
	session_id: t.String({ minLength: 1 }),
});

/** Empty body — lists recent getBalance stress history entries. */
export const ListGetBalanceStressHistoryRequest = t.Object({});

export type PushTransactionRequest = typeof PushTransactionRequest.static;
export type StartProfilerSessionRequest =
	typeof StartProfilerSessionRequest.static;
export type StopProfilerSessionRequest = typeof StopProfilerSessionRequest.static;
export type GetProfilerSessionRequest = typeof GetProfilerSessionRequest.static;
export type ListGetBalanceStressHistoryRequest =
	typeof ListGetBalanceStressHistoryRequest.static;
export type GetDepositAddressRequest = typeof GetDepositAddressRequest.static;
export type DepositsConfirmed = typeof DepositsConfirmed.static;
export type DepositConfirmedRequest = typeof DepositConfirmedRequest.static;
export type RequestWithdrawalRequest = typeof RequestWithdrawalRequest.static;
export type GetWithdrawalRequestsRequest =
	typeof GetWithdrawalRequestsRequest.static;
export type Layer1BroadcastedWithdrawalTransaction =
	typeof Layer1BroadcastedWithdrawalTransaction.static;
export type WithdrawalBroadcastedRequest =
	typeof WithdrawalBroadcastedRequest.static;
export type Layer1WithdrawalConfirmedTransaction =
	typeof Layer1WithdrawalConfirmedTransaction.static;
export type WithdrawalConfirmedRequest =
	typeof WithdrawalConfirmedRequest.static;
export type GetBalanceRequest = typeof GetBalanceRequest.static;
export type GetTransactionRequest = typeof GetTransactionRequest.static;
export type GetTransactionsRequest = typeof GetTransactionsRequest.static;
export type GetFeeRequest = typeof GetFeeRequest.static;
