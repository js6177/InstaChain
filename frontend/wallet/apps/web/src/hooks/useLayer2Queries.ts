import {
	createLayer2LedgerClient,
	unwrapLayer2LedgerResponse,
} from "@openl2/api-layer2ledger";
import { useMutation, useQueries, useQuery } from "@tanstack/react-query";
import { LAYER2_LEDGER_API_URL } from "../config";

const ledgerApi = createLayer2LedgerClient(LAYER2_LEDGER_API_URL);

export const useAddressBalance = (layer2AddressPublicKey: string) => {
	return useQuery({
		queryKey: ["AddressBalance", layer2AddressPublicKey],
		queryFn: async () => {
			const res = unwrapLayer2LedgerResponse(
				await ledgerApi.explorer.get_balance.post({
					public_keys: [layer2AddressPublicKey],
				}),
			);
			return res.balance?.[0] || null;
		},
		enabled: !!layer2AddressPublicKey,
	});
};

export const useTransaction = (layer2TransactionId: string) => {
	return useQuery({
		queryKey: ["Transaction", layer2TransactionId],
		queryFn: async () => {
			return unwrapLayer2LedgerResponse(
				await ledgerApi.explorer.get_transaction.post({
					layer2_transaction_id: layer2TransactionId,
				}),
			);
		},
		enabled: !!layer2TransactionId,
	});
};

export const useTransactions = (layer2AddressPublicKey: string) => {
	return useQuery({
		queryKey: ["Transactions", layer2AddressPublicKey],
		queryFn: async () => {
			return unwrapLayer2LedgerResponse(
				await ledgerApi.explorer.get_all_transactions.post({
					public_keys: [layer2AddressPublicKey],
				}),
			);
		},
		enabled: !!layer2AddressPublicKey,
	});
};

export const useNodeInfo = () => {
	return useQuery({
		queryKey: ["NodeInfo"],
		queryFn: async () => {
			return unwrapLayer2LedgerResponse(
				await ledgerApi.info.get_node_info.get(),
			);
		},
	});
};

export const useDepositAddressMutation = () => {
	return useMutation({
		mutationFn: async (
			params: Parameters<typeof ledgerApi.deposit.get_deposit_address.post>[0],
		) => {
			const res = unwrapLayer2LedgerResponse(
				await ledgerApi.deposit.get_deposit_address.post(params),
			);
			return res.layer1_deposit_address;
		},
	});
};

export const useTransferMutation = () => {
	return useMutation({
		mutationFn: async (
			params: Parameters<typeof ledgerApi.transfer.push_transaction.post>[0],
		) => {
			return unwrapLayer2LedgerResponse(
				await ledgerApi.transfer.push_transaction.post(params),
			);
		},
	});
};

export const useWithdrawMutation = () => {
	return useMutation({
		mutationFn: async (
			params: Parameters<
				typeof ledgerApi.withdrawal.request_withdrawal.post
			>[0],
		) => {
			return unwrapLayer2LedgerResponse(
				await ledgerApi.withdrawal.request_withdrawal.post(params),
			);
		},
	});
};

export const useProfilerSession = (sessionId: string) => {
	return useQuery({
		queryKey: ["ProfilerSession", sessionId],
		queryFn: async () => {
			return unwrapLayer2LedgerResponse(
				await ledgerApi.health.GetProfilerSession.post({
					session_id: sessionId,
				}),
			);
		},
		enabled: !!sessionId,
	});
};

/** Load many profiler sessions (e.g. a getBalance stress matrix batch). */
export const useProfilerSessions = (sessionIds: readonly string[]) => {
	return useQueries({
		queries: sessionIds.map((sessionId) => ({
			queryKey: ["ProfilerSession", sessionId],
			queryFn: async () => {
				return unwrapLayer2LedgerResponse(
					await ledgerApi.health.GetProfilerSession.post({
						session_id: sessionId,
					}),
				);
			},
			enabled: sessionId.length > 0,
		})),
	});
};
