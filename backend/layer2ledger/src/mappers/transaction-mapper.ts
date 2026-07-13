import type { GetTransactionsResponseTransaction } from '../api';
import type { TransactionRow } from '../db/schema';

export function mapTransactionRow(row: TransactionRow): GetTransactionsResponseTransaction {
  return {
    timestamp: row.timestamp?.toISOString(),
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
