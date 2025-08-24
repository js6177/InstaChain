import pytest
from Layer2Ledger.managers.Layer2AddressLock import layer2_address_lock
import asyncio

@pytest.mark.asyncio
async def test_acquire_and_release():
    addresses = ["test_address"]

    # Test acquiring the lock
    async with layer2_address_lock.acquire(addresses) as acquired:
        assert acquired, "Failed to acquire lock for the first time"

        # Test that acquiring the lock again fails
        async with layer2_address_lock.acquire(addresses) as acquired_again:
            assert not acquired_again, "Should not be able to acquire lock while already held"

    # Test that the lock is released after the context
    async with layer2_address_lock.acquire(addresses) as acquired_after_release:
        assert acquired_after_after_release, "Failed to acquire lock after release"

@pytest.mark.asyncio
async def test_concurrent_access():
    addresses = ["concurrent_address"]
    results = []

    async def try_acquire():
        async with layer2_address_lock.acquire(addresses) as acquired:
            results.append(acquired)
            if acquired:
                # Simulate some processing time
                await asyncio.sleep(0.1)

    # Create multiple tasks to test concurrent access
    tasks = [asyncio.create_task(try_acquire()) for _ in range(5)]

    await asyncio.gather(*tasks)

    # Only one task should have been able to acquire the lock
    assert results.count(True) == 1, "More than one task acquired the lock"
    assert results.count(False) == 4, "Some tasks did not attempt to acquire the lock"

@pytest.mark.asyncio
async def test_acquire_multiple_addresses():
    addresses = ["address1", "address2", "address3"]

    # Test acquiring the lock for multiple addresses
    async with layer2_address_lock.acquire(addresses) as acquired:
        assert acquired, "Failed to acquire lock for multiple addresses"

        # Test that acquiring the lock again fails for the same addresses
        async with layer2_address_lock.acquire(addresses) as acquired_again:
            assert not acquired_again, "Should not be able to acquire lock while already held for multiple addresses"

    # Test that the locks are released after the context
    async with layer2_address_lock.acquire(addresses) as acquired_after_release:
        assert acquired_after_release, "Failed to acquire lock after release for multiple addresses"

@pytest.mark.asyncio
async def test_acquire_with_common_address():
    set1 = ["A", "B"]
    set2 = ["C", "A"]

    # Acquire lock for the first set
    async with layer2_address_lock.acquire(set1) as acquired_set1:
        assert acquired_set1, "Failed to acquire lock for the first set"

        # Attempt to acquire lock for the second set
        async with layer2_address_lock.acquire(set2) as acquired_set2:
            assert not acquired_set2, "Should not be able to acquire lock for the second set due to common address"

            # Ensure address C can still be acquired separately
            async with layer2_address_lock.acquire(["C"]) as acquired_c:
                assert acquired_c, "Failed to acquire lock for address C separately"
