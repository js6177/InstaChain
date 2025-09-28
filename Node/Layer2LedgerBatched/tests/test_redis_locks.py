import pytest
import pytest_asyncio

# Acquire a lock, and ensure it cannot be acquired again until released
@pytest.mark.asyncio
async def test_distributed_lock_single_key(distributed_lock) -> None:

    user_id = "user1"
    lock_token = await distributed_lock.acquire_multi_lock([user_id], timeout_seconds=5)
    assert lock_token is not None, "Failed to acquire lock for user1"

    # Try to acquire the same lock again (should fail)
    lock_token2 = await distributed_lock.acquire_multi_lock([user_id], timeout_seconds=5)
    assert lock_token2 is None, "Should not be able to acquire the same lock again"

    # Release the lock
    released = await distributed_lock.release_multi_lock([user_id], lock_token)
    assert released, "Failed to release lock for user1"

    # Now we should be able to acquire it again
    lock_token3 = await distributed_lock.acquire_multi_lock([user_id], timeout_seconds=5)
    assert lock_token3 is not None, "Failed to re-acquire lock for user1"

    # Clean up
    await distributed_lock.release_multi_lock([user_id], lock_token3)