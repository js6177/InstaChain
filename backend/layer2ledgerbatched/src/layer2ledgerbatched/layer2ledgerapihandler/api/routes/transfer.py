from fastapi import APIRouter, Depends, HTTPException
import redis
from sqlalchemy import select, Table
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from sqlalchemy.dialects.postgresql import insert as pg_insert


#from layer2ledgerbatched.common.db.session import get_db_session
from layer2ledgerbatched.layer2ledgerapihandler.utils.sessions import get_redis, get_db_session, get_redis_lock_manager
from layer2ledgerbatched.common.db.models import Transaction, Layer2AddressBalance, TransactionType
from layer2ledgerbatched.layer2ledgerapihandler.api.models.requests.push_transaction_request import PushTransactionRequest
from layer2ledgerbatched.layer2ledgerapihandler.api.models.responses.common_response import CommonResponse
import layer2ledgerbatched.layer2ledgerapihandler.utils.error_message as error_codes
from layer2ledgerbatched.layer2ledgerapihandler.utils.key_verification import buildTransferMessage, verifyTransferMessage
from layer2ledgerbatched.layer2ledgerapihandler.utils.layer2address import Layer2Address
from layer2ledgerbatched.common.redis.redis_driver.distributed_lock import DistributedLock
from layer2ledgerbatched.common.redis.redis_models.transactions import RedisTransaction, PendingTransaction, PENDING_TRANSACTIONS_LIST_KEY
from .route_defs import PUSH_TRANSACTION_ROUTE

router = APIRouter()

@router.post(PUSH_TRANSACTION_ROUTE, response_model=CommonResponse)
async def create_transfer(
    request: PushTransactionRequest, 
    db: AsyncSession = Depends(get_db_session), 
    redis_client: redis.asyncio.Redis = Depends(get_redis),
    lock_manager: DistributedLock = Depends(get_redis_lock_manager)
) -> CommonResponse:
    
    # 1. Validate request fields
    if not request.source_address_public_key or not request.source_address_public_key.isalnum():
        return CommonResponse(error_code=error_codes.ERROR_INVALID_SOURCE_ADDRESS, error_message=error_codes.get_error_message(error_codes.ERROR_INVALID_SOURCE_ADDRESS))
    
    if not request.destination_address_public_key or not request.destination_address_public_key.isalnum():
        return CommonResponse(error_code=error_codes.ERROR_INVALID_DESTINATION_ADDRESS, error_message=error_codes.get_error_message(error_codes.ERROR_INVALID_DESTINATION_ADDRESS))

    if request.amount <= 0:
        return CommonResponse(error_code=error_codes.ERROR_INVALID_AMOUNT, error_message=error_codes.get_error_message(error_codes.ERROR_INVALID_AMOUNT))

    # 2. Verify signature
    if not verifyTransferMessage(
        source_pubkey=request.source_address_public_key,
        destination_address_pubkey=request.destination_address_public_key,
        amount=request.amount,
        fee=request.fee,
        nonce=request.transaction_id,
        signature=request.signature
    ):
        return CommonResponse(error_code=error_codes.ERROR_INVALID_SIGNATURE, error_message=error_codes.get_error_message(error_codes.ERROR_INVALID_SIGNATURE))

    # 3. Acquire lock
    addresses_to_lock = sorted([request.source_address_public_key, request.destination_address_public_key])
    lock_token = await lock_manager.acquire_multi_lock(addresses_to_lock)

    if not lock_token:
        return CommonResponse(error_code=error_codes.ERROR_ADDRESS_LOCKED, error_message=error_codes.get_error_message(error_codes.ERROR_ADDRESS_LOCKED))

    try:
        # 4. Check for duplicate transaction
        existing_transaction = await db.execute(
            select(Transaction).where(Transaction.layer2_transaction_id == request.transaction_id)
        )
        if existing_transaction.scalar_one_or_none() is not None:
            await lock_manager.release_multi_lock(addresses_to_lock, lock_token)
            return CommonResponse(error_code=error_codes.ERROR_DUPLICATE_TRANSACTION, error_message=error_codes.get_error_message(error_codes.ERROR_DUPLICATE_TRANSACTION))

        # 5. Check balance
        balance_result = await db.execute(
            select(Layer2AddressBalance.balance).where(Layer2AddressBalance.address == request.source_address_public_key)
        )
        balance = balance_result.scalar_one_or_none()

        if balance is None or balance < request.amount:
            await lock_manager.release_multi_lock(addresses_to_lock, lock_token)
            return CommonResponse(error_code=error_codes.ERROR_INSUFFICIENT_FUNDS, error_message=error_codes.get_error_message(error_codes.ERROR_INSUFFICIENT_FUNDS))

        # 6. Push to Redis
        redis_transaction = RedisTransaction(
            amount=request.amount,
            fee=request.fee,
            source_address_pubkey=request.source_address_public_key,
            destination_address_pubkey=request.destination_address_public_key,
            transaction_type=TransactionType.TRX_TRANSFER,
            layer2_transaction_id=request.transaction_id,
            signature=request.signature,
            signature_date=0, # Should be part of request
        )

        pending_transaction = PendingTransaction(
            transaction=redis_transaction,
            lock_token=lock_token,
            addresses_locked=addresses_to_lock
        )

        await redis_client.rpush(PENDING_TRANSACTIONS_LIST_KEY, pending_transaction.model_dump_json())

    except Exception as e:
        await lock_manager.release_multi_lock(addresses_to_lock, lock_token)
        # Log the exception e
        return CommonResponse(error_code=error_codes.ERROR_UNKNOWN, error_message=str(e))


    return CommonResponse(error_code=error_codes.ERROR_SUCCESS, error_message="Confirmed, pending insertion into db")