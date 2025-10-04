import asyncio
import pytest
import httpx
import threading
from redis import Redis
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
import random
import uuid
import base58

from layer2ledgerbatched.layer2ledgerapihandler.main import app, TRANSFER_ROUTER_PREFIX
from layer2ledgerbatched.layer2ledgerapihandler.api.routes.transfer import CREATE_TRANSFER_ROUTE
from layer2ledgerbatched.common.db.models import Layer2AddressBalance, Transaction, TransactionType
from layer2ledgerbatched.layer2ledgerapihandler.api.models.requests.push_transaction_request import PushTransactionRequest
from layer2ledgerbatched.layer2ledgerapihandler.api.models.responses.common_response import CommonResponse
from layer2ledgerbatched.common.redis.redis_models.transactions import RedisTransaction, PendingTransaction, PENDING_TRANSACTIONS_LIST_KEY
from layer2ledgerbatched.layer2ledgerapihandler.utils.key_verification import buildTransferMessage
from layer2ledgerbatched.layer2ledgerapihandler.utils.layer2address import Layer2Address
import layer2ledgerbatched.layer2ledgerapihandler.utils.error_message as error_codes

from layer2ledgerbatched.layer2ledgerdbwriter.main import process_pending_transactions




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
async def test_create_transfer_success_inserted_into_redis(postgresql_session, redis_client: Redis, source_address: Layer2Address, dest_address: Layer2Address) -> None:
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
        response = await client.post(f"{TRANSFER_ROUTER_PREFIX}{CREATE_TRANSFER_ROUTE}", json=request.model_dump())

    # 4. Assert response
    assert response.status_code == 200
    response_model = CommonResponse.model_validate(response.json())
    assert response_model.error_code == error_codes.ERROR_SUCCESS

    # 5. Check Redis
    pending_tx_json = await redis_client.lpop(PENDING_TRANSACTIONS_LIST_KEY)
    assert pending_tx_json is not None
    
    pending_tx = PendingTransaction.model_validate_json(pending_tx_json)
    
    assert pending_tx.transaction.amount == amount
    assert pending_tx.transaction.source_address_pubkey == source_address.public_key_str_base58
    assert pending_tx.transaction.destination_address_pubkey == dest_address.public_key_str_base58
    assert pending_tx.transaction.layer2_transaction_id == transaction_id
    
    # Clean up redis
    await redis_client.delete(PENDING_TRANSACTIONS_LIST_KEY)

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
        response = await client.post(f"{TRANSFER_ROUTER_PREFIX}{CREATE_TRANSFER_ROUTE}", json=request.model_dump())

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
        response = await client.post(f"{TRANSFER_ROUTER_PREFIX}{CREATE_TRANSFER_ROUTE}", json=request.model_dump())

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
        response = await client.post(f"{TRANSFER_ROUTER_PREFIX}{CREATE_TRANSFER_ROUTE}", json=request.model_dump())

    # Assert response
    assert response.status_code == 200
    response_model = CommonResponse.model_validate(response.json())
    assert response_model.error_code == error_codes.ERROR_INVALID_DESTINATION_ADDRESS

# End to End transgfer processing test. Verify that layer2ledgerdbwriter processes the transaction from Redis to Postgres
@pytest.mark.asyncio
async def test_create_transfer_success_inserted_into_postgres(postgresql_session, redis_client: Redis, distributed_lock, source_address, dest_address) -> None:
    # 1. Create balance for source address
    initial_balance = 1000
    balance = Layer2AddressBalance(address=source_address.public_key_str_base58, balance=initial_balance)
    postgresql_session.add(balance)
    await postgresql_session.commit()

    # 2. Build transfer request
    transfer_amount = 100
    fee = 10
    transaction_id = str(uuid.uuid4())
    
    message = buildTransferMessage(
        source_pubkey=source_address.public_key_str_base58,
        destination_address_pubkey=dest_address.public_key_str_base58,
        amount=transfer_amount,
        fee=fee,
        nonce=transaction_id
    )
    
    signature = source_address.sign(message)

    request = PushTransactionRequest(
        amount=transfer_amount,
        destination_address_public_key=dest_address.public_key_str_base58,
        fee=fee,
        signature=signature,
        source_address_public_key=source_address.public_key_str_base58,
        transaction_id=transaction_id,
    )

    # 3. Call API
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(f"{TRANSFER_ROUTER_PREFIX}{CREATE_TRANSFER_ROUTE}", json=request.model_dump())

    # 4. Assert response
    assert response.status_code == 200
    response_model = CommonResponse.model_validate(response.json())
    assert response_model.error_code == error_codes.ERROR_SUCCESS

    # 5. Check Redis
    pending_tx_json = await redis_client.lrange(PENDING_TRANSACTIONS_LIST_KEY, 0, -1)
    assert pending_tx_json is not None
    
    pending_tx = PendingTransaction.model_validate_json(pending_tx_json[0])
    
    assert pending_tx.transaction.amount == transfer_amount
    assert pending_tx.transaction.source_address_pubkey == source_address.public_key_str_base58
    assert pending_tx.transaction.destination_address_pubkey == dest_address.public_key_str_base58
    assert pending_tx.transaction.layer2_transaction_id == transaction_id

    # run process_pending_transactions on a new thread, and wait for it to process
    def run_db_writer():
        asyncio.run(process_pending_transactions())
    db_writer_thread = threading.Thread(target=run_db_writer, daemon=True)
    db_writer_thread.start()

    # Wait for db writer to start and process
    await asyncio.sleep(3)

    #Refresh the postgresql session
    postgresql_session.expire_all()

    # 7. Verify in PostgreSQL that transaction is inserted

    inserted_transaction = await postgresql_session.execute(select(Transaction).where(Transaction.layer2_transaction_id == transaction_id))
    inserted_transaction = inserted_transaction.scalar_one_or_none()
    assert inserted_transaction is not None
    assert inserted_transaction.amount == transfer_amount

    # 8. Verify balances

    source_balance = await postgresql_session.execute(select(Layer2AddressBalance).where(Layer2AddressBalance.address == source_address.public_key_str_base58))
    source_balance = source_balance.scalar_one_or_none()
    assert source_balance is not None
    assert source_balance.balance == initial_balance - transfer_amount

    dest_balnce = await postgresql_session.execute(select(Layer2AddressBalance).where(Layer2AddressBalance.address == dest_address.public_key_str_base58))
    dest_balnce = dest_balnce.scalar_one_or_none()
    assert dest_balnce is not None
    assert dest_balnce.balance == transfer_amount


