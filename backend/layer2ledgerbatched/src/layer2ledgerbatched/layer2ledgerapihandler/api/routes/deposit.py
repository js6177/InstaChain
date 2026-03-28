import uuid

from fastapi import APIRouter, Depends
import redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from layer2ledgerbatched.layer2ledgerapihandler.utils.sessions import get_redis, get_db_session
from layer2ledgerbatched.common.db.models import DepositAddresses, Transaction, TransactionType
from openl2_layer2ledger_api.models.requests import GetDepositAddressRequest
from openl2_layer2ledger_api.models.responses import GetDepositAddressResponse
from openl2_layer2ledger_api.models.requests import DepositConfirmedRequest
from openl2_layer2ledger_api.models.responses import DepositConfirmedResponse, Layer1DepositConfirmedTransaction
from openl2_layer2ledger_api.models.responses import CommonResponse
import layer2ledgerbatched.layer2ledgerapihandler.utils.error_message as error_codes
from openl2_messaging import verifyGetDepositAddress, verifyDeposit, buildGetDepositAddressMessage, buildDepositMessage
from layer2ledgerbatched.layer2ledgerapihandler.utils.layer2address import Layer2Address
from layer2ledgerbatched.layer2ledgerapihandler.utils.generate_btc_address import generate_btc_testnet_address
from layer2ledgerbatched.common.redis.redis_models.transactions import RedisTransaction, PendingTransaction, PENDING_TRANSACTIONS_LIST_KEY
from config_loader.loader import get_layer2ledgerbatched_layer2ledgerapihandler_config, Environment
from config_models.models import Layer2LedgerAPIHandlerSettings
from openl2_layer2ledger_api import GET_DEPOSIT_ADDRESS_ROUTE, DEPOSIT_CONFIRMED_ROUTE

router = APIRouter()

@router.post(GET_DEPOSIT_ADDRESS_ROUTE, response_model=GetDepositAddressResponse)
async def get_deposit_address(
    request: GetDepositAddressRequest,
    db: AsyncSession = Depends(get_db_session),
    settings: Layer2LedgerAPIHandlerSettings = Depends(lambda: get_layer2ledgerbatched_layer2ledgerapihandler_config())
) -> GetDepositAddressResponse:
    if not request.layer2_address_pubkey or not request.layer2_address_pubkey.isalnum():
        return GetDepositAddressResponse(error_code=error_codes.ERROR_INVALID_SOURCE_ADDRESS, error_message=error_codes.get_error_message(error_codes.ERROR_INVALID_SOURCE_ADDRESS))

    if not verifyGetDepositAddress(
        source_pubkey=request.layer2_address_pubkey,
        nonce=request.nonce,
        signature=request.signature
    ):
        return GetDepositAddressResponse(error_code=error_codes.ERROR_INVALID_SIGNATURE, error_message=error_codes.get_error_message(error_codes.ERROR_INVALID_SIGNATURE))

    new_deposit_address = DepositAddresses(
        layer2_address=request.layer2_address_pubkey,
        nonce=request.nonce,
        signature=request.signature,
        layer1_address="",
        mpk_index=-1
    )
    db.add(new_deposit_address)
    await db.flush()
    await db.refresh(new_deposit_address)

    deposit_address_id = new_deposit_address.id
    layer1_address = generate_btc_testnet_address(settings.deposit_wallet_master_pubkey, deposit_address_id)

    if not layer1_address:
        await db.rollback()
        return GetDepositAddressResponse(error_code=error_codes.ERROR_UNKNOWN, error_message="Failed to generate layer1 address")

    new_deposit_address.layer1_address = layer1_address
    new_deposit_address.mpk_index = deposit_address_id
    await db.commit()

    return GetDepositAddressResponse(layer1_deposit_address=layer1_address, error_code=error_codes.ERROR_SUCCESS, error_message=error_codes.get_error_message(error_codes.ERROR_SUCCESS))


@router.post(DEPOSIT_CONFIRMED_ROUTE, response_model=DepositConfirmedResponse)
async def deposit_confirmed(
    request: DepositConfirmedRequest,
    db: AsyncSession = Depends(get_db_session),
    redis_client: redis.asyncio.Redis = Depends(get_redis),
    settings: Layer2LedgerAPIHandlerSettings = Depends(lambda: get_layer2ledgerbatched_layer2ledgerapihandler_config())
) -> DepositConfirmedResponse:
    successful_transactions: list[Layer1DepositConfirmedTransaction] = []
    for deposit_confirmed in request.transactions:
        if not verifyDeposit(
            layer1_transaction_id=deposit_confirmed.layer1_transaction_id,
            layer1_transaction_vout=deposit_confirmed.layer1_transaction_vout,
            layer1_address=deposit_confirmed.layer1_address,
            amount=deposit_confirmed.amount,
            nonce=deposit_confirmed.nonce,
            signature=deposit_confirmed.signature
        ):
            return DepositConfirmedResponse(error_code=error_codes.ERROR_INVALID_SIGNATURE, error_message=error_codes.get_error_message(error_codes.ERROR_INVALID_SIGNATURE), transactions=successful_transactions)

        result = await db.execute(
            select(DepositAddresses.layer2_address).where(DepositAddresses.layer1_address == deposit_confirmed.layer1_address)
        )
        layer2_address = result.scalar_one_or_none()

        if not layer2_address:
            return DepositConfirmedResponse(error_code=error_codes.ERROR_DEPOSIT_ADDRESS_NOT_FOUND, error_message=error_codes.get_error_message(error_codes.ERROR_DEPOSIT_ADDRESS_NOT_FOUND), transactions=successful_transactions)

        # Generate random layer2_transaction_id
        layer2_transaction_id = str(uuid.uuid4())
        redis_transaction = RedisTransaction(
            amount=deposit_confirmed.amount,
            fee=0,
            source_address_pubkey=settings.deposit_transaction_pubkey,
            destination_address_pubkey=layer2_address,
            transaction_type=TransactionType.TRX_DEPOSIT,
            layer2_transaction_id=layer2_transaction_id,
            layer1_transaction_id=f'{deposit_confirmed.layer1_transaction_id}:{deposit_confirmed.layer1_transaction_vout}',
            signature=deposit_confirmed.signature,
            signature_date=0, # Should be part of request
        )

        pending_transaction = PendingTransaction(
            transaction=redis_transaction,
            lock_token=None,
            addresses_locked=[]
        )

        await redis_client.rpush(PENDING_TRANSACTIONS_LIST_KEY, pending_transaction.model_dump_json())
        successful_transactions.append(
            Layer1DepositConfirmedTransaction(
                layer1_transaction_id=deposit_confirmed.layer1_transaction_id,
                layer1_transaction_vout=deposit_confirmed.layer1_transaction_vout,
                error_code=error_codes.ERROR_SUCCESS,
                error_message=error_codes.get_error_message(error_codes.ERROR_SUCCESS)
            )
        )

    return DepositConfirmedResponse(error_code=error_codes.ERROR_SUCCESS, error_message=error_codes.get_error_message(error_codes.ERROR_SUCCESS), transactions=successful_transactions)
