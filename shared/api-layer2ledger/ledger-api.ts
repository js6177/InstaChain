import type {
	CommonResponse,
	DepositConfirmedRequest,
	DepositConfirmedResponse,
	GetBalanceRequest,
	GetBalanceResponse,
	GetDepositAddressRequest,
	GetDepositAddressResponse,
	GetFeeRequest,
	GetFeeResponse,
	GetNodeInfoResponse,
	GetProfilerSessionRequest,
	GetProfilerSessionResponse,
	GetTransactionRequest,
	GetTransactionResponse,
	GetTransactionsRequest,
	GetTransactionsResponse,
	GetWithdrawalRequestsRequest,
	GetWithdrawalRequestsResponse,
	ListGetBalanceStressHistoryRequest,
	ListGetBalanceStressHistoryResponse,
	PushTransactionRequest,
	RequestWithdrawalRequest,
	StartProfilerSessionRequest,
	StartProfilerSessionResponse,
	StopProfilerSessionRequest,
	StopProfilerSessionResponse,
	WithdrawalBroadcastedRequest,
	WithdrawalBroadcastedResponse,
	WithdrawalConfirmedRequest,
	WithdrawalConfirmedResponse,
} from "@openl2/layer2ledger/http-server-models";
import { type Layer2LedgerClient, unwrapLayer2LedgerResponse } from "./eden";

/**
 * Typed Eden wrappers. Response/request shapes come from TypeBox models on the
 * server (`*.static`) — do not redefine them here. Explicit generics keep the
 * client typed even when duplicate `elysia` installs break treaty inference.
 */

export async function getNodeInfo(
	client: Layer2LedgerClient,
): Promise<GetNodeInfoResponse> {
	return unwrapLayer2LedgerResponse<GetNodeInfoResponse>(
		await client.info.get_node_info.get(),
	);
}

export async function getBalance(
	client: Layer2LedgerClient,
	body: GetBalanceRequest,
): Promise<GetBalanceResponse> {
	return unwrapLayer2LedgerResponse<GetBalanceResponse>(
		await client.explorer.get_balance.post(body),
	);
}

export async function getTransaction(
	client: Layer2LedgerClient,
	body: GetTransactionRequest,
): Promise<GetTransactionResponse> {
	return unwrapLayer2LedgerResponse<GetTransactionResponse>(
		await client.explorer.get_transaction.post(body),
	);
}

export async function getAllTransactions(
	client: Layer2LedgerClient,
	body: GetTransactionsRequest,
): Promise<GetTransactionsResponse> {
	return unwrapLayer2LedgerResponse<GetTransactionsResponse>(
		await client.explorer.get_all_transactions.post(body),
	);
}

export async function getFee(
	client: Layer2LedgerClient,
	body: GetFeeRequest = {},
): Promise<GetFeeResponse> {
	return unwrapLayer2LedgerResponse<GetFeeResponse>(
		await client.explorer.get_fee.post(body),
	);
}

export async function getDepositAddress(
	client: Layer2LedgerClient,
	body: GetDepositAddressRequest,
): Promise<GetDepositAddressResponse> {
	return unwrapLayer2LedgerResponse<GetDepositAddressResponse>(
		await client.deposit.get_deposit_address.post(body),
	);
}

export async function depositConfirmed(
	client: Layer2LedgerClient,
	body: DepositConfirmedRequest,
): Promise<DepositConfirmedResponse> {
	return unwrapLayer2LedgerResponse<DepositConfirmedResponse>(
		await client.deposit.deposit_confirmed.post(body),
	);
}

export async function pushTransaction(
	client: Layer2LedgerClient,
	body: PushTransactionRequest,
): Promise<CommonResponse> {
	return unwrapLayer2LedgerResponse<CommonResponse>(
		await client.transfer.push_transaction.post(body),
	);
}

export async function requestWithdrawal(
	client: Layer2LedgerClient,
	body: RequestWithdrawalRequest,
): Promise<CommonResponse> {
	return unwrapLayer2LedgerResponse<CommonResponse>(
		await client.withdrawal.request_withdrawal.post(body),
	);
}

export async function getWithdrawalRequests(
	client: Layer2LedgerClient,
	body: GetWithdrawalRequestsRequest,
): Promise<GetWithdrawalRequestsResponse> {
	return unwrapLayer2LedgerResponse<GetWithdrawalRequestsResponse>(
		await client.withdrawal.get_withdrawal_requests.post(body),
	);
}

export async function withdrawalBroadcasted(
	client: Layer2LedgerClient,
	body: WithdrawalBroadcastedRequest,
): Promise<WithdrawalBroadcastedResponse> {
	return unwrapLayer2LedgerResponse<WithdrawalBroadcastedResponse>(
		await client.withdrawal.withdrawal_broadcasted.post(body),
	);
}

export async function withdrawalConfirmed(
	client: Layer2LedgerClient,
	body: WithdrawalConfirmedRequest,
): Promise<WithdrawalConfirmedResponse> {
	return unwrapLayer2LedgerResponse<WithdrawalConfirmedResponse>(
		await client.withdrawal.withdrawal_confirmed.post(body),
	);
}

export async function startProfilerSession(
	client: Layer2LedgerClient,
	body: StartProfilerSessionRequest,
): Promise<StartProfilerSessionResponse> {
	return unwrapLayer2LedgerResponse<StartProfilerSessionResponse>(
		await client.health.start_profiler_session.post(body),
	);
}

export async function stopProfilerSession(
	client: Layer2LedgerClient,
	body: StopProfilerSessionRequest,
): Promise<StopProfilerSessionResponse> {
	return unwrapLayer2LedgerResponse<StopProfilerSessionResponse>(
		await client.health.stop_profiler_session.post(body),
	);
}

export async function getProfilerSession(
	client: Layer2LedgerClient,
	body: GetProfilerSessionRequest,
): Promise<GetProfilerSessionResponse> {
	return unwrapLayer2LedgerResponse<GetProfilerSessionResponse>(
		await client.health.GetProfilerSession.post(body),
	);
}

export async function listGetBalanceStressHistory(
	client: Layer2LedgerClient,
	body: ListGetBalanceStressHistoryRequest = {},
): Promise<ListGetBalanceStressHistoryResponse> {
	return unwrapLayer2LedgerResponse<ListGetBalanceStressHistoryResponse>(
		await client.health.ListGetBalanceStressHistory.post(body),
	);
}
