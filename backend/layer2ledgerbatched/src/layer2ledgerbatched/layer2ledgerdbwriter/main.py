import asyncio
import json
import redis.asyncio as redis
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy import select

import layer2ledgerbatched.common.redis.redis_driver.redis_driver as redis_driver

from config_loader.loader import Environment, get_layer2ledgerbatched_common_config
from layer2ledgerbatched.common.db.models import Transaction, Layer2AddressBalance, TransactionType, Base, model_to_dict, WithdrawalRequests
from layer2ledgerbatched.common.redis.redis_driver.distributed_lock import DistributedLock
from layer2ledgerbatched.common.redis.redis_models.transactions import PendingTransaction, PENDING_TRANSACTIONS_LIST_KEY
from layer2ledgerbatched.common.redis.redis_models.withdrawal import PendingWithdrawal, PENDING_WITHDRAWALS_LIST_KEY

async def setup_clients(environment:Environment = Environment.PROD) -> tuple[redis.Redis, AsyncSession, DistributedLock]:
    settings = get_layer2ledgerbatched_common_config(environment.value)
    redis_pool = redis.ConnectionPool.from_url(
        f"redis://{settings.redis.host}:{settings.redis.port}",
        max_connections=20
    )
    redis_client = redis.Redis(connection_pool=redis_pool)
    lock_manager = DistributedLock(redis_client)
    await lock_manager.setup()

    postgres_engine = create_async_engine(
        settings.database.database_url,
        echo=True,
        pool_size=100,
        pool_timeout=30,
    )
    session_maker = async_sessionmaker(
        bind=postgres_engine, autoflush=False, expire_on_commit=False
    )

    async with postgres_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    db: AsyncSession = session_maker()

    return redis_client, db, lock_manager

async def process_pending_transactions(environment: Environment = Environment.PROD) -> None:
    redis_client, db, lock_manager = await setup_clients(environment)

    while True:
        try:
            # Fetch pending transactions from Redis
            transactions_to_process: list[PendingTransaction] = await redis_driver.GetPendingTransactions(redis_client, 0, 999)
            withdrawals_to_process: list[PendingWithdrawal] = await redis_driver.GetPendingWithdrawals(redis_client, 0, 999)
            if not transactions_to_process and not withdrawals_to_process:
                await asyncio.sleep(1)
                continue


            new_transactions: list[Transaction] = []
            new_withdrawals: list[WithdrawalRequests] = []
            balance_updates: dict[str, int] = {} # address -> balance change
            
            for pending_tx in transactions_to_process:
                new_transactions.append(pending_tx.transaction.to_sqlalchemy())
                
                source_addr = pending_tx.transaction.source_address_pubkey
                dest_addr = pending_tx.transaction.destination_address_pubkey
                amount = pending_tx.transaction.amount

                if source_addr not in balance_updates:
                    balance_updates[source_addr] = 0
                balance_updates[source_addr] -= amount

                if dest_addr not in balance_updates:
                    balance_updates[dest_addr] = 0
                balance_updates[dest_addr] += amount

            for pending_withdrawal in withdrawals_to_process:
                new_transactions.append(pending_withdrawal.transaction.to_sqlalchemy())
                new_withdrawals.append(pending_withdrawal.withdrawal_request.to_sqlalchemy())

                source_addr = pending_withdrawal.transaction.source_address_pubkey
                amount = pending_withdrawal.transaction.amount

                if source_addr not in balance_updates:
                    balance_updates[source_addr] = 0
                balance_updates[source_addr] -= amount
            
            #construct a list of Layer2AddressBalance objects
            address_balances: list[Layer2AddressBalance] = []
            for address, balance_change in balance_updates.items():
                address_balances.append(Layer2AddressBalance(address=address, balance=balance_change))

            # convert the list of Layer2AddressBalance objects to list of dicts, so we can use in pg_insert().values()
            address_balances_dicts = [model_to_dict(ab) for ab in address_balances]


            db.add_all(new_transactions)
            db.add_all(new_withdrawals)

            stmt = pg_insert(Layer2AddressBalance).values(address_balances_dicts)
            stmt = stmt.on_conflict_do_update(
                index_elements=[Layer2AddressBalance.address],
                set_={
                    Layer2AddressBalance.balance: Layer2AddressBalance.balance + stmt.excluded.balance
                }
            )
        
            await db.execute(stmt)
            await db.commit()
            
            # Remove processed transactions from Redis
            await redis_client.ltrim(PENDING_TRANSACTIONS_LIST_KEY, len(transactions_to_process), -1)

            # Remove processed withdrawals from Redis
            await redis_client.ltrim(PENDING_WITHDRAWALS_LIST_KEY, len(withdrawals_to_process), -1)


#            # Release locks
            for pending_tx in transactions_to_process:
                await lock_manager.release_multi_lock(pending_tx.addresses_locked, pending_tx.lock_token)
            for pending_withdrawal in withdrawals_to_process:
                await lock_manager.release_multi_lock(pending_withdrawal.addresses_locked, pending_withdrawal.lock_token)
            

        except Exception as e:
            print(f"Error processing transactions: {e}")
            await db.rollback()
            await asyncio.sleep(5)


async def main_async():
    print("Starting Layer2LedgerDbWriter...")
    await asyncio.gather(
        process_pending_transactions()
    )

def main():
    asyncio.run(main_async())

if __name__ == "__main__":
    main()