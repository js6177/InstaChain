import type {
	CommonResponse,
	GetBalanceResponseBalance,
	GetDepositAddressRequest,
	GetNodeInfoResponse,
	GetProfilerSessionResponse,
	GetTransactionResponse,
	GetTransactionsResponse,
	ListGetBalanceStressHistoryResponse,
	PushTransactionRequest,
	RequestWithdrawalRequest,
} from "@openl2/api-layer2ledger";
import {
	createLayer2LedgerClient,
	getAllTransactions,
	getBalance,
	getDepositAddress,
	getNodeInfo,
	getProfilerSession,
	getTransaction,
	listGetBalanceStressHistory,
	pushTransaction,
	requestWithdrawal,
} from "@openl2/api-layer2ledger";
import {
	type UseMutationResult,
	type UseQueryResult,
	useMutation,
	useQueries,
	useQuery,
} from "@tanstack/react-query";
import { LAYER2_LEDGER_API_URL } from "../config";

const ledgerApi = createLayer2LedgerClient(LAYER2_LEDGER_API_URL);

export function useAddressBalance(
	layer2AddressPublicKey: string,
): UseQueryResult<GetBalanceResponseBalance | null, Error> {
	return useQuery({
		queryKey: ["AddressBalance", layer2AddressPublicKey],
		queryFn: async (): Promise<GetBalanceResponseBalance | null> => {
			const res = await getBalance(ledgerApi, {
				public_keys: [layer2AddressPublicKey],
			});
			return res.balance?.[0] || null;
		},
		enabled: !!layer2AddressPublicKey,
	});
}

export function useTransaction(
	layer2TransactionId: string,
): UseQueryResult<GetTransactionResponse, Error> {
	return useQuery({
		queryKey: ["Transaction", layer2TransactionId],
		queryFn: async (): Promise<GetTransactionResponse> => {
			return getTransaction(ledgerApi, {
				layer2_transaction_id: layer2TransactionId,
			});
		},
		enabled: !!layer2TransactionId,
	});
}

export function useTransactions(
	layer2AddressPublicKey: string,
): UseQueryResult<GetTransactionsResponse, Error> {
	return useQuery({
		queryKey: ["Transactions", layer2AddressPublicKey],
		queryFn: async (): Promise<GetTransactionsResponse> => {
			return getAllTransactions(ledgerApi, {
				public_keys: [layer2AddressPublicKey],
			});
		},
		enabled: !!layer2AddressPublicKey,
	});
}

export function useNodeInfo(): UseQueryResult<GetNodeInfoResponse, Error> {
	return useQuery({
		queryKey: ["NodeInfo"],
		queryFn: async (): Promise<GetNodeInfoResponse> => {
			return getNodeInfo(ledgerApi);
		},
	});
}

export function useDepositAddressMutation(): UseMutationResult<
	string | null,
	Error,
	GetDepositAddressRequest
> {
	return useMutation({
		mutationFn: async (
			params: GetDepositAddressRequest,
		): Promise<string | null> => {
			const res = await getDepositAddress(ledgerApi, params);
			return res.layer1_deposit_address ?? null;
		},
	});
}

export function useTransferMutation(): UseMutationResult<
	CommonResponse,
	Error,
	PushTransactionRequest
> {
	return useMutation({
		mutationFn: async (
			params: PushTransactionRequest,
		): Promise<CommonResponse> => {
			return pushTransaction(ledgerApi, params);
		},
	});
}

export function useWithdrawMutation(): UseMutationResult<
	CommonResponse,
	Error,
	RequestWithdrawalRequest
> {
	return useMutation({
		mutationFn: async (
			params: RequestWithdrawalRequest,
		): Promise<CommonResponse> => {
			return requestWithdrawal(ledgerApi, params);
		},
	});
}

export function useProfilerSession(
	sessionId: string,
): UseQueryResult<GetProfilerSessionResponse, Error> {
	return useQuery({
		queryKey: ["ProfilerSession", sessionId],
		queryFn: async (): Promise<GetProfilerSessionResponse> => {
			return getProfilerSession(ledgerApi, { session_id: sessionId });
		},
		enabled: !!sessionId,
	});
}

export function useGetBalanceStressHistory(): UseQueryResult<
	ListGetBalanceStressHistoryResponse,
	Error
> {
	return useQuery({
		queryKey: ["GetBalanceStressHistory"],
		queryFn: async (): Promise<ListGetBalanceStressHistoryResponse> => {
			return listGetBalanceStressHistory(ledgerApi);
		},
	});
}

/** Load many profiler sessions (e.g. a getBalance stress matrix batch). */
export function useProfilerSessions(
	sessionIds: readonly string[],
): UseQueryResult<GetProfilerSessionResponse, Error>[] {
	return useQueries({
		queries: sessionIds.map((sessionId) => ({
			queryKey: ["ProfilerSession", sessionId],
			queryFn: async (): Promise<GetProfilerSessionResponse> => {
				return getProfilerSession(ledgerApi, { session_id: sessionId });
			},
			enabled: sessionId.length > 0,
		})),
	});
}
