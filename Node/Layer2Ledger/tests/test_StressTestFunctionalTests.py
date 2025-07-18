import pytest
from Layer2Ledger.main import app
from Layer2Ledger.core.Address import Address
from Layer2Ledger.config.config import config
import Layer2Ledger.core.KeyVerification as KeyVerification
from tests.TestsHelper import (
    generate_new_address,
    generate_nonce,
    is_successful_response,
    verify_get_new_deposit_address_procedure,
    verify_deposit_confirmed,
)
from Layer2Ledger.services.messages.Layer2Ledger.Requests.GetDepositAddressRequest import GetDepositAddressRequest
from Layer2Ledger.services.messages.Layer2Ledger.Responses.GetDepositAddressResponse import GetDepositAddressResponse
from Layer2Ledger.services.messages.Layer2Ledger.Requests.DepositConfirmedRequest import DepositConfirmedRequest, DepositsConfirmed
from Layer2Ledger.services.messages.Layer2Ledger.Requests.GetBalanceRequest import GetBalanceRequest
from Layer2Ledger.services.messages.Layer2Ledger.Responses.GetBalanceResponse import GetBalanceResponse
from Layer2Ledger.services.messages.Layer2Ledger.Requests.PushTransactionRequest import PushTransactionRequest

@pytest.fixture
def client():
    with app.test_client() as client:
        yield client

def test_stress_test_transfer(client):
    """
    Deposits 10,000 sats to one address and then transfers funds
    to 100 different addresses.
    """
    # 1. Deposit funds into a source address
    source_address = generate_new_address('Stress Test Source Address')
    deposit_amount = 10000
    
    # Get L1 deposit address
    nonce = generate_nonce()
    message = KeyVerification.buildGetDepositAddressMessage(source_address.pubkey, nonce)
    signature = source_address.sign(message)
    
    get_deposit_address_request = GetDepositAddressRequest(
        layer2_address_pubkey=source_address.pubkey,
        nonce=nonce,
        signature=signature
    )
    response = client.post('/getNewDepositAddress', json=get_deposit_address_request.model_dump(), content_type='application/json')
    assert is_successful_response(response)
    verify_get_new_deposit_address_procedure(source_address.pubkey)
    deposit_address_response = GetDepositAddressResponse(**response.json)
    deposit_address = deposit_address_response.layer1_deposit_address

    # Simulate Layer1 deposit
    deposit_nonce = generate_nonce()
    layer1_tx_id = generate_nonce()
    deposit_message = KeyVerification.buildDepositMessage(layer1_tx_id, 0, deposit_address, deposit_amount, deposit_nonce)
    onboarding_signer = Address.fromPrivateKey(config.Onboarding_Deposit_Address.private_key)
    signature = onboarding_signer.sign(deposit_message)

    deposit_data = DepositConfirmedRequest(
        transactions=[
            DepositsConfirmed(
                layer1_transaction_id=layer1_tx_id,
                layer1_transaction_vout=0,
                layer1_address=deposit_address,
                amount=deposit_amount,
                nonce=deposit_nonce,
                signature=signature.decode('utf-8')
            )
        ]
    )
    response = client.post('/depositFunds', json=deposit_data.model_dump(), content_type='application/json')
    assert is_successful_response(response)
    verify_deposit_confirmed(deposit_data)

    # 2. Generate 100 destination addresses
    num_dest_addresses = 100
    destination_addresses = [generate_new_address(f'Stress Test Destination Address {i}') for i in range(num_dest_addresses)]

    # 3. Transfer funds to each destination address
    amount_per_transfer = 90
    fee_per_transfer = 1

    for dest_address in destination_addresses:
        transfer_nonce = generate_nonce()
        transfer_message = KeyVerification.buildTransferMessage(
            source_address.pubkey, dest_address.pubkey, amount_per_transfer, fee_per_transfer, transfer_nonce
        )
        transfer_signature = source_address.sign(transfer_message).decode('utf-8')

        transfer_request = PushTransactionRequest(
            source_address_public_key=source_address.pubkey,
            destination_address_public_key=dest_address.pubkey,
            amount=amount_per_transfer,
            fee=fee_per_transfer,
            transaction_id=transfer_nonce,
            signature=transfer_signature
        )
        response = client.post('/pushTransaction', json=transfer_request.model_dump(), content_type='application/json')
        assert is_successful_response(response)

    # 4. Verify final balances
    # Verify source address balance
    balance_request = GetBalanceRequest(public_keys=[source_address.pubkey])
    response = client.post('/getBalance', json=balance_request.model_dump(), content_type='application/json')
    assert is_successful_response(response)
    balance_response = GetBalanceResponse(**response.json)
    source_balance = balance_response.balance[0]
    expected_source_balance = deposit_amount - (num_dest_addresses * amount_per_transfer)
    assert source_balance.balance == expected_source_balance

    # Verify destination addresses balances
    dest_pubkeys = [addr.pubkey for addr in destination_addresses]
    balance_request = GetBalanceRequest(public_keys=dest_pubkeys)
    response = client.post('/getBalance', json=balance_request.model_dump(), content_type='application/json')
    assert is_successful_response(response)
    balance_response = GetBalanceResponse(**response.json)
    
    for balance_info in balance_response.balance:
        assert balance_info.address_found is True
        assert balance_info.balance == amount_per_transfer - fee_per_transfer
