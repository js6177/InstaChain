import { t } from "elysia";
import { CommonResponse } from "./common";

export const GetDepositAddressResponse = t.Composite([
	CommonResponse,
	t.Object({
		layer1_deposit_address: t.Optional(t.Nullable(t.String())),
	}),
]);

export const Layer1TransactionIdStatus = t.Object({
	layer1_transaction_id: t.String(),
	layer1_transaction_vout: t.Number(),
	error_code: t.Number(),
	error_message: t.String(),
});

export const DepositConfirmedResponse = t.Composite([
	CommonResponse,
	t.Object({
		transactions: t.Optional(t.Array(Layer1TransactionIdStatus)),
	}),
]);

export const WithdrawalRequest = t.Object({
	layer1_address: t.String(),
	layer1_transaction_id: t.Nullable(t.String()),
	status: t.Number(),
	amount: t.Number(),
	layer2_withdrawal_id: t.String(),
	server_signature: t.Nullable(t.String()),
	layer2_transaction_id: t.String(),
	withdrawal_requested_timestamp: t.Number(),
	withdrawal_requested_timestamp_str: t.Nullable(t.String()),
});

export const GetWithdrawalRequestsResponse = t.Composite([
	CommonResponse,
	t.Object({
		withdrawal_requests: t.Optional(t.Array(WithdrawalRequest)),
	}),
]);

export const Layer1BroadcastedWithdrawalTransactionStatus = t.Object({
	layer2_withdrawal_id: t.String(),
	error_code: t.Number(),
	error_message: t.String(),
});

export const WithdrawalBroadcastedResponse = t.Composite([
	CommonResponse,
	t.Object({
		transactions: t.Optional(
			t.Array(Layer1BroadcastedWithdrawalTransactionStatus),
		),
	}),
]);

export const Layer1WithdrawalConfirmedTransactionStatus = t.Object({
	layer1_transaction_id: t.String(),
	layer1_transaction_vout: t.Number(),
	error_code: t.Number(),
	error_message: t.String(),
});

export const WithdrawalConfirmedResponse = t.Composite([
	CommonResponse,
	t.Object({
		transactions: t.Optional(
			t.Array(Layer1WithdrawalConfirmedTransactionStatus),
		),
	}),
]);

export const GetBalanceResponseBalance = t.Object({
	public_key: t.String(),
	balance: t.Number(),
	address_found: t.Boolean(),
});

export const GetBalanceResponse = t.Composite([
	CommonResponse,
	t.Object({
		balance: t.Optional(t.Array(GetBalanceResponseBalance)),
	}),
]);

export const GetTransactionsResponseTransaction = t.Object({
	timestamp: t.Optional(t.String()),
	amount: t.Number(),
	fee: t.Number(),
	source_address_pubkey: t.String(),
	destination_address_pubkey: t.String(),
	transaction_type: t.Number(),
	layer2_transaction_id: t.String(),
	signature: t.String(),
	signature_date: t.Number(),
	layer1_transaction_id: t.String(),
	layer2_withdrawal_id: t.String(),
	batch_height: t.Number(),
});

export const TransactionGroup = t.Object({
	public_key: t.String(),
	transactions: t.Array(GetTransactionsResponseTransaction),
});

export const GetTransactionsResponse = t.Composite([
	CommonResponse,
	t.Object({
		transaction_groups: t.Optional(t.Array(TransactionGroup)),
	}),
]);

export const GetTransactionResponse = t.Composite([
	CommonResponse,
	t.Object({
		transaction: t.Optional(t.Nullable(GetTransactionsResponseTransaction)),
		transaction_id: t.Optional(t.String()),
	}),
]);

export const GetFeeResponse = t.Composite([
	CommonResponse,
	t.Object({
		fee: t.Optional(t.Number()),
	}),
]);

export const Version = t.Object({
	API_version: t.Number(),
	major_version: t.Number(),
	minor_version: t.Number(),
	patch_version: t.Number(),
});

export const Layer1NetworkInfo = t.Object({
	minimum_transaction_amount: t.Number(),
});

export const NodeInfo = t.Object({
	asset_id: t.String(),
	deposit_address_derivation_path: t.String(),
	layer1_network_info: Layer1NetworkInfo,
	node_id: t.String(),
	node_name: t.String(),
	onboarding_deposit_signing_key_pubkey: t.String(),
	version: Version,
});

export const GetNodeInfoResponse = t.Composite([
	CommonResponse,
	t.Object({
		node_info: NodeInfo,
	}),
]);

export const ProfilerApiStatsResponse = t.Object({
	api: t.String(),
	count: t.Number(),
	throughput_per_sec: t.Number(),
	peak_concurrent: t.Number(),
	avg_latency_ms: t.Number(),
	mean_latency_ms: t.Number(),
	min_latency_ms: t.Number(),
	max_latency_ms: t.Number(),
	first_start_unix_ms: t.Nullable(t.Number()),
	last_end_unix_ms: t.Nullable(t.Number()),
});

export const ProfilerDbwriterStatsResponse = t.Object({
	writes_total: t.Number(),
	batches: t.Number(),
	queue_empty_at_unix_ms: t.Nullable(t.Number()),
	/** Ms since profiler start: first incoming API call for total txs/s. */
	throughput_start_ms: t.Nullable(t.Number()),
	/** Ms since profiler start: last pending-queue empty for total txs/s. */
	throughput_end_ms: t.Nullable(t.Number()),
	throughput_per_sec: t.Nullable(t.Number()),
});

export const ProfilerTimeseriesPointResponse = t.Object({
	t_ms: t.Number(),
	value: t.Number(),
});

export const ProfilerPushTransactionSectionAvgResponse = t.Object({
	validate: t.Array(ProfilerTimeseriesPointResponse),
	verify_signature: t.Array(ProfilerTimeseriesPointResponse),
	acquire_lock: t.Array(ProfilerTimeseriesPointResponse),
	duplicate_check: t.Array(ProfilerTimeseriesPointResponse),
	get_balance: t.Array(ProfilerTimeseriesPointResponse),
	enqueue: t.Array(ProfilerTimeseriesPointResponse),
});

export const ProfilerSessionTimeseriesResponse = t.Object({
	avg_replica_concurrent: t.Array(ProfilerTimeseriesPointResponse),
	push_transaction_entries_cumulative: t.Array(
		ProfilerTimeseriesPointResponse,
	),
	push_transaction_exits_cumulative: t.Array(ProfilerTimeseriesPointResponse),
	dbwriter_writes_cumulative: t.Array(ProfilerTimeseriesPointResponse),
	dbwriter_queue_depth: t.Array(ProfilerTimeseriesPointResponse),
	dbwriter_write_active: t.Array(ProfilerTimeseriesPointResponse),
	dbwriter_sleep_active: t.Array(ProfilerTimeseriesPointResponse),
	dbwriter_redis_active: t.Array(ProfilerTimeseriesPointResponse),
	push_transaction_section_avg_ms: ProfilerPushTransactionSectionAvgResponse,
});

export const ProfilerSessionReportResponse = t.Object({
	session_id: t.String(),
	title: t.String(),
	description: t.String(),
	apis: t.Array(t.String()),
	started_at_unix_ms: t.Number(),
	ended_at_unix_ms: t.Number(),
	api_stats: t.Array(ProfilerApiStatsResponse),
	dbwriter: t.Nullable(ProfilerDbwriterStatsResponse),
	timeseries: ProfilerSessionTimeseriesResponse,
	output_file: t.Nullable(t.String()),
});

export const StartProfilerSessionResponse = t.Composite([
	CommonResponse,
	t.Object({
		session_id: t.Optional(t.String()),
		title: t.Optional(t.String()),
		description: t.Optional(t.String()),
		apis: t.Optional(t.Array(t.String())),
		started_at_unix_ms: t.Optional(t.Number()),
	}),
]);

export const StopProfilerSessionResponse = t.Composite([
	CommonResponse,
	t.Object({
		session: t.Optional(ProfilerSessionReportResponse),
	}),
]);

export const GetProfilerSessionResponse = t.Composite([
	CommonResponse,
	t.Object({
		session: t.Optional(ProfilerSessionReportResponse),
	}),
]);

export type GetDepositAddressResponse = typeof GetDepositAddressResponse.static;
export type Layer1TransactionIdStatus = typeof Layer1TransactionIdStatus.static;
export type DepositConfirmedResponse = typeof DepositConfirmedResponse.static;
export type WithdrawalRequest = typeof WithdrawalRequest.static;
export type GetWithdrawalRequestsResponse =
	typeof GetWithdrawalRequestsResponse.static;
export type Layer1BroadcastedWithdrawalTransactionStatus =
	typeof Layer1BroadcastedWithdrawalTransactionStatus.static;
export type WithdrawalBroadcastedResponse =
	typeof WithdrawalBroadcastedResponse.static;
export type Layer1WithdrawalConfirmedTransactionStatus =
	typeof Layer1WithdrawalConfirmedTransactionStatus.static;
export type WithdrawalConfirmedResponse =
	typeof WithdrawalConfirmedResponse.static;
export type GetBalanceResponseBalance = typeof GetBalanceResponseBalance.static;
export type GetBalanceResponse = typeof GetBalanceResponse.static;
export type GetTransactionsResponseTransaction =
	typeof GetTransactionsResponseTransaction.static;
export type TransactionGroup = typeof TransactionGroup.static;
export type GetTransactionsResponse = typeof GetTransactionsResponse.static;
export type GetTransactionResponse = typeof GetTransactionResponse.static;
export type GetFeeResponse = typeof GetFeeResponse.static;
export type NodeInfo = typeof NodeInfo.static;
export type GetNodeInfoResponse = typeof GetNodeInfoResponse.static;
export type ProfilerApiStatsResponse = typeof ProfilerApiStatsResponse.static;
export type ProfilerDbwriterStatsResponse =
	typeof ProfilerDbwriterStatsResponse.static;
export type ProfilerSessionReportResponse =
	typeof ProfilerSessionReportResponse.static;
export type StartProfilerSessionResponse =
	typeof StartProfilerSessionResponse.static;
export type StopProfilerSessionResponse =
	typeof StopProfilerSessionResponse.static;
export type ProfilerTimeseriesPointResponse =
	typeof ProfilerTimeseriesPointResponse.static;
export type ProfilerSessionTimeseriesResponse =
	typeof ProfilerSessionTimeseriesResponse.static;
export type GetProfilerSessionResponse =
	typeof GetProfilerSessionResponse.static;
