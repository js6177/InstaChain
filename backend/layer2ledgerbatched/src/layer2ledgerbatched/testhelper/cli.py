from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

from config_loader.loader import Environment, resolve_environment
from layer2ledgerbatched.common.db.models import Base
from layer2ledgerbatched.common.db.seed import seed_wallet_balance
from layer2ledgerbatched.layer2ledgerapihandler.utils.wallet import address_from_mnemonic
from layer2ledgerbatched.testhelper.config import TestSeedConfig
from layer2ledgerbatched.testhelper.schemas import SeedCliResult
from layer2ledgerbatched.testhelper.sessions import create_db_engine
from sqlalchemy.ext.asyncio import async_sessionmaker


def _ensure_test_environment() -> None:
    if resolve_environment() != Environment.TEST.value:
        raise SystemExit(
            "testhelper is only available when ENVIRONMENT=test "
            f"(current: {resolve_environment()!r})"
        )


async def _ensure_schema(engine) -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def seed_from_config(config_path: Path) -> SeedCliResult:
    _ensure_test_environment()
    config = TestSeedConfig.load_from_path(config_path)
    words = config.resolve_mnemonic_words()
    address = address_from_mnemonic(words)

    engine = create_db_engine()
    session_maker = async_sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    await _ensure_schema(engine)

    async with session_maker() as session:
        await seed_wallet_balance(
            session,
            address.public_key_str_base58,
            config.balance_sats,
            include_deposit_transaction=config.include_deposit_transaction,
        )

    await engine.dispose()

    result = SeedCliResult(
        address=address.public_key_str_base58,
        balance_sats=config.balance_sats,
        include_deposit_transaction=config.include_deposit_transaction,
    )
    print(result.model_dump_json(indent=2))
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Layer2 ledger test seed CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    seed_parser = subparsers.add_parser(
        "seed-from-config",
        help="Seed wallet balance from a JSON config file",
    )
    seed_parser.add_argument(
        "config_path",
        type=Path,
        help="Path to seed config JSON (balance_sats + mnemonic or mnemonic_file)",
    )

    args = parser.parse_args(argv)

    if args.command == "seed-from-config":
        asyncio.run(seed_from_config(args.config_path))
        return 0

    parser.error(f"unknown command: {args.command}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
