import { useQuery, useMutation } from '@tanstack/react-query';
import {
  createLayer2LedgerClient,
  unwrapLayer2LedgerResponse,
  type GetDepositAddressRequest,
  type PushTransactionRequest,
  type RequestWithdrawalRequest,
} from '@openl2/api-layer2ledger';
import { LAYER2_LEDGER_API_URL } from '../config';

const ledgerApi = createLayer2LedgerClient(LAYER2_LEDGER_API_URL);

export const useAddressBalance = (publicKey: string) => {
    return useQuery({
        queryKey: ['AddressBalance', publicKey],
        queryFn: async () => {
            const res = unwrapLayer2LedgerResponse(
              await ledgerApi.explorer.get_balance.post({ public_keys: [publicKey] }),
            );
            return res.balance?.[0] || null;
        },
        enabled: !!publicKey,
    });
};

export const useTransaction = (transactionId: string) => {
    return useQuery({
        queryKey: ['Transaction', transactionId],
        queryFn: async () => {
            return unwrapLayer2LedgerResponse(
              await ledgerApi.explorer.get_transaction.post({
                layer2_transaction_id: transactionId,
              }),
            );
        },
        enabled: !!transactionId,
    });
};

export const useTransactions = (publicKey: string) => {
    return useQuery({
        queryKey: ['Transactions', publicKey],
        queryFn: async () => {
            return unwrapLayer2LedgerResponse(
              await ledgerApi.explorer.get_all_transactions.post({ public_keys: [publicKey] }),
            );
        },
        enabled: !!publicKey,
    });
};

export const useNodeInfo = () => {
    return useQuery({
        queryKey: ['NodeInfo'],
        queryFn: async () => {
            return unwrapLayer2LedgerResponse(await ledgerApi.info.get_node_info.get());
        }
    });
};

export const useDepositAddressMutation = () => {
    return useMutation({
        mutationFn: async (params: GetDepositAddressRequest) => {
            const res = unwrapLayer2LedgerResponse(
              await ledgerApi.deposit.get_deposit_address.post(params),
            );
            return res.layer1_deposit_address;
        }
    });
};

export const useTransferMutation = () => {
    return useMutation({
        mutationFn: async (params: PushTransactionRequest) => {
            return unwrapLayer2LedgerResponse(
              await ledgerApi.transfer.push_transaction.post(params),
            );
        }
    });
};

export const useWithdrawMutation = () => {
    return useMutation({
        mutationFn: async (params: RequestWithdrawalRequest) => {
            return unwrapLayer2LedgerResponse(
              await ledgerApi.withdrawal.request_withdrawal.post(params),
            );
        }
    });
};
