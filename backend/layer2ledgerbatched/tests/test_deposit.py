
import pytest
import httpx
import uuid
import redis.asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from layer2ledgerbatched.layer2ledgerapihandler.main import app
from openl2_layer2ledger_api import DEPOSIT_ROUTER_PREFIX, GET_DEPOSIT_ADDRESS_ROUTE, DEPOSIT_CONFIRMED_ROUTE
from layer2ledgerbatched.common.db.models import DepositAddresses, Transaction, TransactionType
from openl2_layer2ledger_api.models.requests import GetDepositAddressRequest, DepositConfirmedRequest, DepositsConfirmed
from openl2_layer2ledger_api.models.responses import GetDepositAddressResponse, DepositConfirmedResponse
from openl2_messaging import buildGetDepositAddressMessage, buildDepositMessage
from layer2ledgerbatched.layer2ledgerapihandler.utils.layer2address import Layer2Address
import layer2ledgerbatched.layer2ledgerapihandler.utils.error_message as error_codes
from config_models.models import Layer2LedgerCommonSettings, Layer2LedgerAPIHandlerSettings, Layer2BridgeSettings
from config_loader.loader import Environment, Services, get_layer2ledgerbridge_config

from layer2ledgerbatched.common.redis.redis_models.transactions import PENDING_TRANSACTIONS_LIST_KEY, PendingTransaction

@pytest.fixture(scope="module")
def user_address() -> Layer2Address:
    addr = Layer2Address("user_address")
    addr.new_address()
    return addr

@pytest.fixture(scope="module")
def bridge_address() -> Layer2Address:
    # In a real scenario, this would be loaded from config
    bridge_settings: Layer2BridgeSettings = get_layer2ledgerbridge_config()
    addr = Layer2Address("bridge_address")
    addr.from_private_key(bridge_settings.onboarding_signing_private_key)
    return addr

@pytest.mark.asyncio
async def test_get_deposit_address_success(postgresql_session: AsyncSession, user_address: Layer2Address, common_settings: Layer2LedgerCommonSettings, layer2ledgerapihandler_settings: Layer2LedgerAPIHandlerSettings):
    nonce = str(uuid.uuid4())
    message = buildGetDepositAddressMessage(
        layer2_address_public_key=user_address.public_key_str_base58,
        nonce=nonce
    )
    signature = user_address.sign(message)

    request = GetDepositAddressRequest(
        layer2_address_pubkey=user_address.public_key_str_base58,
        signature=signature,
        nonce=nonce
    )

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(f"{DEPOSIT_ROUTER_PREFIX}{GET_DEPOSIT_ADDRESS_ROUTE}", json=request.model_dump())

    assert response.status_code == 200
    response_model: GetDepositAddressResponse = GetDepositAddressResponse.model_validate(response.json())
    assert response_model.error_code == error_codes.ERROR_SUCCESS
    assert response_model.layer1_deposit_address is not None

    # Verify in DB
    result = await postgresql_session.execute(
        select(DepositAddresses).where(DepositAddresses.layer1_address == response_model.layer1_deposit_address)
    )
    deposit_address_entry = result.scalar_one_or_none()
    assert deposit_address_entry is not None
    assert deposit_address_entry.layer2_address == user_address.public_key_str_base58

@pytest.mark.asyncio
async def test_deposit_confirmed_success(postgresql_session: AsyncSession, redis_client: redis.asyncio.Redis, user_address: Layer2Address, bridge_address: Layer2Address, common_settings: Layer2LedgerCommonSettings, layer2ledgerapihandler_settings: Layer2LedgerAPIHandlerSettings):
    # 1. Get a deposit address first
    nonce_get_address = str(uuid.uuid4())
    msg_get_address = buildGetDepositAddressMessage(user_address.public_key_str_base58, nonce_get_address)
    sig_get_address = user_address.sign(msg_get_address)
    req_get_address = GetDepositAddressRequest(
        layer2_address_pubkey=user_address.public_key_str_base58,
        signature=sig_get_address,
        nonce=nonce_get_address
    )

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        resp_get_address = await client.post(f"{DEPOSIT_ROUTER_PREFIX}{GET_DEPOSIT_ADDRESS_ROUTE}", json=req_get_address.model_dump())
    
    resp_get_address_model = GetDepositAddressResponse.model_validate(resp_get_address.json())
    assert resp_get_address_model.error_code == error_codes.ERROR_SUCCESS
    assert resp_get_address_model.layer1_deposit_address is not None
    layer1_deposit_address = resp_get_address_model.layer1_deposit_address

    # 2. Confirm a deposit
    layer1_tx_id = "l1_tx_id_" + str(uuid.uuid4())
    amount = 500
    nonce_confirm = str(uuid.uuid4())
    
    # The bridge signs this message
    msg_confirm = buildDepositMessage(
        layer1_transaction_id=layer1_tx_id,
        layer1_transaction_vout=0,
        layer1_address=layer1_deposit_address,
        amount=amount,
        nonce=nonce_confirm
    )
    sig_confirm = bridge_address.sign(msg_confirm)

    deposit_confirmed = DepositsConfirmed(
        layer1_address=layer1_deposit_address,
        layer1_transaction_id=layer1_tx_id,
        layer1_transaction_vout=0,
        amount=amount,
        signature=sig_confirm,
        nonce=nonce_confirm
    )
    req_confirm = DepositConfirmedRequest(transactions=[deposit_confirmed])

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(f"{DEPOSIT_ROUTER_PREFIX}{DEPOSIT_CONFIRMED_ROUTE}", json=req_confirm.model_dump())

    assert response.status_code == 200
    response_model = DepositConfirmedResponse.model_validate(response.json())
    assert response_model.error_code == error_codes.ERROR_SUCCESS

    # 3. Check Redis
    pending_tx_json = await redis_client.lpop(PENDING_TRANSACTIONS_LIST_KEY)
    assert pending_tx_json is not None
    
    pending_tx = PendingTransaction.model_validate_json(pending_tx_json)
    
    assert pending_tx.transaction.amount == amount
    assert pending_tx.transaction.destination_address_pubkey == user_address.public_key_str_base58
    assert pending_tx.transaction.transaction_type == TransactionType.TRX_DEPOSIT
    assert pending_tx.transaction.layer1_transaction_id == layer1_tx_id

    # Clean up redis
    await redis_client.delete(PENDING_TRANSACTIONS_LIST_KEY)
