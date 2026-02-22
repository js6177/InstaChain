import asyncio
from config_models import Layer2BridgeSettings
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
from layer2ledgerbatched.layer2ledgerapihandler.main import app
from layer2ledgerbatched.layer2ledgerapihandler.api.routes.route_defs import (
    WITHDRAWAL_ROUTER_PREFIX, REQUEST_WITHDRAWAL_ROUTE, GET_WITHDRAWAL_REQUESTS_ROUTE, 
    WITHDRAWAL_BROADCASTED_ROUTE, WITHDRAWAL_CONFIRMED_ROUTE
)
from layer2ledgerbatched.common.db.models import Layer2AddressBalance, Transaction, WithdrawalRequests, ConfirmedWithdrawals, WithdrawalStatus
from layer2ledgerbatched.layer2ledgerapihandler.api.models.requests.request_withdrawal_request import RequestWithdrawalRequest
from layer2ledgerbatched.layer2ledgerapihandler.api.models.responses.common_response import CommonResponse
from layer2ledgerbatched.common.redis.redis_models.withdrawal import PendingWithdrawal, PENDING_WITHDRAWALS_LIST_KEY
from layer2ledgerbatched.layer2ledgerapihandler.utils.key_verification import buildWithdrawalRequestMessage, buildWithdrawalBroadcastedMessage, buildWithdrawalConfirmedMessage
from layer2ledgerbatched.layer2ledgerapihandler.utils.layer2address import Layer2Address
import layer2ledgerbatched.layer2ledgerapihandler.utils.error_message as error_codes

from layer2ledgerbatched.layer2ledgerdbwriter.main import process_pending_transactions


@pytest.fixture(scope="module")
def source_address() -> Layer2Address:
    addr = Layer2Address("source_address")
    addr.new_address()
    return addr

@pytest.fixture(scope="module")
def layer1_address() -> str:
    return "tb1qxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

@pytest.fixture(scope="module")
def bridge_address() -> Layer2Address:
    # In a real scenario, this would be loaded from config
    bridge_settings: Layer2BridgeSettings = get_layer2bridge_settings()
    addr = Layer2Address("bridge_address")
    addr.from_private_key(bridge_settings.onboarding_signing_private_key)
    return addr


from layer2ledgerbatched.layer2ledgerapihandler.config.config import Layer2LedgerAPIHandlerSettings, get_layer2bridge_settings

# Tests a simple withdrawal flow: request withdrawal, broadcast, confirm
@pytest.mark.asyncio
async def test_withdrawal_flow(postgresql_session: AsyncSession, redis_client: Redis, source_address: Layer2Address, bridge_address: Layer2Address, layer1_address: str, layer2ledgerapihandler_settings: Layer2LedgerAPIHandlerSettings) -> None:
    # 1. Create balance for source address
    initial_balance = 1000
    balance = Layer2AddressBalance(address=source_address.public_key_str_base58, balance=initial_balance)
    postgresql_session.add(balance)
    await postgresql_session.commit()

    # 2. Request withdrawal
    amount = 100
    transaction_id = str(uuid.uuid4())
    
    message = buildWithdrawalRequestMessage(
        source_pubkey=source_address.public_key_str_base58,
        withdrawal_address=layer1_address,
        amount=amount,
        nonce=transaction_id
    )
    
    signature = source_address.sign(message)

    request = RequestWithdrawalRequest(
        amount=amount,
        layer1_withdrawal_address=layer1_address,
        layer2_transaction_id=transaction_id,
        signature=signature,
        source_address_public_key=source_address.public_key_str_base58,
    )

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(f"{WITHDRAWAL_ROUTER_PREFIX}{REQUEST_WITHDRAWAL_ROUTE}", json=request.model_dump())

    assert response.status_code == 200
    response_model = CommonResponse.model_validate(response.json())
    assert response_model.error_code == error_codes.ERROR_SUCCESS

    # 3. Check Redis for pending withdrawal
    pending_withdrawal_json = await redis_client.lpop(PENDING_WITHDRAWALS_LIST_KEY)
    assert pending_withdrawal_json is not None
    
    pending_withdrawal = PendingWithdrawal.model_validate_json(pending_withdrawal_json)
    layer2_withdrawal_id = pending_withdrawal.withdrawal_request.layer2_withdrawal_id
    
    assert pending_withdrawal.transaction.amount == amount
    assert pending_withdrawal.transaction.source_address_pubkey == source_address.public_key_str_base58
    assert pending_withdrawal.withdrawal_request.layer1_address == layer1_address
    assert pending_withdrawal.withdrawal_request.layer2_withdrawal_id.startswith("w_")

    # 4. Run DB writer to process withdrawal
    await redis_client.rpush(PENDING_WITHDRAWALS_LIST_KEY, pending_withdrawal.model_dump_json())
    def run_db_writer():
        asyncio.run(process_pending_transactions())
    db_writer_thread = threading.Thread(target=run_db_writer, daemon=True)
    db_writer_thread.start()
    await asyncio.sleep(3)

    # 5. Get withdrawal requests
    from layer2ledgerbatched.layer2ledgerapihandler.api.models.requests.get_withdrawal_requests_request import GetWithdrawalRequestsRequest
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(f"{WITHDRAWAL_ROUTER_PREFIX}{GET_WITHDRAWAL_REQUESTS_ROUTE}", json=GetWithdrawalRequestsRequest(latest_timestamp=0).model_dump())

    assert response.status_code == 200
    from layer2ledgerbatched.layer2ledgerapihandler.api.models.responses.get_withdrawal_requests_response import GetWithdrawalRequestsResponse
    response_model = GetWithdrawalRequestsResponse.model_validate(response.json())
    assert response_model.error_code == error_codes.ERROR_SUCCESS
    assert len(response_model.withdrawal_requests) == 1
    withdrawal_request = response_model.withdrawal_requests[0]
    assert withdrawal_request.status == WithdrawalStatus.WITHDRAWAL_STATUS_ACKNOWLEDGED

    # 6. Broadcast withdrawal
    layer1_transaction_id = "l1_tx_id_123"
    layer1_transaction_vout = 0
    
    
    broadcast_message = buildWithdrawalBroadcastedMessage(
        layer1_transaction_id=layer1_transaction_id,
        layer1_transaction_vout=layer1_transaction_vout,
        layer1_address=layer1_address,
        amount=amount,
        withdrawal_id=layer2_withdrawal_id
    )
    broadcast_signature = bridge_address.sign(broadcast_message)
    
    from layer2ledgerbatched.layer2ledgerapihandler.api.models.requests.withdrawal_broadcasted_request import WithdrawalBroadcastedRequest, Layer1BroadcastedWithdrawalTransaction
    broadcasted_tx = Layer1BroadcastedWithdrawalTransaction(
        layer1_transaction_id=layer1_transaction_id,
        layer1_transaction_vout=layer1_transaction_vout,
        layer1_address=layer1_address,
        amount=amount,
        layer2_withdrawal_id=layer2_withdrawal_id,
        signature=broadcast_signature
    )
    broadcasted_request = WithdrawalBroadcastedRequest(transactions=[broadcasted_tx])

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(f"{WITHDRAWAL_ROUTER_PREFIX}{WITHDRAWAL_BROADCASTED_ROUTE}", json=broadcasted_request.model_dump())

    assert response.status_code == 200
    from layer2ledgerbatched.layer2ledgerapihandler.api.models.responses.withdrawal_broadcasted_response import WithdrawalBroadcastedResponse
    response_model = WithdrawalBroadcastedResponse.model_validate(response.json())
    assert response_model.error_code == error_codes.ERROR_SUCCESS
    assert response_model.transactions[0].error_code == error_codes.ERROR_SUCCESS

    # 7. Confirm withdrawal
    confirmed_message = buildWithdrawalConfirmedMessage(
        layer1_transaction_id=layer1_transaction_id,
        layer1_transaction_vout=layer1_transaction_vout,
        layer1_address=layer1_address,
        amount=amount
    )
    confirmed_signature = bridge_address.sign(confirmed_message)
    
    from layer2ledgerbatched.layer2ledgerapihandler.api.models.requests.withdrawal_confirmed_request import WithdrawalConfirmedRequest, Layer1WithdrawalConfirmedTransaction
    confirmed_tx = Layer1WithdrawalConfirmedTransaction(
        layer1_transaction_id=layer1_transaction_id,
        layer1_transaction_vout=layer1_transaction_vout,
        layer1_address=layer1_address,
        amount=amount,
        signature=confirmed_signature
    )
    confirmed_request = WithdrawalConfirmedRequest(transactions=[confirmed_tx])

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(f"{WITHDRAWAL_ROUTER_PREFIX}{WITHDRAWAL_CONFIRMED_ROUTE}", json=confirmed_request.model_dump())

    assert response.status_code == 200
    from layer2ledgerbatched.layer2ledgerapihandler.api.models.responses.withdrawal_confirmed_response import WithdrawalConfirmedResponse
    response_model = WithdrawalConfirmedResponse.model_validate(response.json())
    assert response_model.error_code == error_codes.ERROR_SUCCESS
    assert response_model.transactions[0].error_code == error_codes.ERROR_SUCCESS

    # 8. Check DB
    withdrawal_req = await postgresql_session.execute(select(WithdrawalRequests).where(WithdrawalRequests.layer2_withdrawal_id == layer2_withdrawal_id))
    withdrawal_req = withdrawal_req.scalar_one_or_none()
    assert withdrawal_req is not None
    assert withdrawal_req.status == WithdrawalStatus.WITHDRAWAL_STATUS_CONFIRMED

    confirmed_withdrawal = await postgresql_session.execute(select(ConfirmedWithdrawals).where(ConfirmedWithdrawals.layer2_withdrawal_id == layer2_withdrawal_id))
    confirmed_withdrawal = confirmed_withdrawal.scalar_one_or_none()
    assert confirmed_withdrawal is not None
    assert confirmed_withdrawal.confirmed == True

# Tests multiple withdrawals from a layer2 address to the same layer1 address
@pytest.mark.asyncio
async def test_multiple_withdrawals_to_same_layer1_address(postgresql_session: AsyncSession, redis_client: Redis, source_address: Layer2Address, bridge_address: Layer2Address, layer1_address: str, layer2ledgerapihandler_settings: Layer2LedgerAPIHandlerSettings) -> None:
    num_withdrawals = 3
    
    # 1. Create balance for source address
    initial_balance = sum(100 * (i + 1) for i in range(num_withdrawals)) + 1000
    balance_stmt = pg_insert(Layer2AddressBalance).values(
        address=source_address.public_key_str_base58,
        balance=initial_balance
    ).on_conflict_do_update(
        index_elements=['address'],
        set_=dict(balance=initial_balance)
    )
    await postgresql_session.execute(balance_stmt)
    await postgresql_session.commit()

    # 2. Start DB writer thread once
    def run_db_writer():
        asyncio.run(process_pending_transactions())
    db_writer_thread = threading.Thread(target=run_db_writer, daemon=True)
    db_writer_thread.start()
    await asyncio.sleep(1)

    withdrawal_amounts: list[int] = []
    total_amount = 0

    # 3. Create and process withdrawal requests in a loop
    for i in range(num_withdrawals):
        amount = 100 * (i + 1)
        withdrawal_amounts.append(amount)
        total_amount += amount
        transaction_id = str(uuid.uuid4())
        
        message = buildWithdrawalRequestMessage(
            source_pubkey=source_address.public_key_str_base58,
            withdrawal_address=layer1_address,
            amount=amount,
            nonce=transaction_id
        )
        signature = source_address.sign(message)

        request = RequestWithdrawalRequest(
            amount=amount,
            layer1_withdrawal_address=layer1_address,
            layer2_transaction_id=transaction_id,
            signature=signature,
            source_address_public_key=source_address.public_key_str_base58,
        )

        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(f"{WITHDRAWAL_ROUTER_PREFIX}{REQUEST_WITHDRAWAL_ROUTE}", json=request.model_dump())

        assert response.status_code == 200
        response_model = CommonResponse.model_validate(response.json())
        assert response_model.error_code == error_codes.ERROR_SUCCESS

        # Wait for the db_writer to process the item and release the lock
        await asyncio.sleep(1)

    # 4. Get withdrawal requests
    from layer2ledgerbatched.layer2ledgerapihandler.api.models.requests.get_withdrawal_requests_request import GetWithdrawalRequestsRequest
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(f"{WITHDRAWAL_ROUTER_PREFIX}{GET_WITHDRAWAL_REQUESTS_ROUTE}", json=GetWithdrawalRequestsRequest(latest_timestamp=0).model_dump())

    assert response.status_code == 200
    from layer2ledgerbatched.layer2ledgerapihandler.api.models.responses.get_withdrawal_requests_response import GetWithdrawalRequestsResponse
    response_model = GetWithdrawalRequestsResponse.model_validate(response.json())
    assert response_model.error_code == error_codes.ERROR_SUCCESS
    assert len(response_model.withdrawal_requests) == num_withdrawals
    
    req_map = {req.amount: req.layer2_withdrawal_id for req in response_model.withdrawal_requests}
    layer2_withdrawal_ids = [req_map[amount] for amount in withdrawal_amounts]

    for req in response_model.withdrawal_requests:
        assert req.status == WithdrawalStatus.WITHDRAWAL_STATUS_ACKNOWLEDGED

    # 5. Broadcast withdrawal (batched)
    layer1_transaction_id = "l1_tx_id_batched_789"
    layer1_transaction_vout = 0
    

    broadcasted_txs: list[Layer1BroadcastedWithdrawalTransaction] = []
    for i in range(num_withdrawals):
        amount = withdrawal_amounts[i]
        withdrawal_id = layer2_withdrawal_ids[i]
        
        broadcast_message = buildWithdrawalBroadcastedMessage(
            layer1_transaction_id=layer1_transaction_id,
            layer1_transaction_vout=layer1_transaction_vout,
            layer1_address=layer1_address,
            amount=amount,
            withdrawal_id=withdrawal_id
        )
        broadcast_signature = bridge_address.sign(broadcast_message)

        from layer2ledgerbatched.layer2ledgerapihandler.api.models.requests.withdrawal_broadcasted_request import WithdrawalBroadcastedRequest, Layer1BroadcastedWithdrawalTransaction
        broadcasted_tx = Layer1BroadcastedWithdrawalTransaction(
            layer1_transaction_id=layer1_transaction_id,
            layer1_transaction_vout=layer1_transaction_vout,
            layer1_address=layer1_address,
            amount=amount,
            layer2_withdrawal_id=withdrawal_id,
            signature=broadcast_signature
        )
        broadcasted_txs.append(broadcasted_tx)

    broadcasted_request = WithdrawalBroadcastedRequest(transactions=broadcasted_txs)

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(f"{WITHDRAWAL_ROUTER_PREFIX}{WITHDRAWAL_BROADCASTED_ROUTE}", json=broadcasted_request.model_dump())

    assert response.status_code == 200
    from layer2ledgerbatched.layer2ledgerapihandler.api.models.responses.withdrawal_broadcasted_response import WithdrawalBroadcastedResponse
    response_model = WithdrawalBroadcastedResponse.model_validate(response.json())
    assert response_model.error_code == error_codes.ERROR_SUCCESS
    assert len(response_model.transactions) == num_withdrawals
    for tx in response_model.transactions:
        assert tx.error_code == error_codes.ERROR_SUCCESS

    # 6. Confirm withdrawal
    confirmed_message = buildWithdrawalConfirmedMessage(
        layer1_transaction_id=layer1_transaction_id,
        layer1_transaction_vout=layer1_transaction_vout,
        layer1_address=layer1_address,
        amount=total_amount
    )
    confirmed_signature = bridge_address.sign(confirmed_message)
    
    from layer2ledgerbatched.layer2ledgerapihandler.api.models.requests.withdrawal_confirmed_request import WithdrawalConfirmedRequest, Layer1WithdrawalConfirmedTransaction
    confirmed_tx = Layer1WithdrawalConfirmedTransaction(
        layer1_transaction_id=layer1_transaction_id,
        layer1_transaction_vout=layer1_transaction_vout,
        layer1_address=layer1_address,
        amount=total_amount,
        signature=confirmed_signature
    )
    confirmed_request = WithdrawalConfirmedRequest(transactions=[confirmed_tx])

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(f"{WITHDRAWAL_ROUTER_PREFIX}{WITHDRAWAL_CONFIRMED_ROUTE}", json=confirmed_request.model_dump())

    assert response.status_code == 200
    from layer2ledgerbatched.layer2ledgerapihandler.api.models.responses.withdrawal_confirmed_response import WithdrawalConfirmedResponse
    response_model = WithdrawalConfirmedResponse.model_validate(response.json())
    assert response_model.error_code == error_codes.ERROR_SUCCESS
    assert len(response_model.transactions) == 1
    assert response_model.transactions[0].error_code == error_codes.ERROR_SUCCESS

    # 7. Check DB
    withdrawal_reqs = await postgresql_session.execute(select(WithdrawalRequests).where(WithdrawalRequests.layer2_withdrawal_id.in_(layer2_withdrawal_ids)))
    withdrawal_reqs = withdrawal_reqs.scalars().all()
    assert len(withdrawal_reqs) == num_withdrawals
    for req in withdrawal_reqs:
        assert req.status == WithdrawalStatus.WITHDRAWAL_STATUS_CONFIRMED

    confirmed_withdrawals = await postgresql_session.execute(select(ConfirmedWithdrawals).where(ConfirmedWithdrawals.layer2_withdrawal_id.in_(layer2_withdrawal_ids)))
    confirmed_withdrawals = confirmed_withdrawals.scalars().all()
    assert len(confirmed_withdrawals) == num_withdrawals
    for cw in confirmed_withdrawals:
        assert cw.confirmed == True
        assert cw.layer1_transaction_id == layer1_transaction_id

# Test multiple withdrawals from different layer2 addresses to the same layer1 address
@pytest.mark.asyncio
async def test_multiple_withdrawals_from_different_layer2_addresses(postgresql_session: AsyncSession, redis_client: Redis, layer1_address: str, bridge_address: Layer2Address, layer2ledgerapihandler_settings: Layer2LedgerAPIHandlerSettings) -> None:
    num_withdrawals = 3
    
    # 1. Create and fund multiple source addresses
    source_addresses: list[Layer2Address] = []
    for i in range(num_withdrawals):
        addr = Layer2Address(f"source_address_{i}")
        addr.new_address()
        source_addresses.append(addr)

    initial_balance = 1000 # Each address will have this balance
    for addr in source_addresses:
        balance_stmt = pg_insert(Layer2AddressBalance).values(
            address=addr.public_key_str_base58,
            balance=initial_balance
        ).on_conflict_do_update(
            index_elements=['address'],
            set_=dict(balance=initial_balance)
        )
        await postgresql_session.execute(balance_stmt)
    await postgresql_session.commit()

    # 2. Start DB writer thread once
    def run_db_writer():
        asyncio.run(process_pending_transactions())
    db_writer_thread = threading.Thread(target=run_db_writer, daemon=True)
    db_writer_thread.start()
    await asyncio.sleep(1)

    withdrawal_amounts: list[int] = []
    total_amount = 0

    # 3. Create withdrawal requests from different addresses
    for i in range(num_withdrawals):
        source_addr = source_addresses[i]
        amount = 100 * (i + 1)
        withdrawal_amounts.append(amount)
        total_amount += amount
        transaction_id = str(uuid.uuid4())
        
        message = buildWithdrawalRequestMessage(
            source_pubkey=source_addr.public_key_str_base58,
            withdrawal_address=layer1_address,
            amount=amount,
            nonce=transaction_id
        )
        signature = source_addr.sign(message)

        request = RequestWithdrawalRequest(
            amount=amount,
            layer1_withdrawal_address=layer1_address,
            layer2_transaction_id=transaction_id,
            signature=signature,
            source_address_public_key=source_addr.public_key_str_base58,
        )

        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(f"{WITHDRAWAL_ROUTER_PREFIX}{REQUEST_WITHDRAWAL_ROUTE}", json=request.model_dump())

        assert response.status_code == 200
        response_model = CommonResponse.model_validate(response.json())
        assert response_model.error_code == error_codes.ERROR_SUCCESS

    # Wait for the db_writer to process all items
    await asyncio.sleep(3)

    # 4. Get withdrawal requests
    from layer2ledgerbatched.layer2ledgerapihandler.api.models.requests.get_withdrawal_requests_request import GetWithdrawalRequestsRequest
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(f"{WITHDRAWAL_ROUTER_PREFIX}{GET_WITHDRAWAL_REQUESTS_ROUTE}", json=GetWithdrawalRequestsRequest(latest_timestamp=0).model_dump())

    assert response.status_code == 200
    from layer2ledgerbatched.layer2ledgerapihandler.api.models.responses.get_withdrawal_requests_response import GetWithdrawalRequestsResponse
    response_model = GetWithdrawalRequestsResponse.model_validate(response.json())
    assert response_model.error_code == error_codes.ERROR_SUCCESS
    assert len(response_model.withdrawal_requests) == num_withdrawals
    
    req_map = {req.amount: req.layer2_withdrawal_id for req in response_model.withdrawal_requests}
    layer2_withdrawal_ids = [req_map[amount] for amount in withdrawal_amounts]

    for req in response_model.withdrawal_requests:
        assert req.status == WithdrawalStatus.WITHDRAWAL_STATUS_ACKNOWLEDGED

    # 5. Broadcast withdrawal (batched)
    layer1_transaction_id = "l1_tx_id_batched_multi_source_123"
    layer1_transaction_vout = 0

    broadcasted_txs: list[Layer1BroadcastedWithdrawalTransaction] = []
    for i in range(num_withdrawals):
        amount = withdrawal_amounts[i]
        withdrawal_id = layer2_withdrawal_ids[i]
        
        broadcast_message = buildWithdrawalBroadcastedMessage(
            layer1_transaction_id=layer1_transaction_id,
            layer1_transaction_vout=layer1_transaction_vout,
            layer1_address=layer1_address,
            amount=amount,
            withdrawal_id=withdrawal_id
        )
        broadcast_signature = bridge_address.sign(broadcast_message)

        from layer2ledgerbatched.layer2ledgerapihandler.api.models.requests.withdrawal_broadcasted_request import WithdrawalBroadcastedRequest, Layer1BroadcastedWithdrawalTransaction
        broadcasted_tx = Layer1BroadcastedWithdrawalTransaction(
            layer1_transaction_id=layer1_transaction_id,
            layer1_transaction_vout=layer1_transaction_vout,
            layer1_address=layer1_address,
            amount=amount,
            layer2_withdrawal_id=withdrawal_id,
            signature=broadcast_signature
        )
        broadcasted_txs.append(broadcasted_tx)

    broadcasted_request = WithdrawalBroadcastedRequest(transactions=broadcasted_txs)

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(f"{WITHDRAWAL_ROUTER_PREFIX}{WITHDRAWAL_BROADCASTED_ROUTE}", json=broadcasted_request.model_dump())

    assert response.status_code == 200
    from layer2ledgerbatched.layer2ledgerapihandler.api.models.responses.withdrawal_broadcasted_response import WithdrawalBroadcastedResponse
    response_model = WithdrawalBroadcastedResponse.model_validate(response.json())
    assert response_model.error_code == error_codes.ERROR_SUCCESS
    assert len(response_model.transactions) == num_withdrawals
    for tx in response_model.transactions:
        assert tx.error_code == error_codes.ERROR_SUCCESS

    # 6. Confirm withdrawal
    confirmed_message = buildWithdrawalConfirmedMessage(
        layer1_transaction_id=layer1_transaction_id,
        layer1_transaction_vout=layer1_transaction_vout,
        layer1_address=layer1_address,
        amount=total_amount
    )
    confirmed_signature = bridge_address.sign(confirmed_message)
    
    from layer2ledgerbatched.layer2ledgerapihandler.api.models.requests.withdrawal_confirmed_request import WithdrawalConfirmedRequest, Layer1WithdrawalConfirmedTransaction
    confirmed_tx = Layer1WithdrawalConfirmedTransaction(
        layer1_transaction_id=layer1_transaction_id,
        layer1_transaction_vout=layer1_transaction_vout,
        layer1_address=layer1_address,
        amount=total_amount,
        signature=confirmed_signature
    )
    confirmed_request = WithdrawalConfirmedRequest(transactions=[confirmed_tx])

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(f"{WITHDRAWAL_ROUTER_PREFIX}{WITHDRAWAL_CONFIRMED_ROUTE}", json=confirmed_request.model_dump())

    assert response.status_code == 200
    from layer2ledgerbatched.layer2ledgerapihandler.api.models.responses.withdrawal_confirmed_response import WithdrawalConfirmedResponse
    response_model = WithdrawalConfirmedResponse.model_validate(response.json())
    assert response_model.error_code == error_codes.ERROR_SUCCESS
    assert len(response_model.transactions) == 1
    assert response_model.transactions[0].error_code == error_codes.ERROR_SUCCESS

    # 7. Check DB
    withdrawal_reqs = await postgresql_session.execute(select(WithdrawalRequests).where(WithdrawalRequests.layer2_withdrawal_id.in_(layer2_withdrawal_ids)))
    withdrawal_reqs = withdrawal_reqs.scalars().all()
    assert len(withdrawal_reqs) == num_withdrawals
    for req in withdrawal_reqs:
        assert req.status == WithdrawalStatus.WITHDRAWAL_STATUS_CONFIRMED

    confirmed_withdrawals = await postgresql_session.execute(select(ConfirmedWithdrawals).where(ConfirmedWithdrawals.layer2_withdrawal_id.in_(layer2_withdrawal_ids)))
    confirmed_withdrawals = confirmed_withdrawals.scalars().all()
    assert len(confirmed_withdrawals) == num_withdrawals
    for cw in confirmed_withdrawals:
        assert cw.confirmed == True
        assert cw.layer1_transaction_id == layer1_transaction_id
