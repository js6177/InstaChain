import json
import pytest
import random
import string
from Address import Address
from config import load_config
import ecdsa
import base58
from main import app
from NodeInfoAPI import NODE_ID, NODE_ASSET_ID
from Transaction import Transaction
from typing import TypedDict
from services.messages.Layer2Ledger.Requests.PushTransactionRequest import PushTransactionRequest
from services.messages.Layer2Ledger.Requests.RequestWithdrawalRequest import RequestWithdrawalRequest
from services.messages.Layer2Ledger.Requests.GetBalanceRequest import GetBalanceRequest
from services.messages.Layer2Ledger.Requests.GetDepositAddressRequest import GetDepositAddressRequest
from services.messages.Layer2Ledger.Requests.DepositFundsRequest import DepositFundsRequest, DepositTransaction
from services.messages.Layer2Ledger.Responses.GetBalanceResponse import GetBalanceResponse
from services.messages.Layer2Ledger.Responses.GetDepositAddressResponse import GetDepositAddressResponse


def generate_new_keypair() -> tuple[str, str]:
    sk = ecdsa.SigningKey.generate(curve=ecdsa.SECP256k1)
    vk = sk.get_verifying_key()

    urlsafe_pubkey = base58.b58encode(vk.to_string())
    urlsafe_privkey = base58.b58encode(sk.to_string())

    return (urlsafe_privkey, urlsafe_pubkey.decode('utf-8'))

def generate_new_address(description: str) -> Address:
    priv_key, pub_key = generate_new_keypair()
    return Address.fromPrivateKey(priv_key, pub_key, description)

def generate_nonce(length=16) -> str:
    return ''.join(random.choices(string.ascii_letters + string.digits, k=length))

def is_successful_response(response) -> bool:
    return response.status_code == 200 and response.json['error_code'] == 0

@pytest.fixture
def client():
    with app.test_client() as client:
        yield client


# This test will generate a new L2 address, get a new deposit address for it, simulate a deposit, and check the balance of the L2 address
def test_deposit_and_check_balance(client):
    # Load config
    config = load_config()
    
    # Generate L2 address
    #l2_address_priv_key, l2_address_pub_key = generate_new_keypair()
    l2_address = generate_new_address('L2 Address for deposit')
    print(f"Generated L2 address: {l2_address.pubkey}")
    
    # Generate nonce
    nonce = generate_nonce()
    
    # Generate message to sign for /getNewDepositAddress
    message = f"{NODE_ID} {NODE_ASSET_ID} {Transaction.INSTRUCTION_GET_DEPOSIT_ADDRESS} {l2_address.pubkey} {nonce}"
    signature = l2_address.sign(message)
    print(f"getNewDepositAddress Message: {message}")
    print(f"getNewDepositAddress Signature: {signature}")
    
    # Get L1 deposit address
    get_deposit_address_request = GetDepositAddressRequest(
        layer2_address_pubkey=l2_address.pubkey,
        nonce=nonce,
        signature=signature
    )
    response = client.post('/getNewDepositAddress', json=get_deposit_address_request.model_dump(), content_type='application/json')
    assert is_successful_response(response)
    deposit_address_response = GetDepositAddressResponse(**response.json)
    deposit_address = deposit_address_response.layer1_deposit_address
    
    # Simulate Layer1 deposit
    deposit_nonce = generate_nonce()
    deposit_amount = 1000
    layer1_transaction_id = generate_nonce()
    layer1_transaction_vout = 0
    deposit_message = f"{NODE_ID} {Transaction.TRX_DEPOSIT} {layer1_transaction_id} {layer1_transaction_vout} {deposit_address} {deposit_amount} {deposit_nonce}"
    onboarding_transaction_signing_address = Address.fromPrivateKey(config['Functional_Tests']['Onboarding_Deposit_Address']['private_key'])
    signature = onboarding_transaction_signing_address.sign(deposit_message)
    
    deposit_data = DepositFundsRequest(
        transactions=[
            DepositTransaction(
                layer1_transaction_id=layer1_transaction_id,
                layer1_transaction_vout=layer1_transaction_vout,
                layer1_address=deposit_address,
                amount=deposit_amount,
                nonce=deposit_nonce,
                signature=signature.decode('utf-8')
            )
        ]
    )
    response = client.post('/depositFunds', json=deposit_data.model_dump(), content_type='application/json')
    assert is_successful_response(response)
    
    # Check balance of L2 address
    balance_request = GetBalanceRequest(public_keys=[l2_address.pubkey])
    response = client.post('/getBalance', json=balance_request.model_dump(), content_type='application/json')
    assert is_successful_response(response)
    balance_response = GetBalanceResponse(**response.json)
    balance = list(balance_response.balance)  # Ensure balance is a list
    assert len(balance) > 0
    assert balance[0].address_found is True
    assert balance[0].public_key == l2_address.pubkey
    assert balance[0].balance == deposit_amount

    print(f"Balance of L2 address {l2_address.pubkey}: {balance}")

# This test generates two new L2 addresses, gets a deposit address for the first L2 address, simulates a deposit,
# and transfers funds from the first L2 address to the second L2 address.
# The test ensures the final balance of the second L2 address is the transfer amount minus any fees.
def test_deposit_and_transfer(client):
    # Load config
    config = load_config()
    
    # Generate L2 addresses
    l2_address_1 = generate_new_address('L2 Address 1 for deposit')
    l2_address_2 = generate_new_address('L2 Address 2 for transfer')
    print(f"Generated L2 address 1: {l2_address_1.pubkey}")
    print(f"Generated L2 address 2: {l2_address_2.pubkey}")
    
    # Generate nonce for deposit address
    nonce = generate_nonce()
    
    # Generate message to sign for /getNewDepositAddress
    message = f"{NODE_ID} {NODE_ASSET_ID} {Transaction.INSTRUCTION_GET_DEPOSIT_ADDRESS} {l2_address_1.pubkey} {nonce}"
    signature = l2_address_1.sign(message)
    
    # Get L1 deposit address
    get_deposit_address_request = GetDepositAddressRequest(
        layer2_address_pubkey=l2_address_1.pubkey,
        nonce=nonce,
        signature=signature
    )
    response = client.post('/getNewDepositAddress', json=get_deposit_address_request.model_dump(), content_type='application/json')
    assert is_successful_response(response)
    deposit_address_response = GetDepositAddressResponse(**response.json)
    deposit_address = deposit_address_response.layer1_deposit_address
    
    # Simulate Layer1 deposit
    deposit_nonce = generate_nonce()
    deposit_amount = 1000
    layer1_transaction_id = generate_nonce()
    layer1_transaction_vout = 0
    deposit_message = f"{NODE_ID} {Transaction.TRX_DEPOSIT} {layer1_transaction_id} {layer1_transaction_vout} {deposit_address} {deposit_amount} {deposit_nonce}"
    onboarding_transaction_signing_address = Address.fromPrivateKey(config['Functional_Tests']['Onboarding_Deposit_Address']['private_key'])
    signature = onboarding_transaction_signing_address.sign(deposit_message)
    
    deposit_data = DepositFundsRequest(
        transactions=[
            DepositTransaction(
                layer1_transaction_id=layer1_transaction_id,
                layer1_transaction_vout=layer1_transaction_vout,
                layer1_address=deposit_address,
                amount=deposit_amount,
                nonce=deposit_nonce,
                signature=signature.decode('utf-8')
            )
        ]
    )
    response = client.post('/depositFunds', json=deposit_data.model_dump(), content_type='application/json')
    assert is_successful_response(response)
    
    # Check balance of L2 address 1
    balance_request = GetBalanceRequest(public_keys=[l2_address_1.pubkey])
    response = client.post('/getBalance', json=balance_request.model_dump(), content_type='application/json')
    assert is_successful_response(response)
    balance_response = GetBalanceResponse(**response.json)
    balance = list(balance_response.balance)
    assert len(balance) > 0
    assert balance[0].address_found is True
    assert balance[0].public_key == l2_address_1.pubkey
    assert balance[0].balance == deposit_amount

    # Transfer funds to L2 address 2
    transfer_nonce = generate_nonce()
    transfer_amount = 500
    transfer_fee = 10
    transfer_message = f"{NODE_ID} {NODE_ASSET_ID} {Transaction.TRX_TRANSFER} {l2_address_1.pubkey} {l2_address_2.pubkey} {transfer_amount} {transfer_fee} {transfer_nonce}"
    transfer_signature = l2_address_1.sign(transfer_message).decode('utf-8')  # Decode the signature to a string
    
    transfer_request = PushTransactionRequest(
        source_address_public_key=l2_address_1.pubkey,
        destination_address_public_key=l2_address_2.pubkey,
        amount=transfer_amount,
        fee=transfer_fee,
        transaction_id=transfer_nonce,
        signature=transfer_signature
    )
    response = client.post('/pushTransaction', json=transfer_request.model_dump(), content_type='application/json')
    assert is_successful_response(response)
    
    # Check balance of L2 address 2
    balance_request = GetBalanceRequest(public_keys=[l2_address_2.pubkey])
    response = client.post('/getBalance', json=balance_request.model_dump(), content_type='application/json')
    assert is_successful_response(response)
    balance_response = GetBalanceResponse(**response.json)
    balance = list(balance_response.balance)
    assert len(balance) > 0
    assert balance[0].address_found is True
    assert balance[0].public_key == l2_address_2.pubkey
    assert balance[0].balance == transfer_amount - transfer_fee  # Ensure balance is transfer amount minus fees

    print(f"Balance of L2 address 2 {l2_address_2.pubkey}: {balance}")

# This test generates a new L2 address, gets a deposit address, simulates a deposit, and withdraws to a new L1 address.
# The test ensures the final L2 balance is the deposit amount minus the withdrawal amount minus any fees.
def test_deposit_and_withdraw(client):
    # Load config
    config = load_config()
    
    # Generate L2 address
    l2_address = generate_new_address('L2 Address for deposit and withdrawal')
    print(f"Generated L2 address: {l2_address.pubkey}")
    
    # Generate nonce for deposit address
    nonce = generate_nonce()
    
    # Generate message to sign for /getNewDepositAddress
    message = f"{NODE_ID} {NODE_ASSET_ID} {Transaction.INSTRUCTION_GET_DEPOSIT_ADDRESS} {l2_address.pubkey} {nonce}"
    signature = l2_address.sign(message)
    
    # Get L1 deposit address
    get_deposit_address_request = GetDepositAddressRequest(
        layer2_address_pubkey=l2_address.pubkey,
        nonce=nonce,
        signature=signature
    )
    response = client.post('/getNewDepositAddress', json=get_deposit_address_request.model_dump(), content_type='application/json')
    assert is_successful_response(response)
    deposit_address_response = GetDepositAddressResponse(**response.json)
    deposit_address = deposit_address_response.layer1_deposit_address
    
    # Simulate Layer1 deposit
    deposit_nonce = generate_nonce()
    deposit_amount = 10000
    layer1_transaction_id = generate_nonce()
    layer1_transaction_vout = 0
    deposit_message = f"{NODE_ID} {Transaction.TRX_DEPOSIT} {layer1_transaction_id} {layer1_transaction_vout} {deposit_address} {deposit_amount} {deposit_nonce}"
    onboarding_transaction_signing_address = Address.fromPrivateKey(config['Functional_Tests']['Onboarding_Deposit_Address']['private_key'])
    signature = onboarding_transaction_signing_address.sign(deposit_message)
    
    deposit_data = DepositFundsRequest(
        transactions=[
            DepositTransaction(
                layer1_transaction_id=layer1_transaction_id,
                layer1_transaction_vout=layer1_transaction_vout,
                layer1_address=deposit_address,
                amount=deposit_amount,
                nonce=deposit_nonce,
                signature=signature.decode('utf-8')
            )
        ]
    )
    response = client.post('/depositFunds', json=deposit_data.model_dump(), content_type='application/json')
    assert is_successful_response(response)
    
    # Check balance of L2 address
    balance_request = GetBalanceRequest(public_keys=[l2_address.pubkey])
    response = client.post('/getBalance', json=balance_request.model_dump(), content_type='application/json')
    assert is_successful_response(response)
    balance_response = GetBalanceResponse(**response.json)
    balance = list(balance_response.balance)  # Ensure balance is a list
    assert len(balance) > 0
    assert balance[0].address_found is True
    assert balance[0].public_key == l2_address.pubkey
    assert balance[0].balance == deposit_amount

    # Simulate withdrawal to L1 address
    withdrawal_nonce = generate_nonce()
    withdrawal_amount = 5000
    layer1_withdrawal_address = "1NewL1AddressForTest"  # Replace with a valid L1 address
    withdrawal_message = f"{NODE_ID} {NODE_ASSET_ID} {Transaction.TRX_WITHDRAWAL_INITIATED} {l2_address.pubkey} {layer1_withdrawal_address} {withdrawal_nonce} {withdrawal_amount}"
    withdrawal_signature = l2_address.sign(withdrawal_message).decode('utf-8')
    
    withdrawal_request = RequestWithdrawalRequest(
        source_address_public_key=l2_address.pubkey,
        nonce=withdrawal_nonce,
        layer1_withdrawal_address=layer1_withdrawal_address,
        amount=withdrawal_amount,
        signature=withdrawal_signature
    )
    response = client.post('/withdrawalRequest', json=withdrawal_request.model_dump(), content_type='application/json')
    assert is_successful_response(response)
    
    # Check final balance of L2 address
    response = client.post('/getBalance', json=balance_request.model_dump(), content_type='application/json')
    assert is_successful_response(response)
    balance_response = GetBalanceResponse(**response.json)
    balance = list(balance_response.balance)
    assert len(balance) > 0
    assert balance[0].address_found is True
    assert balance[0].public_key == l2_address.pubkey
    assert balance[0].balance == deposit_amount - withdrawal_amount # Ensure balance is correct

    print(f"Final balance of L2 address {l2_address.pubkey}: {balance}")

if __name__ == '__main__':
    pytest.main()
