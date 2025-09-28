import asyncio
import threading
import redis
import time
import uuid
from typing import Optional, List

def debug_event_loop(location: str):
    try:
        current_loop = asyncio.get_running_loop()
        loop_id = id(current_loop)
        thread_id = threading.get_ident()
        print(f"[{location}] Event Loop ID: {loop_id}, Thread: {thread_id}")
    except RuntimeError as e:
        thread_id = threading.get_ident()
        print(f"[{location}] NO EVENT LOOP, Thread: {thread_id}, Error: {e}")

class DistributedLock:
    _ACQUIRE_SCRIPT_LUA = """
        -- 1. Check if ANY key in the list already exists (i.e., is locked)
        for i, key in ipairs(KEYS) do
            if redis.call('EXISTS', key) == 1 then
                return 0 -- Fail: one or more keys are already locked
            end
        end
        
        -- 2. If all keys are free, set ALL of them with the token and expiration
        for i, key in ipairs(KEYS) do
            -- Use SET <key> <value> EX <seconds>
            redis.call('SET', key, ARGV[1], 'EX', ARGV[2])
        end
        
        return 1 -- Success: all locks acquired
    """

    _RELEASE_SCRIPT_LUA = """
        local keys_to_delete = {}
        
        -- 1. Check ownership for ALL keys. Collect keys that match the token.
        for i, key in ipairs(KEYS) do
            if redis.call('GET', key) == ARGV[1] then
                table.insert(keys_to_delete, key)
            end
        end
        
        -- 2. Check for atomicity: If the number of matching keys is not equal to 
        --    the total number of keys requested for release, something is wrong (mismatch/expiry).
        if #keys_to_delete ~= #KEYS then
            return 0 -- Fail: Do NOT delete any partial set of keys
        end
        
        -- 3. Delete all keys atomically
        return redis.call('DEL', unpack(keys_to_delete))
    """
    
    def __init__(self, redis_client: redis.asyncio.Redis): 
        # Stores the Redis client pool manager instance
        debug_event_loop("DistributedLock __init__")
        self.redis_client = redis_client
        self.acquire_script = None
        self.release_script = None

    async def setup(self):
        """
        Asynchronously loads the Lua scripts into Redis. This function must be 
        awaited once at application startup.
        """
        debug_event_loop("DistributedLock setup")
        # 2. Directly register and await the redis_client method, removing the wrapper functions
        self.acquire_script = self.redis_client.register_script(self._ACQUIRE_SCRIPT_LUA)
        self.release_script = self.redis_client.register_script(self._RELEASE_SCRIPT_LUA)

    def _get_lock_keys(self, user_ids: List[str]) -> List[str]:
        """Converts user IDs into Redis key names."""
        return [f"lock:{user_id}" for user_id in user_ids]

    async def acquire_multi_lock(self, user_ids: List[str], timeout_seconds: int = 15) -> Optional[str]: # Made async
        """
        Attempts to acquire locks for ALL user IDs atomically.
        """
        debug_event_loop("acquire_multi_lock")
        if not user_ids:
            return None

        # Check/load scripts if not already done (handles cases where setup() wasn't called)
        if not self.acquire_script:
             await self.setup()

        lock_token = str(uuid.uuid4())
        lock_keys = self._get_lock_keys(user_ids)
        
        # Execute the Lua script asynchronously
        acquired = await self.acquire_script(
            keys=lock_keys, 
            args=[lock_token, timeout_seconds],
        )
        
        if acquired == 1:
            return lock_token
        else:
            return None # Failed to acquire all locks atomically

    async def release_multi_lock(self, user_ids: List[str], lock_token: str) -> bool: # Made async
        """
        Releases locks for ALL user IDs atomically, only if the token matches all of them.
        """
        if not user_ids:
            return True # Nothing to release
            
        # Check/load scripts if not already done
        if not self.release_script:
             await self.setup()
            
        lock_keys = self._get_lock_keys(user_ids)

        # Execute the Lua script asynchronously
        released = await self.release_script(
            keys=lock_keys, 
            args=[lock_token]
        )
        
        return released == 1 # Returns True if all keys were deleted