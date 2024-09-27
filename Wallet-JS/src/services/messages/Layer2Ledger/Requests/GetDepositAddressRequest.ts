interface GetDepositAddressRequest {
    layer2_address_pubkey: string;
    nonce: string;
    signature: string;
}

export default GetDepositAddressRequest;