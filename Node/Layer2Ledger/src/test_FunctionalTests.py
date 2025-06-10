import datetime
import json
import time
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
from services.messages.Layer2Ledger.Requests.DepositConfirmedRequest import DepositConfirmedRequest, DepositsConfirmed
from services.messages.Layer2Ledger.Requests.GetTransactionsRequest import GetTransactionsRequest
from services.messages.Layer2Ledger.Requests.GetWithdrawalRequestsRequest import GetWithdrawalRequestsRequest
from services.messages.Layer2Ledger.Requests.WithdrawalBroadcastedRequest import WithdrawalBroadcastedRequest, Layer1BroadcastedWithdrawalTransaction
from services.messages.Layer2Ledger.Requests.PushTransactionRequest import PushTransactionRequest
from services.messages.Layer2Ledger.Requests.RequestWithdrawalRequest import RequestWithdrawalRequest
from services.messages.Layer2Ledger.Requests.GetBalanceRequest import GetBalanceRequest
from services.messages.Layer2Ledger.Requests.GetDepositAddressRequest import GetDepositAddressRequest
from services.messages.Layer2Ledger.Requests.WithdrawalConfirmedRequest import Layer1WithdrawalConfirmedTransaction, WithdrawalConfirmedRequest
from services.messages.Layer2Ledger.Responses.GetBalanceResponse import GetBalanceResponse
from services.messages.Layer2Ledger.Responses.GetDepositAddressResponse import GetDepositAddressResponse
from services.messages.Layer2Ledger.Requests.PostLayer1AuditReportRequest import PostLayer1AuditReportRequest, Layer1AddressBalance
from services.messages.Layer2Ledger.Responses.GetLayer1AuditReportResponse import GetLayer1AuditReportResponse
from services.messages.Layer2Ledger.Responses.GetWithdrawalRequestsResponse import GetWithdrawalRequestsResponse, WithdrawalRequest
import signing_keys
import KeyVerification

#Imports for SQLAlchemy db classes
from database import DatabaseSession, get_db
import Onboarding

#Helper functions for generating keys, addresses, nonces, etc...
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

#Helper functions for verifying procedures

def verify_get_new_deposit_address_procedure(layer2_address_pubkey: str):
    with get_db() as db:
        # Check if the deposit was added to the database
        deposit_entry: Onboarding.DepositAddresses = db.query(Onboarding.DepositAddresses).filter(
            Onboarding.DepositAddresses.layer2_address == layer2_address_pubkey,
        ).first()
        assert deposit_entry is not None

def verify_deposit_confirmed(deposit_confirmed: DepositConfirmedRequest):
    with get_db() as db:
        for deposit in deposit_confirmed.transactions:
            layer2_transaction = db.query(Transaction).filter(
                Transaction.layer2_transaction_id == deposit.nonce
            ).first()

            assert layer2_transaction is not None

def verify_withdrawal_request_procedure(db: DatabaseSession, withdrawal_request: RequestWithdrawalRequest):
    # Check to see if the withrawal request was processed correctly
    with get_db() as db:
        # Check if the withdrawal request was added to the database
        withdrawal_entry: Onboarding.WithdrawalRequests = db.query(Onboarding.WithdrawalRequests).filter(
            Onboarding.WithdrawalRequests.layer1_address == withdrawal_request.layer1_withdrawal_address,
            Onboarding.WithdrawalRequests.layer2_transaction_id == withdrawal_request.layer2_transaction_id,       
        ).first()
        assert withdrawal_entry is not None

        # Check to see that the Transaction's layer1_transaction_id is null (not yet broadcasted)
        assert withdrawal_entry.layer1_transaction_id is None

        # Check to see if a Transaction's layer2_withdrawal_id is the WithdrawalRequest's layer2_transaction_id
        layer2_transaction: Transaction = db.query(Transaction).filter(
            Transaction.layer2_transaction_id == withdrawal_entry.layer2_transaction_id,
        ).first()

        assert layer2_transaction is not None
        assert layer2_transaction.layer1_transaction_id is None  # Ensure it is not broadcasted yet
        assert layer2_transaction.layer2_withdrawal_id == withdrawal_entry.layer2_withdrawal_id

def verify_withdrawal_confirmed_procedure(withdrawal_confirmed: WithdrawalConfirmedRequest):
    with get_db() as db:
        for withdrawal in withdrawal_confirmed.transactions:
            layer2_withdrawal_ids = set()
            # Check if the withdrawal was added to the database
            withdrawal_entry: Onboarding.ConfirmedWithdrawals = db.query(Onboarding.ConfirmedWithdrawals).filter(
                Onboarding.ConfirmedWithdrawals.layer1_transaction_id == withdrawal.layer1_transaction_id,
                Onboarding.ConfirmedWithdrawals.layer1_transaction_vout == withdrawal.layer1_transaction_vout,
            ).first()
            assert withdrawal_entry is not None
            assert withdrawal_entry.confirmed is True
            layer2_withdrawal_ids.add(withdrawal_entry.layer2_withdrawal_id)

            for layer2_withdrawal_id in layer2_withdrawal_ids:

                withdrawalRequest: Onboarding.WithdrawalRequests = db.query(Onboarding.WithdrawalRequests).filter(
                    Onboarding.WithdrawalRequests.layer2_withdrawal_id == layer2_withdrawal_id
                ).first()
                assert withdrawalRequest is not None
                assert withdrawalRequest.layer1_transaction_id == withdrawal.layer1_transaction_id
                assert withdrawalRequest.status == Onboarding.WithdrawalRequests.WITHDRAWAL_STATUS_CONFIRMED

                # Check if the Transaction's layer1_transaction_id matches the confirmed withdrawal's layer1_transaction_id
                transaction_entry: Transaction = db.query(Transaction).filter(
                    Transaction.layer2_transaction_id == withdrawalRequest.layer2_transaction_id,
                ).first()
                assert transaction_entry is not None
                assert transaction_entry.layer1_transaction_id == withdrawal.layer1_transaction_id

def verify_layer2_transaction_procedure(layer2_transaction: PushTransactionRequest):
    with get_db() as db:
        # Check if the transaction was added to the database
        transaction_entry: Transaction = db.query(Transaction).filter(
            Transaction.layer2_transaction_id == layer2_transaction.transaction_id
        ).first()
        assert transaction_entry is not None

        # Check if the transaction's, source, destination, amount and fee match
        assert transaction_entry.source_address_pubkey == layer2_transaction.source_address_public_key
        assert transaction_entry.destination_address_pubkey == layer2_transaction.destination_address_public_key
        assert transaction_entry.amount == layer2_transaction.amount
        assert transaction_entry.fee == layer2_transaction.fee

        # Check if the transaction's signature matches
        assert transaction_entry.signature == layer2_transaction.signature

def drop_MasterPublicKeyIndex_DepositAddresses_tables():
    with get_db() as db:
        db.query(Onboarding.MasterPublicKeyIndex).delete()
        db.query(Onboarding.DepositAddresses).delete()
        db.commit()

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
    message = KeyVerification.buildGetDepositAddressMessage(l2_address.pubkey, nonce)
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
    verify_get_new_deposit_address_procedure(l2_address.pubkey)
    deposit_address_response = GetDepositAddressResponse(**response.json)
    deposit_address = deposit_address_response.layer1_deposit_address
    
    # Simulate Layer1 deposit
    deposit_nonce = generate_nonce()
    deposit_amount = 1000
    layer1_transaction_id = generate_nonce()
    layer1_transaction_vout = 0
    deposit_message = KeyVerification.buildDepositMessage(layer1_transaction_id, layer1_transaction_vout, deposit_address, deposit_amount, deposit_nonce)
    onboarding_transaction_signing_address = Address.fromPrivateKey(config['Functional_Tests']['Onboarding_Deposit_Address']['private_key'])
    signature = onboarding_transaction_signing_address.sign(deposit_message)
    
    deposit_data = DepositConfirmedRequest(
        transactions=[
            DepositsConfirmed(
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

    verify_deposit_confirmed(deposit_data)
    
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
    message = KeyVerification.buildGetDepositAddressMessage(l2_address_1.pubkey, nonce)
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
    deposit_message = KeyVerification.buildDepositMessage(layer1_transaction_id, layer1_transaction_vout, deposit_address, deposit_amount, deposit_nonce)
    onboarding_transaction_signing_address = Address.fromPrivateKey(config['Functional_Tests']['Onboarding_Deposit_Address']['private_key'])
    signature = onboarding_transaction_signing_address.sign(deposit_message)
    
    deposit_data = DepositConfirmedRequest(
        transactions=[
            DepositsConfirmed(
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
    verify_deposit_confirmed(deposit_data)
      
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
    transfer_message = KeyVerification.buildTransferMessage(l2_address_1.pubkey, l2_address_2.pubkey, transfer_amount, transfer_fee, transfer_nonce)
    transfer_signature = l2_address_1.sign(transfer_message).decode('utf-8')
    
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
    verify_layer2_transaction_procedure(transfer_request)
    
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

# This test transfers funds and tests to see if it gets the transactions of a L2 address
def test_deposit_transfer_get_transactions(client):
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
    message = KeyVerification.buildGetDepositAddressMessage(l2_address_1.pubkey, nonce)
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
    deposit_message = KeyVerification.buildDepositMessage(layer1_transaction_id, layer1_transaction_vout, deposit_address, deposit_amount, deposit_nonce)
    onboarding_transaction_signing_address = Address.fromPrivateKey(config['Functional_Tests']['Onboarding_Deposit_Address']['private_key'])
    signature = onboarding_transaction_signing_address.sign(deposit_message)
    
    deposit_data = DepositConfirmedRequest(
        transactions=[
            DepositsConfirmed(
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
    verify_deposit_confirmed(deposit_data)
      
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
    transfer_message = KeyVerification.buildTransferMessage(l2_address_1.pubkey, l2_address_2.pubkey, transfer_amount, transfer_fee, transfer_nonce)
    transfer_signature = l2_address_1.sign(transfer_message).decode('utf-8')
    
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
    verify_layer2_transaction_procedure(transfer_request)

    # Verify the transaction was added to the L2 address's transaction history
    get_transactions_request: GetTransactionsRequest = GetTransactionsRequest(
        public_keys=[l2_address_1.pubkey]
    )
    response = client.post('/getAllTransactionsOfPublicKey', json=get_transactions_request.model_dump(), content_type='application/json')
    assert is_successful_response(response)
    

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
    message = KeyVerification.buildGetDepositAddressMessage(l2_address.pubkey, nonce)
    signature = l2_address.sign(message)
    
    # Get L1 deposit address
    get_deposit_address_request = GetDepositAddressRequest(
        layer2_address_pubkey=l2_address.pubkey,
        nonce=nonce,
        signature=signature
    )
    response = client.post('/getNewDepositAddress', json=get_deposit_address_request.model_dump(), content_type='application/json')
    assert is_successful_response(response)
    verify_get_new_deposit_address_procedure(l2_address.pubkey)
    deposit_address_response = GetDepositAddressResponse(**response.json)
    deposit_address = deposit_address_response.layer1_deposit_address
    
    # Simulate Layer1 deposit
    deposit_nonce = generate_nonce()
    deposit_amount = 10000
    layer1_transaction_id = generate_nonce()
    layer1_transaction_vout = 0
    deposit_message = KeyVerification.buildDepositMessage(layer1_transaction_id, layer1_transaction_vout, deposit_address, deposit_amount, deposit_nonce)
    onboarding_transaction_signing_address = Address.fromPrivateKey(config['Functional_Tests']['Onboarding_Deposit_Address']['private_key'])
    signature = onboarding_transaction_signing_address.sign(deposit_message)
    
    deposit_data = DepositConfirmedRequest(
        transactions=[
            DepositsConfirmed(
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
    verify_deposit_confirmed(deposit_data)
    
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
    withdrawal_message = KeyVerification.buildWithdrawalRequestMessage(l2_address.pubkey, layer1_withdrawal_address, withdrawal_nonce, withdrawal_amount)
    withdrawal_signature = l2_address.sign(withdrawal_message).decode('utf-8')
    
    withdrawal_request = RequestWithdrawalRequest(
        source_address_public_key=l2_address.pubkey,
        layer2_transaction_id=withdrawal_nonce,
        layer1_withdrawal_address=layer1_withdrawal_address,
        amount=withdrawal_amount,
        signature=withdrawal_signature
    )
    response = client.post('/withdrawalRequest', json=withdrawal_request.model_dump(), content_type='application/json')
    assert is_successful_response(response)

    with get_db() as db:
        verify_withdrawal_request_procedure(db, withdrawal_request)

    
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

# This test generates a new L2 address, gets a deposit address, simulates a deposit, and withdraws to a new L1 address.
# Then simulates a Layer2Bridge Layer1 withdrawal broadcast, and checks to see if the withdrawal was added to ConfirmedWithdrawals with confirmed = False, and the layer2 Transaction.layer1_transaction_id is null
def test_deposit_and_withdraw_broadcast(client):
    # Load config
    config = load_config()

    # Generate L2 address
    l2_address = generate_new_address('L2 Address for deposit and withdrawal broadcast')
    print(f"Generated L2 address: {l2_address.pubkey}")

    # Generate nonce for deposit address
    nonce = generate_nonce()

    # Generate message to sign for /getNewDepositAddress
    message = KeyVerification.buildGetDepositAddressMessage(l2_address.pubkey, nonce)
    signature = l2_address.sign(message)

    # Get L1 deposit address
    get_deposit_address_request = GetDepositAddressRequest(
        layer2_address_pubkey=l2_address.pubkey,
        nonce=nonce,
        signature=signature
    )
    response = client.post('/getNewDepositAddress', json=get_deposit_address_request.model_dump(), content_type='application/json')
    assert is_successful_response(response)
    verify_get_new_deposit_address_procedure(l2_address.pubkey)
    deposit_address_response = GetDepositAddressResponse(**response.json)
    deposit_address = deposit_address_response.layer1_deposit_address

    # Simulate Layer1 deposit
    deposit_nonce = generate_nonce()
    deposit_amount = 10000
    layer1_transaction_id = generate_nonce()
    layer1_transaction_vout = 0
    deposit_message = KeyVerification.buildDepositMessage(layer1_transaction_id, layer1_transaction_vout, deposit_address, deposit_amount, deposit_nonce)
    onboarding_transaction_signing_address = Address.fromPrivateKey(config['Functional_Tests']['Onboarding_Deposit_Address']['private_key'])
    signature = onboarding_transaction_signing_address.sign(deposit_message)

    deposit_data = DepositConfirmedRequest(
        transactions=[
            DepositsConfirmed(
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
    verify_deposit_confirmed(deposit_data)

    # Simulate withdrawal to L1 address
    withdrawal_nonce = generate_nonce()
    withdrawal_amount = 5000
    layer1_withdrawal_address = "1NewL1AddressForTest"  # Replace with a valid L1 address
    withdrawal_message = KeyVerification.buildWithdrawalRequestMessage(l2_address.pubkey, layer1_withdrawal_address, withdrawal_nonce, withdrawal_amount)
    withdrawal_signature = l2_address.sign(withdrawal_message).decode('utf-8')

    withdrawal_request = RequestWithdrawalRequest(
        source_address_public_key=l2_address.pubkey,
        layer2_transaction_id=withdrawal_nonce,
        layer1_withdrawal_address=layer1_withdrawal_address,
        amount=withdrawal_amount,
        signature=withdrawal_signature
    )
    response = client.post('/withdrawalRequest', json=withdrawal_request.model_dump(), content_type='application/json')
    assert is_successful_response(response)

    with get_db() as db:
        verify_withdrawal_request_procedure(db, withdrawal_request)

    # Simulate Layer2Bridge Layer1 withdrawal broadcast using the correct API
    broadcast_signature = onboarding_transaction_signing_address.sign(
        KeyVerification.buildWithdrawalBroadcastedMessage(
            layer1_transaction_id, layer1_transaction_vout, layer1_withdrawal_address, withdrawal_amount, withdrawal_nonce
        )
    ).decode('utf-8')

    broadcast_request = WithdrawalBroadcastedRequest(
        transactions=[
            Layer1BroadcastedWithdrawalTransaction(
                layer1_transaction_id=layer1_transaction_id,
                layer1_transaction_vout=layer1_transaction_vout,
                layer1_address=layer1_withdrawal_address,
                amount=withdrawal_amount,
                layer2_withdrawal_id=withdrawal_nonce,
                signature=broadcast_signature
            )
        ]
    )
    response = client.post('/withdrawalBroadcasted', json=broadcast_request.model_dump(), content_type='application/json')
    assert is_successful_response(response)

    with get_db() as db:
        # Check if the broadcasted withdrawal was added to the database
        withdrawal_entry: Onboarding.ConfirmedWithdrawals = db.query(Onboarding.ConfirmedWithdrawals).filter(
            Onboarding.ConfirmedWithdrawals.layer1_transaction_id == layer1_transaction_id,
            Onboarding.ConfirmedWithdrawals.layer1_transaction_vout == layer1_transaction_vout,
        ).first()
        assert withdrawal_entry is not None

        # Check to see that it is not confirmed on layer1
        assert withdrawal_entry.confirmed is False

# This test generates a new L2 address, gets a deposit address, simulates a deposit, and withdraws to a new L1 address.
# Then simulates a Layer2Bridge Layer1 withdrawal broadcast.
# Then simulates a Layer2Bridge Layer1 withdrawal confirmed and checks to see if the withdrawal was added to ConfirmedWithdrawals with confirmed = True, and the layer2 Transaction.layer1_transaction_id is transaction_id of the confirmed withdrawal
def test_deposit_and_withdraw_broadcast_confirmed(client):
    # Load config
    config = load_config()

    # Generate L2 address
    l2_address = generate_new_address('L2 Address for deposit and withdrawal broadcast')
    print(f"Generated L2 address: {l2_address.pubkey}")

    # Generate nonce for deposit address
    nonce = generate_nonce()

    # Generate message to sign for /getNewDepositAddress
    message = KeyVerification.buildGetDepositAddressMessage(l2_address.pubkey, nonce)
    signature = l2_address.sign(message)

    # Get L1 deposit address
    get_deposit_address_request = GetDepositAddressRequest(
        layer2_address_pubkey=l2_address.pubkey,
        nonce=nonce,
        signature=signature
    )
    response = client.post('/getNewDepositAddress', json=get_deposit_address_request.model_dump(), content_type='application/json')
    assert is_successful_response(response)
    verify_get_new_deposit_address_procedure(l2_address.pubkey)
    deposit_address_response = GetDepositAddressResponse(**response.json)
    deposit_address = deposit_address_response.layer1_deposit_address

    verify_get_new_deposit_address_procedure(l2_address.pubkey)

    # Simulate Layer1 deposit
    deposit_nonce = generate_nonce()
    deposit_amount = 10000
    layer1_transaction_id = generate_nonce()
    layer1_transaction_vout = 0
    deposit_message = KeyVerification.buildDepositMessage(layer1_transaction_id, layer1_transaction_vout, deposit_address, deposit_amount, deposit_nonce)
    onboarding_transaction_signing_address = Address.fromPrivateKey(config['Functional_Tests']['Onboarding_Deposit_Address']['private_key'])
    signature = onboarding_transaction_signing_address.sign(deposit_message)

    deposit_data = DepositConfirmedRequest(
        transactions=[
            DepositsConfirmed(
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
    verify_deposit_confirmed(deposit_data)

    timestamp_before_withdrawal = int(time.time_ns() / 1e6) # Store the timestamp before withdrawal, so we can query the WithdrawalRequests after this timestamp

    # Simulate withdrawal to L1 address
    withdrawal_layer2_transaction_id_nonce = generate_nonce()
    withdrawal_amount = 5000
    layer1_withdrawal_address = "1NewL1AddressForTest"  # Replace with a valid L1 address
    withdrawal_message = KeyVerification.buildWithdrawalRequestMessage(l2_address.pubkey, layer1_withdrawal_address, withdrawal_layer2_transaction_id_nonce, withdrawal_amount)
    withdrawal_signature = l2_address.sign(withdrawal_message).decode('utf-8')

    withdrawal_request = RequestWithdrawalRequest(
        source_address_public_key=l2_address.pubkey,
        layer2_transaction_id=withdrawal_layer2_transaction_id_nonce,
        layer1_withdrawal_address=layer1_withdrawal_address,
        amount=withdrawal_amount,
        signature=withdrawal_signature
    )
    response = client.post('/withdrawalRequest', json=withdrawal_request.model_dump(), content_type='application/json')
    assert is_successful_response(response)

    with get_db() as db:
        verify_withdrawal_request_procedure(db, withdrawal_request)

    #Simulate the Layer2Bridge querying the withdrawal request
    get_withdrawal_requests: GetWithdrawalRequestsRequest = GetWithdrawalRequestsRequest(
        latest_timestamp=timestamp_before_withdrawal
    )
    response = client.post('/getWithdrawalRequests', json=get_withdrawal_requests.model_dump(), content_type='application/json')
    assert is_successful_response(response)
    withdrawal_requests_response: GetWithdrawalRequestsResponse = GetWithdrawalRequestsResponse(**response.json)
    assert len(withdrawal_requests_response.withdrawal_requests) == 1 # If you have more than one withdrawal request, you should make sure the timestamp does not capture extra requests from previous tests running in the same testing session.
    withdrawal_request: WithdrawalRequest = withdrawal_requests_response.withdrawal_requests[0]
    assert withdrawal_request.layer2_transaction_id == withdrawal_layer2_transaction_id_nonce
    
    # Simulate Layer2Bridge Layer1 withdrawal broadcast
    withdrawal_broadcasted_message =  KeyVerification.buildWithdrawalBroadcastedMessage(
            layer1_transaction_id, layer1_transaction_vout, layer1_withdrawal_address, withdrawal_amount, withdrawal_request.layer2_withdrawal_id
        )
    broadcast_signature = onboarding_transaction_signing_address.sign(withdrawal_broadcasted_message).decode('utf-8')

    broadcast_request = WithdrawalBroadcastedRequest(
        transactions=[
            Layer1BroadcastedWithdrawalTransaction(
                layer1_transaction_id=layer1_transaction_id,
                layer1_transaction_vout=layer1_transaction_vout,
                layer1_address=layer1_withdrawal_address,
                amount=withdrawal_amount,
                layer2_withdrawal_id=withdrawal_request.layer2_withdrawal_id,
                signature=broadcast_signature
            )
        ]
    )
    response = client.post('/withdrawalBroadcasted', json=broadcast_request.model_dump(), content_type='application/json')
    assert is_successful_response(response)

    with get_db() as db:
        # Check if the broadcasted withdrawal was added to the database
        withdrawal_entry: Onboarding.ConfirmedWithdrawals = db.query(Onboarding.ConfirmedWithdrawals).filter(
            Onboarding.ConfirmedWithdrawals.layer1_transaction_id == layer1_transaction_id,
            Onboarding.ConfirmedWithdrawals.layer1_transaction_vout == layer1_transaction_vout,
        ).first()
        assert withdrawal_entry is not None

        # Check to see that it is not confirmed on layer1
        assert withdrawal_entry.confirmed is False

    # Simulate Layer2Bridge Layer1 withdrawal confirmed
    confirmed_signature = onboarding_transaction_signing_address.sign(
        KeyVerification.buildWithdrawalConfirmedMessage(
            layer1_transaction_id, layer1_transaction_vout, layer1_withdrawal_address, withdrawal_amount
        )
    ).decode('utf-8')

    confirmed_request = WithdrawalConfirmedRequest(
        transactions=[
            Layer1WithdrawalConfirmedTransaction(
                layer1_transaction_id=layer1_transaction_id,
                layer1_transaction_vout=layer1_transaction_vout,
                layer1_address=layer1_withdrawal_address,
                amount=withdrawal_amount,
                signature=confirmed_signature
            )
        ]
    )
    response = client.post('/withdrawalConfirmed', json=confirmed_request.model_dump(), content_type='application/json')
    assert is_successful_response(response)
    verify_withdrawal_confirmed_procedure(confirmed_request)
    

# Test for postLayer1AuditReport and getLayer1AuditReport
# Updated test to use the message building logic from verifyLayer1AuditReportSignature
def test_layer1_audit_report(client):
    # Load config
    config = load_config()

    # Generate test data for postLayer1AuditReport
    layer1_address_balances = [
        Layer1AddressBalance(layer1_address="1TestAddress1", balance=1000),
        Layer1AddressBalance(layer1_address="1TestAddress2", balance=2000)
    ]

    # Build the message using the logic from verifyLayer1AuditReportSignature
    block_height = random.randint(1, 1000)  # Random block height for testing
    total_balance = sum(balance.balance for balance in layer1_address_balances)
    message = KeyVerification.buildLayer1AuditReportMessage(block_height, total_balance)

    # Generate the signature using the signing key
    onboarding_transaction_signing_address = Address.fromPrivateKey(config['Functional_Tests']['Onboarding_Deposit_Address']['private_key'])
    signature = onboarding_transaction_signing_address.sign(message).decode('utf-8')

    post_audit_request = PostLayer1AuditReportRequest(
        block_height=block_height,
        layer1_address_balances=layer1_address_balances,
        signature=signature
    )

    # Post Layer1 Audit Report
    response = client.post('/postLayer1AuditReport', json=post_audit_request.model_dump(), content_type='application/json')
    assert is_successful_response(response)

    # Get Layer1 Audit Report
    response = client.get(f"/getLayer1AuditReport?block_height={post_audit_request.block_height}", content_type='application/json')
    assert is_successful_response(response)

    # Validate response using Pydantic model
    audit_report_response = GetLayer1AuditReportResponse(**response.json)
    assert audit_report_response.blockHeight == post_audit_request.block_height
    assert audit_report_response.totalBalance == total_balance

    print(f"Audit report validated successfully: {audit_report_response}")

#Tests to make sure the first MPK/DepositAddress is generated correctly
def test_delete_mpk_table_get_deposit_address(client):
    # Load config
    config = load_config()

    # Delete the MPK table
    drop_MasterPublicKeyIndex_DepositAddresses_tables()

    # Generate a new L2 address
    l2_address = generate_new_address('L2 Address for deposit')
    print(f"Generated L2 address: {l2_address.pubkey}")

    # Generate nonce
    nonce = generate_nonce()

    # Generate message to sign for /getNewDepositAddress
    message = KeyVerification.buildGetDepositAddressMessage(l2_address.pubkey, nonce)
    signature = l2_address.sign(message)

    # Get L1 deposit address
    get_deposit_address_request = GetDepositAddressRequest(
        layer2_address_pubkey=l2_address.pubkey,
        nonce=nonce,
        signature=signature
    )
    response = client.post('/getNewDepositAddress', json=get_deposit_address_request.model_dump(), content_type='application/json')
    assert is_successful_response(response)
    verify_get_new_deposit_address_procedure(l2_address.pubkey)
    deposit_address_response = GetDepositAddressResponse(**response.json)

# This tests getting a deposit address twice for the same L2 address. 
# Ensure that the second call returns the same Layer 1 deposit address as the first call.
def test_generate_deposit_address_twice(client):
    # Load config
    config = load_config()

    # Generate a new L2 address
    l2_address = generate_new_address('L2 Address for deposit')
    print(f"Generated L2 address: {l2_address.pubkey}")

    # Generate nonce
    nonce = generate_nonce()

    # Generate message to sign for /getNewDepositAddress
    message = KeyVerification.buildGetDepositAddressMessage(l2_address.pubkey, nonce)
    signature = l2_address.sign(message)

    # Get L1 deposit address for the first time
    get_deposit_address_request = GetDepositAddressRequest(
        layer2_address_pubkey=l2_address.pubkey,
        nonce=nonce,
        signature=signature
    )
    response = client.post('/getNewDepositAddress', json=get_deposit_address_request.model_dump(), content_type='application/json')
    assert is_successful_response(response)
    verify_get_new_deposit_address_procedure(l2_address.pubkey)
    
    deposit_address_response_1 = GetDepositAddressResponse(**response.json)
    deposit_address_1 = deposit_address_response_1.layer1_deposit_address

    # Get L1 deposit address for the second time
    response = client.post('/getNewDepositAddress', json=get_deposit_address_request.model_dump(), content_type='application/json')
    assert is_successful_response(response)
    
    deposit_address_response_2 = GetDepositAddressResponse(**response.json)
    deposit_address_2 = deposit_address_response_2.layer1_deposit_address

    # Ensure both responses have the same Layer 1 deposit address
    assert deposit_address_1 == deposit_address_2

if __name__ == '__main__':
    pytest.main()
