from fastapi import APIRouter, Depends, HTTPException
import redis
from sqlalchemy import select, Table, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from sqlalchemy.dialects.postgresql import insert as pg_insert
import time

#from layer2ledgerbatched.common.db.session import get_db_session
from layer2ledgerbatched.layer2ledgerapihandler.utils.sessions import get_redis, get_db_session, get_redis_lock_manager
from layer2ledgerbatched.common.db.models import Transaction, Layer2AddressBalance, TransactionType, WithdrawalStatus, WithdrawalRequests, ConfirmedWithdrawals
from openl2_layer2ledger_api.models.requests import RequestWithdrawalRequest
from openl2_layer2ledger_api.models.responses import CommonResponse
import layer2ledgerbatched.layer2ledgerapihandler.utils.error_message as error_codes
from openl2_messaging import buildWithdrawalRequestMessage as buildWithdrawalMessage, verifyWithdrawalBroadcasted, verifyWithdrawalConfirmed, verifyWithdrawalRequestMessage
from layer2ledgerbatched.layer2ledgerapihandler.utils.layer2address import Layer2Address
from layer2ledgerbatched.common.redis.redis_driver.distributed_lock import DistributedLock
from layer2ledgerbatched.common.redis.redis_models.transactions import RedisTransaction
from layer2ledgerbatched.common.redis.redis_models.withdrawal import PendingWithdrawal, RedisWithdrawalRequest, PENDING_WITHDRAWALS_LIST_KEY
from openl2_layer2ledger_api.models.requests import GetWithdrawalRequestsRequest
from openl2_layer2ledger_api.models.responses import GetWithdrawalRequestsResponse, WithdrawalRequest as WithdrawalRequestResponse
from openl2_layer2ledger_api.models.requests import WithdrawalBroadcastedRequest, Layer1BroadcastedWithdrawalTransaction
from openl2_layer2ledger_api.models.responses import WithdrawalBroadcastedResponse, Layer1BroadcastedWithdrawalTransactionStatus
from openl2_layer2ledger_api.models.requests import WithdrawalConfirmedRequest, Layer1WithdrawalConfirmedTransaction
from openl2_layer2ledger_api.models.responses import WithdrawalConfirmedResponse, Layer1WithdrawalConfirmedTransactionStatus
from config_loader.loader import get_layer2ledgerbatched_layer2ledgerapihandler_config, Environment
from openl2_layer2ledger_api import REQUEST_WITHDRAWAL_ROUTE, GET_WITHDRAWAL_REQUESTS_ROUTE, WITHDRAWAL_BROADCASTED_ROUTE, WITHDRAWAL_CONFIRMED_ROUTE


router = APIRouter()

@router.post(REQUEST_WITHDRAWAL_ROUTE, response_model=CommonResponse)
async def request_withdrawal(
    request: RequestWithdrawalRequest, 
    db: AsyncSession = Depends(get_db_session), 
    redis_client: redis.asyncio.Redis = Depends(get_redis),
    lock_manager: DistributedLock = Depends(get_redis_lock_manager)
) -> CommonResponse:
    # 1. Validate request fields
    if not request.source_address_public_key or not request.source_address_public_key.isalnum():
        return CommonResponse(error_code=error_codes.ERROR_INVALID_SOURCE_ADDRESS, error_message=error_codes.get_error_message(error_codes.ERROR_INVALID_SOURCE_ADDRESS))
    
    if not request.layer1_withdrawal_address:
        return CommonResponse(error_code=error_codes.ERROR_INVALID_DESTINATION_ADDRESS, error_message=error_codes.get_error_message(error_codes.ERROR_INVALID_DESTINATION_ADDRESS))

    if request.amount <= 0:
        return CommonResponse(error_code=error_codes.ERROR_INVALID_AMOUNT, error_message=error_codes.get_error_message(error_codes.ERROR_INVALID_AMOUNT))

    # 2. Verify signature
    if not verifyWithdrawalRequestMessage(
        source_pubkey=request.source_address_public_key,
        withdrawal_address=request.layer1_withdrawal_address,
        amount=request.amount,
        nonce=request.layer2_transaction_id,
        signature=request.signature
    ):
        return CommonResponse(error_code=error_codes.ERROR_INVALID_SIGNATURE, error_message=error_codes.get_error_message(error_codes.ERROR_INVALID_SIGNATURE))

    # 3. Acquire lock
    addresses_to_lock = [request.source_address_public_key]
    lock_token = await lock_manager.acquire_multi_lock(addresses_to_lock)

    if not lock_token:
        return CommonResponse(error_code=error_codes.ERROR_ADDRESS_LOCKED, error_message=error_codes.get_error_message(error_codes.ERROR_ADDRESS_LOCKED))

    try:
        # 4. Check for duplicate transaction
        existing_transaction = await db.execute( 
            select(Transaction).where(Transaction.layer2_transaction_id == request.layer2_transaction_id)
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
        layer2_withdrawal_id = f"w_{request.layer2_transaction_id}"
        redis_transaction = RedisTransaction(
            amount=request.amount,
            fee=0,
            source_address_pubkey=request.source_address_public_key,
            destination_address_pubkey='', # Destination is a layer1 address
            transaction_type=TransactionType.TRX_WITHDRAWAL_INITIATED,
            layer2_transaction_id=request.layer2_transaction_id,
            signature=request.signature,
            signature_date=0, # Should be part of request
            layer2_withdrawal_id=layer2_withdrawal_id
        )

        redis_withdrawal_request = RedisWithdrawalRequest(
            layer1_address=request.layer1_withdrawal_address,
            status=WithdrawalStatus.WITHDRAWAL_STATUS_PENDING,
            amount=request.amount,
            layer2_withdrawal_id=layer2_withdrawal_id,
            layer2_transaction_id=request.layer2_transaction_id,
            withdrawal_requested_timestamp=int(time.time())
        )

        pending_withdrawal = PendingWithdrawal(
            transaction=redis_transaction,
            withdrawal_request=redis_withdrawal_request,
            lock_token=lock_token,
            addresses_locked=addresses_to_lock
        )

        await redis_client.rpush(PENDING_WITHDRAWALS_LIST_KEY, pending_withdrawal.model_dump_json())

    except Exception as e:
        await lock_manager.release_multi_lock(addresses_to_lock, lock_token)
        # Log the exception e
        return CommonResponse(error_code=error_codes.ERROR_UNKNOWN, error_message=str(e))


    return CommonResponse(error_code=error_codes.ERROR_SUCCESS, error_message="Withdrawal request created")

@router.post(GET_WITHDRAWAL_REQUESTS_ROUTE, response_model=GetWithdrawalRequestsResponse)
async def get_withdrawal_requests(
    request: GetWithdrawalRequestsRequest,
    db: AsyncSession = Depends(get_db_session)
) -> GetWithdrawalRequestsResponse:
    # 1. Fetch pending withdrawal requests
    result = await db.execute(
        select(WithdrawalRequests).where(
            WithdrawalRequests.status == WithdrawalStatus.WITHDRAWAL_STATUS_PENDING
        )
    )
    pending_withdrawals = result.scalars().all()

    # 2. Update status to acknowledged
    if pending_withdrawals:
        await db.execute(
            update(WithdrawalRequests)
            .where(WithdrawalRequests.id.in_([p.id for p in pending_withdrawals]))
            .values(status=WithdrawalStatus.WITHDRAWAL_STATUS_ACKNOWLEDGED)
        )
        await db.commit()

    # 3. Prepare response
    response_withdrawals = [
        WithdrawalRequestResponse(
            layer1_address=p.layer1_address,
            layer1_transaction_id=p.layer1_transaction_id,
            status=p.status,
            amount=p.amount,
            layer2_withdrawal_id=p.layer2_withdrawal_id,
            server_signature=p.server_signature,
            layer2_transaction_id=p.layer2_transaction_id,
            withdrawal_requested_timestamp=p.withdrawal_requested_timestamp,
            withdrawal_requested_timestamp_str=p.withdrawal_requested_timestamp_str.isoformat()
        )
        for p in pending_withdrawals
    ]

    return GetWithdrawalRequestsResponse(
        withdrawal_requests=response_withdrawals,
        error_code=error_codes.ERROR_SUCCESS,
        error_message=error_codes.get_error_message(error_codes.ERROR_SUCCESS)
    )

@router.post(WITHDRAWAL_BROADCASTED_ROUTE, response_model=WithdrawalBroadcastedResponse)
async def withdrawal_broadcasted(
    request: WithdrawalBroadcastedRequest,
    db: AsyncSession = Depends(get_db_session)
) -> WithdrawalBroadcastedResponse:
    response_transactions: list[Layer1BroadcastedWithdrawalTransactionStatus] = []
    for tx in request.transactions:
        # 1. Verify signature
        if not verifyWithdrawalBroadcasted(
            layer1_transaction_id=tx.layer1_transaction_id,
            layer1_transaction_vout=tx.layer1_transaction_vout,
            layer1_address=tx.layer1_address,
            amount=tx.amount,
            withdrawal_id=tx.layer2_withdrawal_id,
            signature=tx.signature
        ):
            response_transactions.append(Layer1BroadcastedWithdrawalTransactionStatus(
                layer2_withdrawal_id=tx.layer2_withdrawal_id,
                error_code=error_codes.ERROR_INVALID_SIGNATURE,
                error_message=error_codes.get_error_message(error_codes.ERROR_INVALID_SIGNATURE)
            ))
            continue

        # 2. Update withdrawal request status
        await db.execute(
            update(WithdrawalRequests)
            .where(WithdrawalRequests.layer2_withdrawal_id == tx.layer2_withdrawal_id)
            .values(status=WithdrawalStatus.WITHDRAWAL_STATUS_BROADCASTED)
        )

        # 3. Create ConfirmedWithdrawal
        confirmed_withdrawal = ConfirmedWithdrawals(
            layer1_transaction_id=tx.layer1_transaction_id,
            layer1_transaction_vout=tx.layer1_transaction_vout,
            layer1_address=tx.layer1_address,
            amount=tx.amount,
            layer2_withdrawal_id=tx.layer2_withdrawal_id,
            broadcasted_signature=tx.signature,
            confirmed=False
        )
        db.add(confirmed_withdrawal)

        response_transactions.append(Layer1BroadcastedWithdrawalTransactionStatus(
            layer2_withdrawal_id=tx.layer2_withdrawal_id,
            error_code=error_codes.ERROR_SUCCESS,
            error_message=error_codes.get_error_message(error_codes.ERROR_SUCCESS)
        ))

    await db.commit()

    return WithdrawalBroadcastedResponse(
        transactions=response_transactions,
        error_code=error_codes.ERROR_SUCCESS,
        error_message=error_codes.get_error_message(error_codes.ERROR_SUCCESS)
    )

@router.post(WITHDRAWAL_CONFIRMED_ROUTE, response_model=WithdrawalConfirmedResponse)
async def withdrawal_confirmed(
    request: WithdrawalConfirmedRequest,
    db: AsyncSession = Depends(get_db_session)
) -> WithdrawalConfirmedResponse:
    response_transactions: list[Layer1WithdrawalConfirmedTransactionStatus] = []
    for tx in request.transactions:
        # 1. Verify signature
        if not verifyWithdrawalConfirmed(
            layer1_transaction_id=tx.layer1_transaction_id,
            layer1_transaction_vout=tx.layer1_transaction_vout,
            layer1_address=tx.layer1_address,
            amount=tx.amount,
            signature=tx.signature
        ):
            response_transactions.append(Layer1WithdrawalConfirmedTransactionStatus(
                layer1_transaction_id=tx.layer1_transaction_id,
                layer1_transaction_vout=tx.layer1_transaction_vout,
                error_code=error_codes.ERROR_INVALID_SIGNATURE,
                error_message=error_codes.get_error_message(error_codes.ERROR_INVALID_SIGNATURE)
            ))
            continue

        # 2. Update ConfirmedWithdrawal, get all the layer2_withdrawal_ids that were updated
        layer2_withdrawal_ids: set[str] = set()
        result = await db.execute(
            update(ConfirmedWithdrawals)
            .where(ConfirmedWithdrawals.layer1_transaction_id == tx.layer1_transaction_id)
            .where(ConfirmedWithdrawals.layer1_transaction_vout == tx.layer1_transaction_vout)
            .values(confirmed=True, confirmed_signature=tx.signature)
            .returning(ConfirmedWithdrawals.layer2_withdrawal_id)
        )

        layer2_withdrawal_ids.update({row[0] for row in result})

        # 3. Update WithdrawalRequest for each layer2_withdrawal_id, since multiple withdrawals can be in one layer1 transaction
        for lwid in layer2_withdrawal_ids:
            await db.execute(
                update(WithdrawalRequests)
                .where(WithdrawalRequests.layer2_withdrawal_id == lwid)
                .values(status=WithdrawalStatus.WITHDRAWAL_STATUS_CONFIRMED, layer1_transaction_id=tx.layer1_transaction_id)
            )

        response_transactions.append(Layer1WithdrawalConfirmedTransactionStatus(
            layer1_transaction_id=tx.layer1_transaction_id,
            layer1_transaction_vout=tx.layer1_transaction_vout,
            error_code=error_codes.ERROR_SUCCESS,
            error_message=error_codes.get_error_message(error_codes.ERROR_SUCCESS)
        ))

    await db.commit()

    return WithdrawalConfirmedResponse(
        transactions=response_transactions,
        error_code=error_codes.ERROR_SUCCESS,
        error_message=error_codes.get_error_message(error_codes.ERROR_SUCCESS)
    )
