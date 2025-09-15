import redis
import time
import json
from layer2ledgerbatched.common.config.config import shared_config

class RedisDriver:
    def __init__(self):
        self.redis = redis.from_url(shared_config.redis_url, decode_responses=True)

    def acquire_lock(self, lock_name: str, timeout=10):
        return self.redis.set(lock_name, "locked", nx=True, ex=timeout)

    def release_lock(self, lock_name: str):
        self.redis.delete(lock_name)
        
    def push_to_mempool(self, transaction: dict):
        self.redis.lpush('PendingTransactions', json.dumps(transaction))
