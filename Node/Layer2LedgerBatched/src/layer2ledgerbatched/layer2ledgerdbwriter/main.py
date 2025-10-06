import asyncio
import json
import redis.asyncio as redis
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy import select

from layer2ledgerbatched.common.config.config import get_settings, Environment
from layer2ledgerbatched.common.db.models import Transaction, Layer2AddressBalance, TransactionType, Base, model_to_dict
from layer2ledgerbatched.common.redis.redis_driver.distributed_lock import DistributedLock
from layer2ledgerbatched.common.redis.redis_models.transactions import PendingTransaction, PENDING_TRANSACTIONS_LIST_KEY

async def process_pending_transactions(environment: Environment = Environment.PROD) -> None:
    settings = get_settings(environment)
    redis_pool = redis.ConnectionPool.from_url(
        f"redis://{settings.redis.host}:{settings.redis.port}",
        max_connections=20
    )
    redis_client = redis.Redis(connection_pool=redis_pool)
    lock_manager = DistributedLock(redis_client)
    await lock_manager.setup()

    postgres_engine = create_async_engine(
        settings.database_url,
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

    while True:
        try:
            # Fetch pending transactions from Redis
            pending_txs_json = await redis_client.lrange(PENDING_TRANSACTIONS_LIST_KEY, 0, 999)
            if not pending_txs_json:
                await asyncio.sleep(1)
                continue

            transactions_to_process = [PendingTransaction.model_validate_json(tx) for tx in pending_txs_json]

            new_transactions: list[Transaction] = []
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
            
            #construct a list of Layer2AddressBalance objects
            address_balances: list[Layer2AddressBalance] = []
            for address, balance_change in balance_updates.items():
                address_balances.append(Layer2AddressBalance(address=address, balance=balance_change))

            # convert the list of Layer2AddressBalance objects to list of dicts, so we can use in pg_insert().values()
            address_balances_dicts = [model_to_dict(ab) for ab in address_balances]


            db.add_all(new_transactions)

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

            for pending_tx in transactions_to_process:
                await lock_manager.release_multi_lock(pending_tx.addresses_locked, pending_tx.lock_token)
            

        except Exception as e:
            print(f"Error processing transactions: {e}")
            await db.rollback()
            await asyncio.sleep(5)

def main():
    print("Starting Layer2LedgerDbWriter...")
    asyncio.run(process_pending_transactions())

if __name__ == "__main__":
    main()