import pytest
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone
import time

from layer2ledgerbatched.common.db.models import Layer2AddressBalance as DBBalance
from layer2ledgerbatched.common.db.models import Transaction, TransactionType
from layer2ledgerbatched.layer2ledgerapihandler.api.models.requests.get_balance_request import (
    GetBalanceRequest,
)
from layer2ledgerbatched.layer2ledgerapihandler.api.models.requests.get_fee_request import (
    GetFeeRequest,
)
from layer2ledgerbatched.layer2ledgerapihandler.api.models.requests.get_transaction_request import (
    GetTransactionRequest,
)
from layer2ledgerbatched.layer2ledgerapihandler.api.models.requests.get_transactions_request import (
    GetTransactionsRequest,
)
from layer2ledgerbatched.layer2ledgerapihandler.api.models.responses.get_balance_response import (
    GetBalanceResponse,
    GetBalanceResponseBalance,
)
from layer2ledgerbatched.layer2ledgerapihandler.api.models.responses.get_fee_response import (
    GetFeeResponse,
)
from layer2ledgerbatched.layer2ledgerapihandler.api.models.responses.get_transaction_response import (
    GetTransactionResponse,
)
from layer2ledgerbatched.layer2ledgerapihandler.api.models.responses.get_transactions_response import (
    GetTransactionsResponse,
    GetTransactionsResponseTransaction,
)
from layer2ledgerbatched.layer2ledgerapihandler.api.routes.route_defs import (
    EXPLORER_ROUTER_PREFIX,
    GET_ALL_TRANSACTIONS_ROUTE,
    GET_BALANCE_ROUTE,
    GET_FEE_ROUTE,
    GET_TRANSACTION_ROUTE,
)
from layer2ledgerbatched.layer2ledgerapihandler.config.config import get_settings
from layer2ledgerbatched.layer2ledgerapihandler.utils.error_message import (
    ERROR_SUCCESS,
    ERROR_TRANSACTION_ID_NOT_FOUND,
)
from layer2ledgerbatched.layer2ledgerapihandler.main import app


@pytest.mark.asyncio
async def test_get_balance(postgresql_session: AsyncSession) -> None:
    public_key_1 = "test_public_key_1"
    public_key_2 = "test_public_key_2"
    balance_1 = 100
    balance_2 = 200

    postgresql_session.add(DBBalance(address=public_key_1, balance=balance_1))
    postgresql_session.add(DBBalance(address=public_key_2, balance=balance_2))
    await postgresql_session.commit()

    request = GetBalanceRequest(public_keys=[public_key_1, public_key_2])
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            f"{EXPLORER_ROUTER_PREFIX}{GET_BALANCE_ROUTE}", json=request.model_dump()
        )
    assert response.status_code == 200
    response_model = GetBalanceResponse.model_validate(response.json())
    assert response_model.error_code == ERROR_SUCCESS
    assert len(response_model.balance) == 2
    assert response_model.balance[0].public_key == public_key_1
    assert response_model.balance[0].balance == balance_1
    assert response_model.balance[0].address_found == True
    assert response_model.balance[1].public_key == public_key_2
    assert response_model.balance[1].balance == balance_2
    assert response_model.balance[1].address_found == True


@pytest.mark.asyncio
async def test_get_balance_new_key(postgresql_session: AsyncSession) -> None:
    public_key_1 = "test_public_key_1"
    balance_1 = 100

    postgresql_session.add(DBBalance(address=public_key_1, balance=balance_1))
    await postgresql_session.commit()

    request = GetBalanceRequest(public_keys=[public_key_1, "new_public_key"])
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            f"{EXPLORER_ROUTER_PREFIX}{GET_BALANCE_ROUTE}", json=request.model_dump()
        )
    assert response.status_code == 200
    response_model = GetBalanceResponse.model_validate(response.json())
    assert response_model.error_code == ERROR_SUCCESS
    assert len(response_model.balance) == 2
    assert response_model.balance[0].public_key == public_key_1
    assert response_model.balance[0].balance == balance_1
    assert response_model.balance[0].address_found == True
    assert response_model.balance[1].public_key == "new_public_key"
    assert response_model.balance[1].balance == 0
    assert response_model.balance[1].address_found == False


@pytest.mark.asyncio
async def test_get_transaction(postgresql_session: AsyncSession) -> None:
    layer2_transaction_id = "test_tx_id"
    sender_public_key = "sender_pk"
    recipient_public_key = "recipient_pk"
    amount = 50
    signature = "test_signature"
    sig_date = 0
    transaction_type = TransactionType.TRX_TRANSFER
    transaction: Transaction = Transaction(
            layer2_transaction_id=layer2_transaction_id,
            source_address_pubkey=sender_public_key,
            destination_address_pubkey=recipient_public_key,
            amount=amount,
            signature_date=sig_date,
            transaction_type=transaction_type,
            fee=0,
            signature=signature,
            layer1_transaction_id="",
            layer2_withdrawal_id="",
            timestamp=datetime.now(timezone.utc)
        )
    postgresql_session.add(transaction)
    await postgresql_session.commit()

    request = GetTransactionRequest(layer2_transaction_id=layer2_transaction_id)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            f"{EXPLORER_ROUTER_PREFIX}{GET_TRANSACTION_ROUTE}", json=request.model_dump()
        )
    assert response.status_code == 200
    response_model = GetTransactionResponse.model_validate(response.json())
    assert response_model.error_code == ERROR_SUCCESS
    assert response_model.transaction is not None
    assert response_model.transaction.layer2_transaction_id == layer2_transaction_id
    assert response_model.transaction.source_address_pubkey == sender_public_key
    assert response_model.transaction.destination_address_pubkey == recipient_public_key
    assert response_model.transaction.amount == amount
    assert response_model.transaction.signature == signature
    assert response_model.transaction.signature_date == sig_date
    assert response_model.transaction.transaction_type == transaction_type


@pytest.mark.asyncio
async def test_get_transaction_not_found(
    postgresql_session: AsyncSession
) -> None:
    request = GetTransactionRequest(layer2_transaction_id="non_existent_tx")
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            f"{EXPLORER_ROUTER_PREFIX}{GET_TRANSACTION_ROUTE}", json=request.model_dump()
        )
    assert response.status_code == 200
    response_model = GetTransactionResponse.model_validate(response.json())
    assert response_model.error_code == ERROR_TRANSACTION_ID_NOT_FOUND
    assert response_model.transaction is None


@pytest.mark.asyncio
async def test_get_all_transactions(
    postgresql_session: AsyncSession
) -> None:
    public_key_1 = "pk1"
    public_key_2 = "pk2"
    public_key_3 = "pk3"

    tx1 = Transaction(
        layer2_transaction_id="tx1",
        source_address_pubkey=public_key_1,
        destination_address_pubkey=public_key_2,
        amount=10,
        signature_date=0,
        transaction_type=TransactionType.TRX_TRANSFER,
        fee=0,
        signature="sig1",
        layer1_transaction_id="",
        layer2_withdrawal_id="",
        timestamp=datetime.now(timezone.utc)
    )
    tx2 = Transaction(
        layer2_transaction_id="tx2",
        source_address_pubkey=public_key_2,
        destination_address_pubkey=public_key_3,
        amount=20,
        signature_date=0,
        transaction_type=TransactionType.TRX_TRANSFER,
        fee=0,
        signature="sig2",
        layer1_transaction_id="",
        layer2_withdrawal_id="",
        timestamp=datetime.now(timezone.utc)
    )
    tx3 = Transaction(
        layer2_transaction_id="tx3",
        source_address_pubkey=public_key_1,
        destination_address_pubkey=public_key_3,
        amount=30,
        signature_date=0,
        transaction_type=TransactionType.TRX_TRANSFER,
        fee=0,
        signature="sig3",
        layer1_transaction_id="",
        layer2_withdrawal_id="",
        timestamp=datetime.now(timezone.utc)
    )
    postgresql_session.add_all([tx1, tx2, tx3])
    await postgresql_session.commit()

    request = GetTransactionsRequest(public_keys=[public_key_1, public_key_2])
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            f"{EXPLORER_ROUTER_PREFIX}{GET_ALL_TRANSACTIONS_ROUTE}", json=request.model_dump()
        )
    assert response.status_code == 200
    response_model = GetTransactionsResponse.model_validate(response.json())
    assert response_model.error_code == ERROR_SUCCESS
    assert len(response_model.transaction_groups) == 2 # 1 transaction group for each pubkey
    tx_ids: set[str] = set()
    for transaction_group in response_model.transaction_groups:
        for tx in transaction_group.transactions:
            tx_ids.add(tx.layer2_transaction_id)
    assert tx_ids == {"tx1", "tx2", "tx3"}


@pytest.mark.asyncio
async def test_get_all_transactions_no_transactions(
    postgresql_session: AsyncSession
) -> None:
    request = GetTransactionsRequest(public_keys=["non_existent_pk"])
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            f"{EXPLORER_ROUTER_PREFIX}{GET_ALL_TRANSACTIONS_ROUTE}", json=request.model_dump()
        )
    assert response.status_code == 200
    response_model = GetTransactionsResponse.model_validate(response.json())
    assert response_model.error_code == ERROR_SUCCESS
    assert len(response_model.transaction_groups) == 1
    assert len(response_model.transaction_groups[0].transactions) == 0


@pytest.mark.asyncio
async def test_get_fee(postgresql_session: AsyncSession) -> None:
    request = GetFeeRequest()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            f"{EXPLORER_ROUTER_PREFIX}{GET_FEE_ROUTE}", json=request.model_dump()
        )
    assert response.status_code == 200
    response_model = GetFeeResponse.model_validate(response.json())
    assert response_model.error_code == ERROR_SUCCESS
    assert response_model.fee == get_settings().minimum_layer1_transaction_amount