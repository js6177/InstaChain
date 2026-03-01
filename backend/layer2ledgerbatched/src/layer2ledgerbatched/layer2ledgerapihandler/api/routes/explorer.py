from fastapi import APIRouter, Depends
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from layer2ledgerbatched.common.db.models import Layer2AddressBalance as DBBalance
from layer2ledgerbatched.common.db.models import Transaction as DBTransaction
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
    GetBalanceResponseBalance,
    GetBalanceResponse,
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
    TransactionGroup,
)

from config_loader.loader import get_layer2ledgerbatched_layer2ledgerapihandler_config, Environment
from layer2ledgerbatched.layer2ledgerapihandler.utils.error_message import (
    get_error_message,
    ERROR_TRANSACTION_ID_NOT_FOUND,
    ERROR_SUCCESS,
)
from layer2ledgerbatched.layer2ledgerapihandler.utils.sessions import get_db_session

from .route_defs import (
    GET_ALL_TRANSACTIONS_ROUTE,
    GET_BALANCE_ROUTE,
    GET_FEE_ROUTE,
    GET_TRANSACTION_ROUTE,
)

router = APIRouter()


@router.post(GET_BALANCE_ROUTE, response_model=GetBalanceResponse)
async def get_balance(
    request: GetBalanceRequest, db: AsyncSession = Depends(get_db_session)
) -> GetBalanceResponse:
    """
    Gets the balance for a list of public keys.
    """
    balances: list[GetBalanceResponseBalance] = []
    for public_key in request.public_keys:
        result = await db.execute(
            select(DBBalance).where(DBBalance.address == public_key)
        )
        db_balance = result.scalar_one_or_none()
        if db_balance:
            balances.append(
                GetBalanceResponseBalance(public_key=db_balance.address, balance=db_balance.balance, address_found=True)
            )
        else:
            balances.append(GetBalanceResponseBalance(public_key=public_key, balance=0, address_found=False))
    return GetBalanceResponse(
        balance=balances,
        error_code=ERROR_SUCCESS,
        error_message="",
    )


@router.post(GET_TRANSACTION_ROUTE, response_model=GetTransactionResponse)
async def get_transaction(
    request: GetTransactionRequest, db: AsyncSession = Depends(get_db_session)
) -> GetTransactionResponse:
    """
    Gets a specific transaction by its ID.
    """
    result = await db.execute(
        select(DBTransaction).where(DBTransaction.layer2_transaction_id == request.layer2_transaction_id)
    )
    db_tx = result.scalar_one_or_none()
    if db_tx:
        return GetTransactionResponse(
            transaction=GetTransactionsResponseTransaction.model_validate(db_tx),
            error_code=ERROR_SUCCESS,
            error_message=get_error_message(ERROR_SUCCESS),
            transaction_id=request.layer2_transaction_id)
    return GetTransactionResponse(
        error_code=ERROR_TRANSACTION_ID_NOT_FOUND,
        error_message=get_error_message(ERROR_TRANSACTION_ID_NOT_FOUND),
        transaction=None,
        transaction_id=request.layer2_transaction_id,
    )


@router.post(GET_ALL_TRANSACTIONS_ROUTE, response_model=GetTransactionsResponse)
async def get_all_transactions(
    request: GetTransactionsRequest, db: AsyncSession = Depends(get_db_session)
) -> GetTransactionsResponse:
    """
    Gets all transactions for a list of public keys.
    """
    transactionGroups: list[TransactionGroup] = []
    for public_key in request.public_keys:
        result = await db.execute(
            select(DBTransaction).where(
                or_(
                    DBTransaction.source_address_pubkey == public_key,
                    DBTransaction.destination_address_pubkey == public_key,
                )
            )
        )
        db_txs = result.scalars().all()
        transactions: list[GetTransactionsResponseTransaction] = []
        for db_tx in db_txs:
            transactions.append(GetTransactionsResponseTransaction.model_validate(db_tx))
        transactionGroups.append(TransactionGroup(public_key=public_key, transactions=transactions))
    return GetTransactionsResponse(
        transaction_groups=transactionGroups,
        error_code=ERROR_SUCCESS,
        error_message=get_error_message(ERROR_SUCCESS),
    )


@router.post(GET_FEE_ROUTE, response_model=GetFeeResponse)
async def get_fee(request: GetFeeRequest) -> GetFeeResponse:
    """
    Gets the current transaction fee.
    """
    settings = get_layer2ledgerbatched_layer2ledgerapihandler_config()
    return GetFeeResponse(
        fee=settings.minimum_layer1_transaction_amount,
        error_code=ERROR_SUCCESS,
        error_message=get_error_message(ERROR_SUCCESS),
    )
