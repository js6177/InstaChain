"""Shared helpers for seeding ledger state in the test environment."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from layer2ledgerbatched.common.db.models import (
    Layer2AddressBalance,
    Transaction,
    TransactionType,
)


async def upsert_address_balance(
    session: AsyncSession,
    address: str,
    balance: int,
) -> None:
    """Ensure ``address`` has exactly ``balance`` sats (test seed semantics)."""
    result = await session.execute(
        select(Layer2AddressBalance).where(Layer2AddressBalance.address == address)
    )
    row = result.scalar_one_or_none()
    if row is None:
        session.add(Layer2AddressBalance(address=address, balance=balance))
    else:
        row.balance = balance


async def seed_deposit_transaction(
    session: AsyncSession,
    address: str,
    amount: int,
    *,
    layer2_transaction_id: str | None = None,
    batch_height: int = 0,
) -> Transaction:
    """Record a synthetic deposit transaction crediting ``address``."""
    tx = Transaction(
        timestamp=datetime.now(timezone.utc),
        amount=amount,
        fee=0,
        source_address_pubkey="",
        destination_address_pubkey=address,
        transaction_type=TransactionType.TRX_DEPOSIT,
        layer2_transaction_id=layer2_transaction_id or str(uuid.uuid4()),
        signature="test-seed",
        signature_date=0,
        layer1_transaction_id="test-seed",
        layer2_withdrawal_id="",
        batch_height=batch_height,
    )
    session.add(tx)
    return tx


async def seed_wallet_balance(
    session: AsyncSession,
    address: str,
    balance: int,
    *,
    include_deposit_transaction: bool = True,
) -> None:
    """Ensure ``address`` has ``balance`` sats and optionally a deposit tx row."""
    await upsert_address_balance(session, address, balance)
    if include_deposit_transaction:
        await seed_deposit_transaction(session, address, balance)
    await session.commit()
