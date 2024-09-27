interface RequestWithdrawalRequest {
    amount: number;
    source_address_public_key: string;
    layer1_withdrawal_address: string;
    nonce: string;
    signature: string;
}

export default RequestWithdrawalRequest;