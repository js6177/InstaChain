import pytest
import pytest_asyncio

from layer2ledgerbatched.common.redis.redis_driver.distributed_lock import DistributedLock

# Acquire a lock, and ensure it cannot be acquired again until released
@pytest.mark.asyncio
async def test_distributed_lock_single_key(distributed_lock) -> None:

    user_id = "user1"
    lock_token = await distributed_lock.acquire_multi_lock([user_id])
    assert lock_token is not None, "Failed to acquire lock for user1"

    # Try to acquire the same lock again (should fail)
    lock_token2 = await distributed_lock.acquire_multi_lock([user_id])
    assert lock_token2 is None, "Should not be able to acquire the same lock again"

    # Release the lock
    released = await distributed_lock.release_multi_lock([user_id], lock_token)
    assert released, "Failed to release lock for user1"

    # Now we should be able to acquire it again
    lock_token3 = await distributed_lock.acquire_multi_lock([user_id])
    assert lock_token3 is not None, "Failed to re-acquire lock for user1"

    # Clean up
    await distributed_lock.release_multi_lock([user_id], lock_token3)

# Acquire a lock (A,B) and ensure lock (A) cannot be acquired until (A,B) is released
@pytest.mark.asyncio
async def test_distributed_lock_multi_key(distributed_lock: DistributedLock) -> None:
    
    user_ids = ["userA", "userB"]
    lock_token = await distributed_lock.acquire_multi_lock(user_ids)
    assert lock_token is not None, "Failed to acquire lock for userA and userB"

    # Try to acquire lock for userA alone (should fail)
    lock_token2 = await distributed_lock.acquire_multi_lock(["userA"])
    assert lock_token2 is None, "Should not be able to acquire lock for userA while (userA,userB) is held"

    # Try to acquire lock for userB alone (should fail)
    lock_token3 = await distributed_lock.acquire_multi_lock(["userB"])
    assert lock_token3 is None, "Should not be able to acquire lock for userB while (userA,userB) is held"

    # Release the combined lock
    released = await distributed_lock.release_multi_lock(user_ids, lock_token)
    assert released, "Failed to release lock for userA and userB"

    # Now we should be able to acquire locks for userA and userB individually
    lock_token4 = await distributed_lock.acquire_multi_lock(["userA"])
    assert lock_token4 is not None, "Failed to acquire lock for userA after releasing (userA,userB)"

    lock_token5 = await distributed_lock.acquire_multi_lock(["userB"])
    assert lock_token5 is not None, "Failed to acquire lock for userB after releasing (userA,userB)"

    # Clean up
    await distributed_lock.release_multi_lock(["userA"], lock_token4)
    await distributed_lock.release_multi_lock(["userB"], lock_token5)

# # Acquire a lock (A), and ensure (A,B) cannot be acquired until (A) is released
@pytest.mark.asyncio
async def test_distributed_lock_partial_overlap(distributed_lock: DistributedLock) -> None:
    
    user_id_a = "userA"
    user_ids_ab = ["userA", "userB"]

    lock_token_a = await distributed_lock.acquire_multi_lock([user_id_a])
    assert lock_token_a is not None, "Failed to acquire lock for userA"

    # Try to acquire lock for (userA, userB) (should fail)
    lock_token_ab = await distributed_lock.acquire_multi_lock(user_ids_ab)
    assert lock_token_ab is None, "Should not be able to acquire lock for (userA,userB) while userA is held"

    # Release the lock for userA
    released = await distributed_lock.release_multi_lock([user_id_a], lock_token_a)
    assert released, "Failed to release lock for userA"

    # Now we should be able to acquire the combined lock
    lock_token_ab2 = await distributed_lock.acquire_multi_lock(user_ids_ab)
    assert lock_token_ab2 is not None, "Failed to acquire lock for (userA,userB) after releasing userA"

    # Clean up
    await distributed_lock.release_multi_lock(user_ids_ab, lock_token_ab2)

# Acquire a lock (A,B) and ensure (C,D) can be acquired simultaneously
@pytest.mark.asyncio
async def test_distributed_lock_independent_locks(distributed_lock: DistributedLock) -> None:
    
    user_ids_ab = ["userA", "userB"]
    user_ids_cd = ["userC", "userD"]

    lock_token_ab = await distributed_lock.acquire_multi_lock(user_ids_ab)
    assert lock_token_ab is not None, "Failed to acquire lock for (userA,userB)"

    # Try to acquire lock for (userC, userD) (should succeed)
    lock_token_cd = await distributed_lock.acquire_multi_lock(user_ids_cd)
    assert lock_token_cd is not None, "Failed to acquire lock for (userC,userD) while (userA,userB) is held"

    # Clean up
    await distributed_lock.release_multi_lock(user_ids_ab, lock_token_ab)
    await distributed_lock.release_multi_lock(user_ids_cd, lock_token_cd)

# Acquire a lock (A,B) and (C,D), and make sure both are released before (B,C) can be acquired
@pytest.mark.asyncio
async def test_distributed_lock_sequential_locks(distributed_lock: DistributedLock) -> None:
    
    user_ids_ab = ["userA", "userB"]
    user_ids_cd = ["userC", "userD"]
    user_ids_bc = ["userB", "userC"]

    lock_token_ab = await distributed_lock.acquire_multi_lock(user_ids_ab)
    assert lock_token_ab is not None, "Failed to acquire lock for (userA,userB)"

    lock_token_cd = await distributed_lock.acquire_multi_lock(user_ids_cd)
    assert lock_token_cd is not None, "Failed to acquire lock for (userC,userD)"

    # Try to acquire lock for (userB, userC) (should fail)
    lock_token_bc = await distributed_lock.acquire_multi_lock(user_ids_bc)
    assert lock_token_bc is None, "Should not be able to acquire lock for (userB,userC) while (userA,userB) and (userC,userD) are held"

    # Release the first two locks
    released_ab = await distributed_lock.release_multi_lock(user_ids_ab, lock_token_ab)
    assert released_ab, "Failed to release lock for (userA,userB)"

    released_cd = await distributed_lock.release_multi_lock(user_ids_cd, lock_token_cd)
    assert released_cd, "Failed to release lock for (userC,userD)"

    # Now we should be able to acquire the (userB, userC) lock
    lock_token_bc2 = await distributed_lock.acquire_multi_lock(user_ids_bc)
    assert lock_token_bc2 is not None, "Failed to acquire lock for (userB,userC) after releasing previous locks"

    # Clean up
    await distributed_lock.release_multi_lock(user_ids_bc, lock_token_bc2)