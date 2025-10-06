import asyncio
import redis.asyncio as redis
from layer2ledgerbatched.common.redis.redis_models.transactions import PENDING_TRANSACTIONS_LIST_KEY
from layer2ledgerbatched.common.redis.redis_models.transactions import PendingTransaction

async def GetPendingTransactions(redis_client: redis.Redis, start: int, end: int) -> list[PendingTransaction]:
    pending_tx_json = await redis_client.lrange(PENDING_TRANSACTIONS_LIST_KEY, start, end)
    if asyncio.iscoroutine(pending_tx_json):
        pending_tx_json = await pending_tx_json
    else:
        pending_tx_json = pending_tx_json
    return [PendingTransaction.model_validate_json(tx) for tx in pending_tx_json]

