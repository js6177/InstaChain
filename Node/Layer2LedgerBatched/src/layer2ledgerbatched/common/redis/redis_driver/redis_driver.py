import redis
import time
import json
from layer2ledgerbatched.common.config.config import shared_config
from layer2ledgerbatched.common.redis.redis_models.transactions import PENDING_TRANSACTIONS_LIST_KEY

class RedisDriver:
    def __init__(self):
        self.redis = redis.from_url(shared_config.redis_url, decode_responses=True)

    def acquire_lock(self, lock_name: str, timeout=10):
        return self.redis.set(lock_name, "locked", nx=True, ex=timeout)

    def release_lock(self, lock_name: str):
        self.redis.delete(lock_name)
        
    def push_to_mempool(self, transaction: dict):
        self.redis.lpush(PENDING_TRANSACTIONS_LIST_KEY, json.dumps(transaction))
