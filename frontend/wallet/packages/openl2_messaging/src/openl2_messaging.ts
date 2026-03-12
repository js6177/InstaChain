import { NODE_ASSET_ID } from './constants';

export const TransactionType = {
    TRX_TRANSFER: 1,  // layer2 transfer
    TRX_DEPOSIT: 2,  // when a user deposits btc to a deposit address, then funds get credited to his pubkey
    TRX_WITHDRAWAL_INITIATED: 3,  // when the user wants to withdraw to a btc address (locks that amount)
    TRX_WITHDRAWAL_BROADCASTED: 4, // when the transaction is broadcasted and in the mempool
    TRX_WITHDRAWAL_CANCELED: 5,  // when the transaction gets removed from the layer1 mempool for any reason
    TRX_WITHDRAWAL_CONFIRMED: 6,  // when the withdrawal gets confirmed in the layer1 chain
    INSTRUCTION_GET_DEPOSIT_ADDRESS: 7, // instruction to get a deposit address
    INSTRUCTION_LAYER1_AUDIT: 8, // instruction to perform a layer1 audit
} as const;

export type TransactionType = typeof TransactionType[keyof typeof TransactionType];

export function buildGetDepositAddressMessage(node_id: string, layer2_address_public_key: string, nonce: string): string {
    return `${node_id} ${NODE_ASSET_ID} ${TransactionType.INSTRUCTION_GET_DEPOSIT_ADDRESS} ${layer2_address_public_key} ${nonce}`;
}

export function buildDepositMessage(node_id: string, layer1_transaction_id: string, layer1_transaction_vout: number, layer1_address: string, amount: number, nonce: string): string {
    return `${node_id} ${TransactionType.TRX_DEPOSIT} ${layer1_transaction_id} ${layer1_transaction_vout} ${layer1_address} ${amount} ${nonce}`;
}

export function buildWithdrawalBroadcastedMessage(node_id: string, layer1_transaction_id: string, layer1_transaction_vout: number, layer1_address: string, amount: number, withdrawal_id: string): string {
    return `${node_id} ${TransactionType.TRX_WITHDRAWAL_BROADCASTED} ${layer1_transaction_id} ${layer1_transaction_vout} ${layer1_address} ${amount} ${withdrawal_id}`;
}

export function buildWithdrawalConfirmedMessage(node_id: string, layer1_transaction_id: string, layer1_transaction_vout: number, layer1_address: string, amount: number): string {
    return `${node_id} ${TransactionType.TRX_WITHDRAWAL_CONFIRMED} ${layer1_transaction_id} ${layer1_transaction_vout} ${layer1_address} ${amount}`;
}

export function buildLayer1AuditReportMessage(node_id: string, blockHeight: number, balance: number): string {
    return `${node_id} ${TransactionType.INSTRUCTION_LAYER1_AUDIT} ${blockHeight} ${balance}`;
}

export function buildTransferMessage(node_id: string, source_pubkey: string, destination_address_pubkey: string, amount: number, fee: number, nonce: string): string {
    return `${node_id} ${NODE_ASSET_ID} ${TransactionType.TRX_TRANSFER} ${source_pubkey} ${destination_address_pubkey} ${amount} ${fee} ${nonce}`;
}

export function buildWithdrawalRequestMessage(node_id: string, source_pubkey: string, withdrawal_address: string, nonce: string, amount: number): string {
    return `${node_id} ${NODE_ASSET_ID} ${TransactionType.TRX_WITHDRAWAL_INITIATED} ${source_pubkey} ${withdrawal_address} ${nonce} ${amount}`;
}
