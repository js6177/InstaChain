interface PushTransactionRequest {
    amount: number;
    fee: number;
    source_address_public_key: string;
    destination_address_public_key: string;
    transaction_id: string;
    signature: string;
}

export default PushTransactionRequest;