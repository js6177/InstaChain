import asyncio
import pytest
import httpx
import threading
from redis.asyncio import Redis
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
import uuid

from layer2ledgerbatched.common.redis.redis_driver.distributed_lock import DistributedLock
import layer2ledgerbatched.common.redis.redis_driver.redis_driver as redis_driver
from layer2ledgerbatched.layer2ledgerapihandler.main import app, TRANSFER_ROUTER_PREFIX
from layer2ledgerbatched.layer2ledgerapihandler.api.routes.transfer import CREATE_TRANSFER_ROUTE
from layer2ledgerbatched.common.db.models import Layer2AddressBalance, Transaction
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
async def test_create_transfer_success_inserted_into_redis(postgresql_session: AsyncSession, redis_client: Redis, source_address: Layer2Address, dest_address: Layer2Address) -> None:
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

@pytest.mark.parametrize("n", [10])
@pytest.mark.asyncio
async def test_create_transfer_success_multiple(postgresql_session: AsyncSession, redis_client: Redis, source_address: Layer2Address, dest_address: Layer2Address, n: int) -> None:
    # 1. Create n source and n dest addresses
    source_addresses = [Layer2Address(f"source_address_{i}") for i in range(n)]
    dest_addresses = [Layer2Address(f"dest_address_{i}") for i in range(n)]
    for addr in source_addresses:
        addr.new_address()
    for addr in dest_addresses:
        addr.new_address()

    # 2. Create initial balances for source addresses
    initial_balance = 1000
    balances = [Layer2AddressBalance(address=addr.public_key_str_base58, balance=initial_balance) for addr in source_addresses]
    postgresql_session.add_all(balances)
    await postgresql_session.commit()

    # 3. Build and send n transfer requests
    transfer_amount = 100
    fee = 10
    transfer_requests: list[PushTransactionRequest] = []
    transaction_ids = [str(uuid.uuid4()) for _ in range(n)]

    for i in range(n):
        transfer_message = buildTransferMessage(
            source_pubkey=source_addresses[i].public_key_str_base58,
            destination_address_pubkey=dest_addresses[i].public_key_str_base58,
            amount=transfer_amount,
            fee=fee,
            nonce=transaction_ids[i]
        )
        signature = source_addresses[i].sign(transfer_message)
        transfer_request = PushTransactionRequest(
            amount=transfer_amount,
            destination_address_public_key=dest_addresses[i].public_key_str_base58,
            fee=fee,
            signature=signature,
            source_address_public_key=source_addresses[i].public_key_str_base58,
            transaction_id=transaction_ids[i],
        )
        
        transfer_requests.append(transfer_request)

        # 3. Call API
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(f"{TRANSFER_ROUTER_PREFIX}{CREATE_TRANSFER_ROUTE}", json=transfer_request.model_dump())

        # 4. Assert response
        assert response.status_code == 200
        response_model = CommonResponse.model_validate(response.json())
        assert response_model.error_code == error_codes.ERROR_SUCCESS

    # 5. Check Redis
    pending_trxs: list[PendingTransaction] = await redis_driver.GetPendingTransactions(redis_client, 0, -1)
    assert len(pending_trxs) == n

    # Clean up redis
    await redis_client.delete(PENDING_TRANSACTIONS_LIST_KEY)

@pytest.mark.asyncio
async def test_create_transfer_insufficient_funds(postgresql_session: AsyncSession, source_address: Layer2Address, dest_address: Layer2Address) -> None:
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
async def test_create_transfer_address_locked(redis_client: Redis, distributed_lock: DistributedLock, source_address: Layer2Address, dest_address: Layer2Address) -> None:
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
async def test_create_transfer_invalid_address(source_address: Layer2Address, dest_address: Layer2Address) -> None:
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

# End to End transfer processing test. Verify that layer2ledgerdbwriter processes the transaction from Redis to Postgres
@pytest.mark.asyncio
async def test_create_transfer_success_inserted_into_postgres(postgresql_session: AsyncSession, redis_client: Redis, distributed_lock: DistributedLock, source_address: Layer2Address, dest_address: Layer2Address) -> None:
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
    pending_trxs: list[PendingTransaction] = await redis_driver.GetPendingTransactions(redis_client, 0, -1)
    assert pending_trxs is not None

    pending_tx = pending_trxs[0]

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

@pytest.mark.parametrize("n", [100])
@pytest.mark.asyncio
async def test_create_multiple_transfers_end_to_end(postgresql_session: AsyncSession, redis_client: Redis, n: int) -> None:
    # 1. Create n source and n dest addresses
    source_addresses = [Layer2Address(f"source_address_{i}") for i in range(n)]
    dest_addresses = [Layer2Address(f"dest_address_{i}") for i in range(n)]
    for addr in source_addresses:
        addr.new_address()
    for addr in dest_addresses:
        addr.new_address()

    # 2. Create initial balances for source addresses
    initial_balance = 1000
    balances = [Layer2AddressBalance(address=addr.public_key_str_base58, balance=initial_balance) for addr in source_addresses]
    postgresql_session.add_all(balances)
    await postgresql_session.commit()

    # 3. Build and send n transfer requests
    transfer_amount = 100
    fee = 10
    requests: list[PushTransactionRequest] = []
    transaction_ids = [str(uuid.uuid4()) for _ in range(n)]

    for i in range(n):
        message = buildTransferMessage(
            source_pubkey=source_addresses[i].public_key_str_base58,
            destination_address_pubkey=dest_addresses[i].public_key_str_base58,
            amount=transfer_amount,
            fee=fee,
            nonce=transaction_ids[i]
        )
        signature = source_addresses[i].sign(message)
        requests.append(PushTransactionRequest(
            amount=transfer_amount,
            destination_address_public_key=dest_addresses[i].public_key_str_base58,
            fee=fee,
            signature=signature,
            source_address_public_key=source_addresses[i].public_key_str_base58,
            transaction_id=transaction_ids[i],
        ))

    start_time_fastaopi_requests = asyncio.get_event_loop().time()

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        tasks = [client.post(f"{TRANSFER_ROUTER_PREFIX}{CREATE_TRANSFER_ROUTE}", json=req.model_dump()) for req in requests]
        responses = await asyncio.gather(*tasks)

    # 4. Assert all responses are successful
    for response in responses:
        assert response.status_code == 200
        response_model = CommonResponse.model_validate(response.json())
        assert response_model.error_code == error_codes.ERROR_SUCCESS

    end_time_fastaopi_requests = asyncio.get_event_loop().time()
    fastapi_duration = end_time_fastaopi_requests - start_time_fastaopi_requests
    print(f"Time taken to send {n} requests: {fastapi_duration} seconds")

    # 5. Check Redis for n pending transactions
    pending_txs: list[PendingTransaction] = await redis_driver.GetPendingTransactions(redis_client, 0, -1)
    assert len(pending_txs) == n

    # 6. Run DB writer and wait for processing
    def run_db_writer():
        asyncio.run(process_pending_transactions())
    db_writer_thread = threading.Thread(target=run_db_writer, daemon=True)
    db_writer_thread.start()
    await asyncio.sleep(10) # Wait for db writer to process all transactions

    # 7. Verify transaction count in PostgreSQL
    postgresql_session.expire_all()
    transaction_count = await postgresql_session.execute(select(func.count()).select_from(Transaction))
    assert transaction_count.scalar() == n

    # 8. Verify balances
    for i in range(n):
        source_balance = await postgresql_session.execute(select(Layer2AddressBalance).where(Layer2AddressBalance.address == source_addresses[i].public_key_str_base58))
        source_balance = source_balance.scalar_one_or_none()
        assert source_balance is not None
        assert source_balance.balance == initial_balance - transfer_amount

        dest_balance = await postgresql_session.execute(select(Layer2AddressBalance).where(Layer2AddressBalance.address == dest_addresses[i].public_key_str_base58))
        dest_balance = dest_balance.scalar_one_or_none()
        assert dest_balance is not None
        assert dest_balance.balance == transfer_amount
