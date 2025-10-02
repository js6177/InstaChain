import pytest
import httpx
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
import random
import uuid
import base58

from layer2ledgerbatched.layer2ledgerapihandler.main import app
from layer2ledgerbatched.common.db.models import Layer2AddressBalance
from layer2ledgerbatched.layer2ledgerapihandler.api.models.requests.push_transaction_request import PushTransactionRequest
from layer2ledgerbatched.layer2ledgerapihandler.api.models.responses.common_response import CommonResponse
from layer2ledgerbatched.common.redis.redis_models.transactions import PendingTransaction
from layer2ledgerbatched.layer2ledgerapihandler.utils.key_verification import buildTransferMessage
from layer2ledgerbatched.layer2ledgerapihandler.utils.layer2address import Layer2Address
import layer2ledgerbatched.layer2ledgerapihandler.utils.error_message as error_codes


@pytest.fixture(scope="module")
def source_address() -> Layer2Address:
    addr = Layer2Address("source_address")
    addr.new_address()
    return addr

@pytest.fixture(scope="module")
def dest_address() -> Layer2Address:
    addr = Layer2Address("dest_address")
    addr.new_address()
    return addr


@pytest.mark.asyncio
async def test_create_transfer_success(postgresql_session, redis_client, source_address, dest_address) -> None:
    # 1. Create balance for source address
    initial_balance = 1000
    balance = Layer2AddressBalance(address=source_address.public_key_str_base58, balance=initial_balance)
    postgresql_session.add(balance)
    await postgresql_session.commit()

    # 2. Build transfer request
    amount = 100
    fee = 10
    transaction_id = str(uuid.uuid4())
    
    message = buildTransferMessage(
        source_pubkey=source_address.public_key_str_base58,
        destination_address_pubkey=dest_address.public_key_str_base58,
        amount=amount,
        fee=fee,
        nonce=transaction_id
    )
    
    signature = source_address.sign(message)

    request = PushTransactionRequest(
        amount=amount,
        destination_address_public_key=dest_address.public_key_str_base58,
        fee=fee,
        signature=signature,
        source_address_public_key=source_address.public_key_str_base58,
        transaction_id=transaction_id,
    )

    # 3. Call API
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/transfer/transfer", json=request.model_dump())

    # 4. Assert response
    assert response.status_code == 200
    response_model = CommonResponse.model_validate(response.json())
    assert response_model.error_code == 0
    assert response_model.error_message == "Confirmed, pending insertion into db"

    # 5. Check Redis
    pending_tx_json = await redis_client.lpop("PendingTransactions")
    assert pending_tx_json is not None
    
    pending_tx = PendingTransaction.parse_raw(pending_tx_json)
    
    assert pending_tx.transaction.amount == amount
    assert pending_tx.transaction.source_address_pubkey == source_address.public_key_str_base58
    assert pending_tx.transaction.destination_address_pubkey == dest_address.public_key_str_base58
    assert pending_tx.transaction.layer2_transaction_id == transaction_id
    
    # Clean up redis
    await redis_client.delete("PendingTransactions")

@pytest.mark.asyncio
async def test_create_transfer_insufficient_funds(postgresql_session, source_address, dest_address) -> None:
    # 1. Create balance for source address
    initial_balance = 50
    upsert_stmt = pg_insert(Layer2AddressBalance).values(address=source_address.public_key_str_base58, balance=initial_balance)
    upsert_stmt = upsert_stmt.on_conflict_do_update(index_elements=['address'], set_=dict(balance=upsert_stmt.excluded.balance))
    await postgresql_session.execute(upsert_stmt)
    await postgresql_session.commit()

    # 2. Build transfer request
    amount = 100
    fee = 10
    transaction_id = str(uuid.uuid4())
    
    message = buildTransferMessage(
        source_pubkey=source_address.public_key_str_base58,
        destination_address_pubkey=dest_address.public_key_str_base58,
        amount=amount,
        fee=fee,
        nonce=transaction_id
    )
    
    signature = source_address.sign(message)

    request = PushTransactionRequest(
        amount=amount,
        destination_address_public_key=dest_address.public_key_str_base58,
        fee=fee,
        signature=signature,
        source_address_public_key=source_address.public_key_str_base58,
        transaction_id=transaction_id,
    )

    # 3. Call API
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/transfer/transfer", json=request.model_dump())

    # 4. Assert response
    assert response.status_code == 200
    response_model = CommonResponse.model_validate(response.json())
    assert response_model.error_code == error_codes.ERROR_INSUFFICIENT_FUNDS

@pytest.mark.asyncio
async def test_create_transfer_address_locked(redis_client, distributed_lock, source_address, dest_address) -> None:
    # 1. Lock one of the addresses
    lock_token = await distributed_lock.acquire_multi_lock([source_address.public_key_str_base58])

    # 2. Build transfer request
    amount = 100
    fee = 10
    transaction_id = str(uuid.uuid4())
    
    message = buildTransferMessage(
        source_pubkey=source_address.public_key_str_base58,
        destination_address_pubkey=dest_address.public_key_str_base58,
        amount=amount,
        fee=fee,
        nonce=transaction_id
    )
    
    signature = source_address.sign(message)

    request = PushTransactionRequest(
        amount=amount,
        destination_address_public_key=dest_address.public_key_str_base58,
        fee=fee,
        signature=signature,
        source_address_public_key=source_address.public_key_str_base58,
        transaction_id=transaction_id,
    )

    # 3. Call API
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/transfer/transfer", json=request.model_dump())

    # 4. Assert response
    assert response.status_code == 200
    response_model = CommonResponse.model_validate(response.json())
    assert response_model.error_code == error_codes.ERROR_ADDRESS_LOCKED

    # 5. Clean up
    await distributed_lock.release_multi_lock([source_address.public_key_str_base58], lock_token)

@pytest.mark.asyncio
async def test_create_transfer_invalid_address(source_address, dest_address) -> None:
    # Build transfer request
    amount = 100
    fee = 10
    transaction_id = str(uuid.uuid4())
    
    request = PushTransactionRequest(
        amount=amount,
        destination_address_public_key="invalid-address",
        fee=fee,
        signature="dummy_sig",
        source_address_public_key=source_address.public_key_str_base58,
        transaction_id=transaction_id,
    )

    # Call API
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/transfer/transfer", json=request.model_dump())

    # Assert response
    assert response.status_code == 200
    response_model = CommonResponse.model_validate(response.json())
    assert response_model.error_code == error_codes.ERROR_INVALID_DESTINATION_ADDRESS
