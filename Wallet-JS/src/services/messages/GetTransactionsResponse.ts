import CommonResponse from './CommonResponse';

interface GetTransactionsResponseTransaction {
  amount: number;
  destination_address_pubkey: string;
  fee: number;
  layer1_transaction_id: string | null;
  layer2_withdrawal_id: string | null;
  signature: string;
  signature_date: string | null;
  source_address_pubkey: string;
  timestamp: number;
  transaction_id: string;
  transaction_type: number;
}

interface TransactionGroup {
  public_key: string;
  transactions: GetTransactionsResponseTransaction[];
}

interface GetTransactionsResponse extends CommonResponse{
  transactions: TransactionGroup[];
}

export { GetTransactionsResponse, TransactionGroup, GetTransactionsResponseTransaction};
