from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from layer2ledgerbatched.common.db.seed import seed_wallet_balance
from layer2ledgerbatched.layer2ledgerapihandler.utils.wallet import address_from_mnemonic
from layer2ledgerbatched.testhelper.api_paths import (
    HEALTH_ROUTE,
    SEED_BALANCE_ROUTE,
    SEED_MNEMONIC_ROUTE,
    TESTHELPER_ROUTER_PREFIX,
)
from layer2ledgerbatched.testhelper.errors import testhelper_http_error
from layer2ledgerbatched.testhelper.schemas import (
    HealthResponse,
    SeedBalanceRequest,
    SeedMnemonicRequest,
    SeedResponse,
)
from layer2ledgerbatched.testhelper.sessions import get_db_session

router = APIRouter(prefix=TESTHELPER_ROUTER_PREFIX, tags=["testhelper"])


@router.get(HEALTH_ROUTE, response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse()


@router.post(SEED_BALANCE_ROUTE, response_model=SeedResponse)
async def seed_balance(
    request: SeedBalanceRequest,
    db: AsyncSession = Depends(get_db_session),
) -> SeedResponse:
    try:
        await seed_wallet_balance(
            db,
            request.address,
            request.balance,
            include_deposit_transaction=request.include_deposit_transaction,
        )
    except Exception as exc:
        await db.rollback()
        raise testhelper_http_error(exc) from exc
    return SeedResponse(
        address=request.address,
        balance=request.balance,
        include_deposit_transaction=request.include_deposit_transaction,
    )


@router.post(SEED_MNEMONIC_ROUTE, response_model=SeedResponse)
async def seed_mnemonic(
    request: SeedMnemonicRequest,
    db: AsyncSession = Depends(get_db_session),
) -> SeedResponse:
    words = request.mnemonic.strip().split()
    address = address_from_mnemonic(words)
    try:
        await seed_wallet_balance(
            db,
            address.public_key_str_base58,
            request.balance,
            include_deposit_transaction=request.include_deposit_transaction,
        )
    except Exception as exc:
        await db.rollback()
        raise testhelper_http_error(exc) from exc
    return SeedResponse(
        address=address.public_key_str_base58,
        balance=request.balance,
        include_deposit_transaction=request.include_deposit_transaction,
    )
