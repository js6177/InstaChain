import { useQuery, useMutation } from '@tanstack/react-query';
import { getExplorer, getDeposit, getTransfer } from '@wallet/api-layer2ledger';

const explorerApi = getExplorer();
const depositApi = getDeposit();
const transferApi = getTransfer();

export const useAddressBalance = (publicKey: string) => {
    return useQuery({
        queryKey: ['AddressBalance', publicKey],
        queryFn: async () => {
            const res = await explorerApi.getBalanceExplorerGetBalancePost({ public_keys: [publicKey] });
            return res.balance?.[0] || null;
        },
        enabled: !!publicKey,
    });
};

export const useTransaction = (transactionId: string) => {
    return useQuery({
        queryKey: ['Transaction', transactionId],
        queryFn: async () => {
            const res = await explorerApi.getTransactionExplorerGetTransactionPost({ layer2_transaction_id: transactionId });
            return res;
        },
        enabled: !!transactionId,
    });
};

export const useTransactions = (publicKey: string) => {
    return useQuery({
        queryKey: ['Transactions', publicKey],
        queryFn: async () => {
            const res = await explorerApi.getAllTransactionsExplorerGetAllTransactionsPost({ public_keys: [publicKey] });
            return res;
        },
        enabled: !!publicKey,
    });
};

// Convert to mutation because getting deposit address requires signing a nonce
export const useDepositAddressMutation = () => {
    return useMutation({
        mutationFn: async (params: { layer2_address_pubkey: string, nonce: string, signature: string }) => {
            const res = await depositApi.getDepositAddressDepositGetDepositAddressPost(params);
            return res.layer1_deposit_address;
        }
    });
};

// Expose mutations if needed
export const useTransferMutation = () => {
    return useMutation({
        mutationFn: async (params: Parameters<typeof transferApi.createTransferTransferPushTransactionPost>[0]) => {
            return await transferApi.createTransferTransferPushTransactionPost(params);
        }
    });
};
