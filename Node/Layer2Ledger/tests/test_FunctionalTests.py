import datetime
import json
import time
import pytest
import random
import string
from httpx import AsyncClient, ASGITransport
from typing import AsyncGenerator, Generator, Any
import pytest_asyncio
from sqlalchemy import select
from Layer2Ledger.core.Address import Address
from Layer2Ledger.config.config import config
import ecdsa
import base58
from Layer2Ledger.main import app as fastapi_app

from Layer2Ledger.API.NodeInfoAPI import NODE_ID, NODE_ASSET_ID
from Layer2Ledger.core.Transaction import Transaction
from typing import TypedDict
from Layer2Ledger.services.messages.Layer2Ledger.Requests.DepositConfirmedRequest import DepositConfirmedRequest, DepositsConfirmed
from Layer2Ledger.services.messages.Layer2Ledger.Requests.GetTransactionsRequest import GetTransactionsRequest
from Layer2Ledger.services.messages.Layer2Ledger.Requests.GetWithdrawalRequestsRequest import GetWithdrawalRequestsRequest
from Layer2Ledger.services.messages.Layer2Ledger.Requests.WithdrawalBroadcastedRequest import WithdrawalBroadcastedRequest, Layer1BroadcastedWithdrawalTransaction
from Layer2Ledger.services.messages.Layer2Ledger.Requests.PushTransactionRequest import PushTransactionRequest
from Layer2Ledger.services.messages.Layer2Ledger.Requests.RequestWithdrawalRequest import RequestWithdrawalRequest
from Layer2Ledger.services.messages.Layer2Ledger.Requests.GetBalanceRequest import GetBalanceRequest
from Layer2Ledger.services.messages.Layer2Ledger.Requests.GetDepositAddressRequest import GetDepositAddressRequest
from Layer2Ledger.services.messages.Layer2Ledger.Requests.WithdrawalConfirmedRequest import Layer1WithdrawalConfirmedTransaction, WithdrawalConfirmedRequest
from Layer2Ledger.services.messages.Layer2Ledger.Responses.GetBalanceResponse import GetBalanceResponse
from Layer2Ledger.services.messages.Layer2Ledger.Responses.GetDepositAddressResponse import GetDepositAddressResponse
from Layer2Ledger.services.messages.Layer2Ledger.Requests.PostLayer1AuditReportRequest import PostLayer1AuditReportRequest, Layer1AddressBalance
from Layer2Ledger.services.messages.Layer2Ledger.Responses.GetLayer1AuditReportResponse import GetLayer1AuditReportResponse
from Layer2Ledger.services.messages.Layer2Ledger.Responses.GetWithdrawalRequestsResponse import GetWithdrawalRequestsResponse, WithdrawalRequest
import Layer2Ledger.core.signing_keys
import Layer2Ledger.core.KeyVerification as KeyVerification

#Imports for SQLAlchemy db classes
from Layer2Ledger.database.database import Base, get_db, AsyncSession, engine
import Layer2Ledger.core.Onboarding as Onboarding

from tests.TestsHelper import (
    generate_new_address,
    generate_nonce,
    is_successful_response,
    verify_get_new_deposit_address_procedure,
    verify_deposit_confirmed,
    verify_withdrawal_request_procedure,
    verify_withdrawal_confirmed_procedure,
    verify_layer2_transaction_procedure,
    drop_MasterPublicKeyIndex_DepositAddresses_tables,
)

@pytest_asyncio.fixture(scope="function")
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    connection = await engine.connect()
    transaction = await connection.begin()
    session = AsyncSession(bind=connection)

    def get_db_override():
        yield session

    fastapi_app.dependency_overrides[get_db] = get_db_override

    yield session

    await transaction.rollback()
    await connection.close()
    fastapi_app.dependency_overrides.clear()

@pytest_asyncio.fixture(scope="function")
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """
    Asynchronous test client for the FastAPI application.
    This fixture creates a new database session for each test, and rolls back
    the transaction at the end of the test to ensure test isolation.
    """
    def get_db_override():
        yield db_session

    fastapi_app.dependency_overrides[get_db] = get_db_override

    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url="http://test") as ac:
        yield ac

    fastapi_app.dependency_overrides.clear()



# This test will generate a new L2 address, get a new deposit address for it, simulate a deposit, and check the balance of the L2 address
@pytest.mark.asyncio
async def test_deposit_and_check_balance(client: AsyncClient, db_session: AsyncSession):
    
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
    response = await client.post('/getNewDepositAddress', json=get_deposit_address_request.model_dump())
    assert is_successful_response(response)
    await verify_get_new_deposit_address_procedure(db_session, l2_address.pubkey)
    deposit_address_response = GetDepositAddressResponse(**response.json())
    deposit_address = deposit_address_response.layer1_deposit_address
    
    # Simulate Layer1 deposit
    deposit_nonce = generate_nonce()
    deposit_amount = 1000
    layer1_transaction_id = generate_nonce()
    layer1_transaction_vout = 0
    deposit_message = KeyVerification.buildDepositMessage(layer1_transaction_id, layer1_transaction_vout, deposit_address, deposit_amount, deposit_nonce)
    onboarding_transaction_signing_address = Address.fromPrivateKey(config.Onboarding_Deposit_Address.private_key)
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
    response = await client.post('/depositFunds', json=deposit_data.model_dump())
    assert is_successful_response(response)

    await verify_deposit_confirmed(db_session, deposit_data)
    
    # Check balance of L2 address
    balance_request = GetBalanceRequest(public_keys=[l2_address.pubkey])
    response = await client.post('/getBalance', json=balance_request.model_dump())
    assert is_successful_response(response)
    balance_response = GetBalanceResponse(**response.json())
    balance = list(balance_response.balance)  # Ensure balance is a list
    assert len(balance) > 0
    assert balance[0].address_found is True
    assert balance[0].public_key == l2_address.pubkey
    assert balance[0].balance == deposit_amount

    print(f"Balance of L2 address {l2_address.pubkey}: {balance}")

# This test generates two new L2 addresses, gets a deposit address for the first L2 address, simulates a deposit,
# and transfers funds from the first L2 address to the second L2 address.
# The test ensures the final balance of the second L2 address is the transfer amount minus any fees.
@pytest.mark.asyncio
async def test_deposit_and_transfer(client: AsyncClient, db_session: AsyncSession):

    
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
    response = await client.post('/getNewDepositAddress', json=get_deposit_address_request.model_dump())
    assert is_successful_response(response)
    deposit_address_response = GetDepositAddressResponse(**response.json())
    deposit_address = deposit_address_response.layer1_deposit_address
    
    # Simulate Layer1 deposit
    deposit_nonce = generate_nonce()
    deposit_amount = 1000
    layer1_transaction_id = generate_nonce()
    layer1_transaction_vout = 0
    deposit_message = KeyVerification.buildDepositMessage(layer1_transaction_id, layer1_transaction_vout, deposit_address, deposit_amount, deposit_nonce)
    onboarding_transaction_signing_address = Address.fromPrivateKey(config.Onboarding_Deposit_Address.private_key)
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
    response = await client.post('/depositFunds', json=deposit_data.model_dump())
    assert is_successful_response(response)
    await verify_deposit_confirmed(db_session, deposit_data)
      
    # Check balance of L2 address 1
    balance_request = GetBalanceRequest(public_keys=[l2_address_1.pubkey])
    response = await client.post('/getBalance', json=balance_request.model_dump())
    assert is_successful_response(response)
    balance_response = GetBalanceResponse(**response.json())
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
    response = await client.post('/pushTransaction', json=transfer_request.model_dump())
    assert is_successful_response(response)
    await verify_layer2_transaction_procedure(db_session, transfer_request)
    
    # Check balance of L2 address 2
    balance_request = GetBalanceRequest(public_keys=[l2_address_2.pubkey])
    response = await client.post('/getBalance', json=balance_request.model_dump())
    assert is_successful_response(response)
    balance_response = GetBalanceResponse(**response.json())
    balance = list(balance_response.balance)
    assert len(balance) > 0
    assert balance[0].address_found is True
    assert balance[0].public_key == l2_address_2.pubkey
    assert balance[0].balance == transfer_amount - transfer_fee  # Ensure balance is transfer amount minus fees

    print(f"Balance of L2 address 2 {l2_address_2.pubkey}: {balance}")

# This test transfers funds and tests to see if it gets the transactions of a L2 address
@pytest.mark.asyncio
async def test_deposit_transfer_get_transactions(client: AsyncClient, db_session: AsyncSession):

    
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
    response = await client.post('/getNewDepositAddress', json=get_deposit_address_request.model_dump())
    assert is_successful_response(response)
    deposit_address_response = GetDepositAddressResponse(**response.json())
    deposit_address = deposit_address_response.layer1_deposit_address
    
    # Simulate Layer1 deposit
    deposit_nonce = generate_nonce()
    deposit_amount = 1000
    layer1_transaction_id = generate_nonce()
    layer1_transaction_vout = 0
    deposit_message = KeyVerification.buildDepositMessage(layer1_transaction_id, layer1_transaction_vout, deposit_address, deposit_amount, deposit_nonce)
    onboarding_transaction_signing_address = Address.fromPrivateKey(config.Onboarding_Deposit_Address.private_key)
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
    response = await client.post('/depositFunds', json=deposit_data.model_dump())
    assert is_successful_response(response)
    await verify_deposit_confirmed(db_session, deposit_data)
      
    # Check balance of L2 address 1
    balance_request = GetBalanceRequest(public_keys=[l2_address_1.pubkey])
    response = await client.post('/getBalance', json=balance_request.model_dump())
    assert is_successful_response(response)
    balance_response = GetBalanceResponse(**response.json())
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
    response = await client.post('/pushTransaction', json=transfer_request.model_dump())
    assert is_successful_response(response)
    await verify_layer2_transaction_procedure(db_session, transfer_request)

    # Verify the transaction was added to the L2 address's transaction history
    get_transactions_request: GetTransactionsRequest = GetTransactionsRequest(
        public_keys=[l2_address_1.pubkey]
    )
    response = await client.post('/getAllTransactionsOfPublicKey', json=get_transactions_request.model_dump())
    assert is_successful_response(response)
    

# This test generates a new L2 address, gets a deposit address, simulates a deposit, and withdraws to a new L1 address.
# The test ensures the final L2 balance is the deposit amount minus the withdrawal amount minus any fees.
@pytest.mark.asyncio
async def test_deposit_and_withdraw(client: AsyncClient, db_session: AsyncSession):

    
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
    response = await client.post('/getNewDepositAddress', json=get_deposit_address_request.model_dump())
    assert is_successful_response(response)
    await verify_get_new_deposit_address_procedure(db_session, l2_address.pubkey)
    deposit_address_response = GetDepositAddressResponse(**response.json())
    deposit_address = deposit_address_response.layer1_deposit_address
    
    # Simulate Layer1 deposit
    deposit_nonce = generate_nonce()
    deposit_amount = 10000
    layer1_transaction_id = generate_nonce()
    layer1_transaction_vout = 0
    deposit_message = KeyVerification.buildDepositMessage(layer1_transaction_id, layer1_transaction_vout, deposit_address, deposit_amount, deposit_nonce)
    onboarding_transaction_signing_address = Address.fromPrivateKey(config.Onboarding_Deposit_Address.private_key)
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
    response = await client.post('/depositFunds', json=deposit_data.model_dump())
    assert is_successful_response(response)
    await verify_deposit_confirmed(db_session, deposit_data)
    
    # Check balance of L2 address
    balance_request = GetBalanceRequest(public_keys=[l2_address.pubkey])
    response = await client.post('/getBalance', json=balance_request.model_dump())
    assert is_successful_response(response)
    balance_response = GetBalanceResponse(**response.json())
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
    response = await client.post('/withdrawalRequest', json=withdrawal_request.model_dump())
    assert is_successful_response(response)

    # The verify_withdrawal_request_procedure now takes db as an argument
    await verify_withdrawal_request_procedure(db_session, withdrawal_request)

    
    # Check final balance of L2 address
    response = await client.post('/getBalance', json=balance_request.model_dump())
    assert is_successful_response(response)
    balance_response = GetBalanceResponse(**response.json())
    balance = list(balance_response.balance)
    assert len(balance) > 0
    assert balance[0].address_found is True
    assert balance[0].public_key == l2_address.pubkey
    assert balance[0].balance == deposit_amount - withdrawal_amount # Ensure balance is correct

    print(f"Final balance of L2 address {l2_address.pubkey}: {balance}")

# This test generates a new L2 address, gets a deposit address, simulates a deposit, and withdraws to a new L1 address.
# Then simulates a Layer2Bridge Layer1 withdrawal broadcast, and checks to see if the withdrawal was added to ConfirmedWithdrawals with confirmed = False, and the layer2 Transaction.layer1_transaction_id is null
@pytest.mark.asyncio
async def test_deposit_and_withdraw_broadcast(client: AsyncClient, db_session: AsyncSession):


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
    response = await client.post('/getNewDepositAddress', json=get_deposit_address_request.model_dump())
    assert is_successful_response(response)
    await verify_get_new_deposit_address_procedure(db_session, l2_address.pubkey)
    deposit_address_response = GetDepositAddressResponse(**response.json())
    deposit_address = deposit_address_response.layer1_deposit_address

    # Simulate Layer1 deposit
    deposit_nonce = generate_nonce()
    deposit_amount = 10000
    layer1_transaction_id = generate_nonce()
    layer1_transaction_vout = 0
    deposit_message = KeyVerification.buildDepositMessage(layer1_transaction_id, layer1_transaction_vout, deposit_address, deposit_amount, deposit_nonce)
    onboarding_transaction_signing_address = Address.fromPrivateKey(config.Onboarding_Deposit_Address.private_key)
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
    response = await client.post('/depositFunds', json=deposit_data.model_dump())
    assert is_successful_response(response)
    await verify_deposit_confirmed(db_session, deposit_data)

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
    response = await client.post('/withdrawalRequest', json=withdrawal_request.model_dump())
    assert is_successful_response(response)

    await verify_withdrawal_request_procedure(db_session, withdrawal_request)

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
    response = await client.post('/withdrawalBroadcasted', json=broadcast_request.model_dump())
    assert is_successful_response(response)

    # Check if the broadcasted withdrawal was added to the database
    result = await db_session.execute(select(Onboarding.ConfirmedWithdrawals).filter(
        Onboarding.ConfirmedWithdrawals.layer1_transaction_id == layer1_transaction_id,
        Onboarding.ConfirmedWithdrawals.layer1_transaction_vout == layer1_transaction_vout,
    ))
    withdrawal_entry: Onboarding.ConfirmedWithdrawals = result.scalars().first()
    assert withdrawal_entry is not None

    # Check to see that it is not confirmed on layer1
    assert withdrawal_entry.confirmed is False

# This test generates a new L2 address, gets a deposit address, simulates a deposit, and withdraws to a new L1 address.
# Then simulates a Layer2Bridge Layer1 withdrawal broadcast.
# Then simulates a Layer2Bridge Layer1 withdrawal confirmed and checks to see if the withdrawal was added to ConfirmedWithdrawals with confirmed = True, and the layer2 Transaction.layer1_transaction_id is transaction_id of the confirmed withdrawal
@pytest.mark.asyncio
async def test_deposit_and_withdraw_broadcast_confirmed(client: AsyncClient, db_session: AsyncSession):


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
    response = await client.post('/getNewDepositAddress', json=get_deposit_address_request.model_dump())
    assert is_successful_response(response)
    await verify_get_new_deposit_address_procedure(db_session, l2_address.pubkey)
    deposit_address_response = GetDepositAddressResponse(**response.json())
    deposit_address = deposit_address_response.layer1_deposit_address

    await verify_get_new_deposit_address_procedure(db_session, l2_address.pubkey)

    # Simulate Layer1 deposit
    deposit_nonce = generate_nonce()
    deposit_amount = 10000
    layer1_transaction_id = generate_nonce()
    layer1_transaction_vout = 0
    deposit_message = KeyVerification.buildDepositMessage(layer1_transaction_id, layer1_transaction_vout, deposit_address, deposit_amount, deposit_nonce)
    onboarding_transaction_signing_address = Address.fromPrivateKey(config.Onboarding_Deposit_Address.private_key)
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
    response = await client.post('/depositFunds', json=deposit_data.model_dump())
    assert is_successful_response(response)
    await verify_deposit_confirmed(db_session, deposit_data)

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
    response = await client.post('/withdrawalRequest', json=withdrawal_request.model_dump())
    assert is_successful_response(response)

    await verify_withdrawal_request_procedure(db_session, withdrawal_request)

    #Simulate the Layer2Bridge querying the withdrawal request
    get_withdrawal_requests: GetWithdrawalRequestsRequest = GetWithdrawalRequestsRequest(
        latest_timestamp=timestamp_before_withdrawal
    )
    response = await client.post('/getWithdrawalRequests', json=get_withdrawal_requests.model_dump())
    assert is_successful_response(response)
    withdrawal_requests_response: GetWithdrawalRequestsResponse = GetWithdrawalRequestsResponse(**response.json())
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
    response = await client.post('/withdrawalBroadcasted', json=broadcast_request.model_dump())
    assert is_successful_response(response)

    # Check if the broadcasted withdrawal was added to the database
    result = await db_session.execute(select(Onboarding.ConfirmedWithdrawals).filter(
        Onboarding.ConfirmedWithdrawals.layer1_transaction_id == layer1_transaction_id,
        Onboarding.ConfirmedWithdrawals.layer1_transaction_vout == layer1_transaction_vout,
    ))
    withdrawal_entry: Onboarding.ConfirmedWithdrawals = result.scalars().first()
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
    response = await client.post('/withdrawalConfirmed', json=confirmed_request.model_dump())
    assert is_successful_response(response)
    await verify_withdrawal_confirmed_procedure(db_session, confirmed_request)
    

# Test for postLayer1AuditReport and getLayer1AuditReport
# Updated test to use the message building logic from verifyLayer1AuditReportSignature
@pytest.mark.asyncio
async def test_layer1_audit_report(client: AsyncClient, db_session: AsyncSession):

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
    onboarding_transaction_signing_address = Address.fromPrivateKey(config.Onboarding_Deposit_Address.private_key)
    signature = onboarding_transaction_signing_address.sign(message).decode('utf-8')

    post_audit_request = PostLayer1AuditReportRequest(
        block_height=block_height,
        layer1_address_balances=layer1_address_balances,
        signature=signature
    )

    # Post Layer1 Audit Report
    response = await client.post('/postLayer1AuditReport', json=post_audit_request.model_dump())
    assert is_successful_response(response)

    # Get Layer1 Audit Report
    response = await client.get(f"/getLayer1AuditReport?block_height={post_audit_request.block_height}")
    assert is_successful_response(response)

    # Validate response using Pydantic model
    audit_report_response = GetLayer1AuditReportResponse(**response.json())
    assert audit_report_response.blockHeight == post_audit_request.block_height
    assert audit_report_response.totalBalance == total_balance

    print(f"Audit report validated successfully: {audit_report_response}")

#Tests to make sure the first MPK/DepositAddress is generated correctly
@pytest.mark.asyncio
async def test_delete_mpk_table_get_deposit_address(client: AsyncClient, db_session: AsyncSession):


    # Delete the MPK table
    await drop_MasterPublicKeyIndex_DepositAddresses_tables(db_session)

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
    response = await client.post('/getNewDepositAddress', json=get_deposit_address_request.model_dump())
    assert is_successful_response(response)
    await verify_get_new_deposit_address_procedure(db_session, l2_address.pubkey)
    deposit_address_response = GetDepositAddressResponse(**response.json())

# This tests getting a deposit address twice for the same L2 address. 
# Ensure that the second call returns the same Layer 1 deposit address as the first call.
@pytest.mark.asyncio
async def test_generate_deposit_address_twice(client: AsyncClient, db_session: AsyncSession):


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
    response = await client.post('/getNewDepositAddress', json=get_deposit_address_request.model_dump())
    assert is_successful_response(response)
    await verify_get_new_deposit_address_procedure(db_session, l2_address.pubkey)
    
    deposit_address_response_1 = GetDepositAddressResponse(**response.json())
    deposit_address_1 = deposit_address_response_1.layer1_deposit_address

    # Get L1 deposit address for the second time
    response = await client.post('/getNewDepositAddress', json=get_deposit_address_request.model_dump())
    assert is_successful_response(response)
    
    deposit_address_response_2 = GetDepositAddressResponse(**response.json())
    deposit_address_2 = deposit_address_response_2.layer1_deposit_address

    # Ensure both responses have the same Layer 1 deposit address
    assert deposit_address_1 == deposit_address_2

@pytest.mark.parametrize("transaction_count", [10, 100, 1000])
@pytest.mark.asyncio
async def test_mass_transfer(client: AsyncClient, db_session: AsyncSession, transaction_count):
    """
    Deposits sats to one address and then transfers funds
    to n different addresses.
    """

    num_dest_addresses = transaction_count
    # 1. Deposit funds into a source address
    source_address = generate_new_address('Stress Test Source Address')
    deposit_amount = num_dest_addresses * 100
    
    # Get L1 deposit address
    nonce = generate_nonce()
    message = KeyVerification.buildGetDepositAddressMessage(source_address.pubkey, nonce)
    signature = source_address.sign(message)
    
    get_deposit_address_request = GetDepositAddressRequest(
        layer2_address_pubkey=source_address.pubkey,
        nonce=nonce,
        signature=signature
    )
    response = await client.post('/getNewDepositAddress', json=get_deposit_address_request.model_dump())
    assert is_successful_response(response)
    await verify_get_new_deposit_address_procedure(db_session, source_address.pubkey)
    deposit_address_response = GetDepositAddressResponse(**response.json())
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
    response = await client.post('/depositFunds', json=deposit_data.model_dump())
    assert is_successful_response(response)
    await verify_deposit_confirmed(db_session, deposit_data)

    # 2. Generate 100 destination addresses
    
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
        response = await client.post('/pushTransaction', json=transfer_request.model_dump())
        assert is_successful_response(response)

    # 4. Verify final balances
    # Verify source address balance
    balance_request = GetBalanceRequest(public_keys=[source_address.pubkey])
    response = await client.post('/getBalance', json=balance_request.model_dump())
    assert is_successful_response(response)
    balance_response = GetBalanceResponse(**response.json())
    source_balance = balance_response.balance[0]
    expected_source_balance = deposit_amount - (num_dest_addresses * amount_per_transfer)
    assert source_balance.balance == expected_source_balance

    # Verify destination addresses balances
    dest_pubkeys = [addr.pubkey for addr in destination_addresses]
    balance_request = GetBalanceRequest(public_keys=dest_pubkeys)
    response = await client.post('/getBalance', json=balance_request.model_dump())
    assert is_successful_response(response)
    balance_response = GetBalanceResponse(**response.json())
    
    for balance_info in balance_response.balance:
        assert balance_info.address_found is True
        assert balance_info.balance == amount_per_transfer - fee_per_transfer

if __name__ == '__main__':
    pytest.main()


@pytest.mark.asyncio
async def test_get_node_info(client: AsyncClient):
    """
    Test the /getNodeInfo endpoint.
    """
    response = await client.get('/getNodeInfo')
    assert response.status_code == 200
    response_data = response.json()
    assert response_data['error_code'] == 0
    assert 'node_info' in response_data
    node_info = response_data['node_info']
    assert 'node_id' in node_info
    assert 'node_asset_id' in node_info
    assert node_info['node_id'] == NODE_ID
    assert node_info['asset_id'] == NODE_ASSET_ID