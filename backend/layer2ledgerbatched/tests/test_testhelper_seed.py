import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from layer2ledgerbatched.common.db.models import Layer2AddressBalance, Transaction, TransactionType
from layer2ledgerbatched.common.db.seed import seed_wallet_balance, upsert_address_balance
from layer2ledgerbatched.layer2ledgerapihandler.utils.wallet import address_from_mnemonic
from layer2ledgerbatched.testhelper.config import TestMnemonicKeysFile, TestSeedConfig
from layer2ledgerbatched.testhelper.errors import (
    exception_detail,
    http_error_from_exception,
    parse_error_detail,
)


@pytest.mark.asyncio
async def test_upsert_address_balance(postgresql_session: AsyncSession) -> None:
    address = "test_address_pubkey_123"
    await upsert_address_balance(postgresql_session, address, 500)
    await upsert_address_balance(postgresql_session, address, 300)
    await postgresql_session.commit()

    result = await postgresql_session.execute(
        select(Layer2AddressBalance).where(Layer2AddressBalance.address == address)
    )
    row = result.scalar_one()
    assert row.balance == 300


@pytest.mark.asyncio
async def test_seed_wallet_balance_creates_deposit_transaction(
    postgresql_session: AsyncSession,
) -> None:
    address = "seeded_address_pubkey_456"
    await seed_wallet_balance(postgresql_session, address, 1000)

    balance_result = await postgresql_session.execute(
        select(Layer2AddressBalance).where(Layer2AddressBalance.address == address)
    )
    balance_row = balance_result.scalar_one()
    assert balance_row.balance == 1000

    tx_result = await postgresql_session.execute(
        select(Transaction).where(Transaction.destination_address_pubkey == address)
    )
    tx_row = tx_result.scalar_one()
    assert tx_row.amount == 1000
    assert tx_row.transaction_type == TransactionType.TRX_DEPOSIT


def test_address_from_mnemonic_matches_wallet_derivation() -> None:
    words = "orbit mixed good replace head abandon roof breeze middle enlist wish frame test rose police intact".split()
    address = address_from_mnemonic(words)
    assert address.public_key_str_base58
    assert len(address.private_key_str_base58) > 0

    second = address_from_mnemonic(words)
    assert second.public_key_str_base58 == address.public_key_str_base58


def test_seed_config_loads_mnemonic_file(tmp_path) -> None:
    mnemonic_words = (
        "orbit mixed good replace head abandon roof breeze middle enlist wish "
        "frame test rose police intact"
    )
    mnemonic_file = tmp_path / "keys.json"
    mnemonic_file.write_text(
        TestMnemonicKeysFile(mnemonic=mnemonic_words).model_dump_json(),
        encoding="utf-8",
    )
    config_path = tmp_path / "seed.json"
    config_path.write_text(
        TestSeedConfig(
            balance_sats=500000,
            mnemonic_file=str(mnemonic_file),
            include_deposit_transaction=False,
        ).model_dump_json(),
        encoding="utf-8",
    )

    config = TestSeedConfig.load_from_path(config_path)
    assert config.balance_sats == 500000
    assert config.include_deposit_transaction is False
    assert len(config.resolve_mnemonic_words()) == 16


def test_exception_detail_includes_traceback() -> None:
    try:
        raise ValueError("seed failed")
    except ValueError as exc:
        detail = exception_detail(exc)

    assert detail.error == "ValueError"
    assert detail.message == "seed failed"
    assert "ValueError: seed failed" in detail.traceback


def test_http_error_from_exception_wraps_detail() -> None:
    exc = http_error_from_exception(RuntimeError("db unavailable"))

    assert exc.status_code == 500
    detail = parse_error_detail(exc.detail)
    assert detail is not None
    assert detail.error == "RuntimeError"
    assert detail.message == "db unavailable"
    assert detail.traceback


def test_parse_error_detail_returns_none_for_unstructured_detail() -> None:
    assert parse_error_detail("plain text") is None
