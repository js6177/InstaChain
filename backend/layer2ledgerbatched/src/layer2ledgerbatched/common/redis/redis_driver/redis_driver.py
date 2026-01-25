import asyncio
import redis.asyncio as redis
from layer2ledgerbatched.common.redis.redis_models.transactions import PENDING_TRANSACTIONS_LIST_KEY, PendingTransaction
from layer2ledgerbatched.common.redis.redis_models.withdrawal import PENDING_WITHDRAWALS_LIST_KEY, PendingWithdrawal

async def GetPendingTransactions(redis_client: redis.Redis, start: int, end: int) -> list[PendingTransaction]:
    pending_tx_json = await redis_client.lrange(PENDING_TRANSACTIONS_LIST_KEY, start, end)
    if asyncio.iscoroutine(pending_tx_json):
        pending_tx_json = await pending_tx_json
    else:
        pending_tx_json = pending_tx_json
    return [PendingTransaction.model_validate_json(tx) for tx in pending_tx_json]

async def GetPendingWithdrawals(redis_client: redis.Redis, start: int, end: int) -> list[PendingWithdrawal]:
    pending_withdrawals_json = await redis_client.lrange(PENDING_WITHDRAWALS_LIST_KEY, start, end)
    if asyncio.iscoroutine(pending_withdrawals_json):
        pending_withdrawals_json = await pending_withdrawals_json
    else:
        pending_withdrawals_json = pending_withdrawals_json
    return [PendingWithdrawal.model_validate_json(tx) for tx in pending_withdrawals_json]

