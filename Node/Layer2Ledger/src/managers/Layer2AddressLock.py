import threading

# This files is a per-key lock for the Layer2AddressLock class
# Layer2AddressLock ensures that only one Transaction per layer2_address can call processed at a time
# To acquire the lock, use the acquire(layer2_address: str) method. If the lock is available, acquire() returns True. If another thread is already processing a transaction for the same layer2_address, acquire() returns False.
# acquire() does not block. If the lock is not available, it returns False immediately.

class Layer2AddressLock:
    def __init__(self):
        # Set to store layer2_address currently being processed
        self.active_addresses = set()
        self.global_lock = threading.Lock()

    def acquire(self, layer2_addresses: list[str]):
        """
        Context manager to acquire locks for the given list of layer2_addresses.
        Returns a context manager that automatically releases the locks.
        """
        class LockContextManager:
            def __init__(self, lock, addresses):
                self.lock = lock
                self.addresses = addresses
                self.acquired_addresses = []

            def __enter__(self):
                with self.lock.global_lock:
                    # Check if any address is already locked
                    if any(address in self.lock.active_addresses for address in self.addresses):
                        return False

                    # Lock all addresses
                    for address in self.addresses:
                        self.lock.active_addresses.add(address)
                        self.acquired_addresses.append(address)

                return True

            def __exit__(self, exc_type, exc_value, traceback):
                with self.lock.global_lock:
                    for address in self.acquired_addresses:
                        self.lock.active_addresses.discard(address)

        return LockContextManager(self, layer2_addresses)

# Create a global instance of Layer2AddressLock
layer2_address_lock = Layer2AddressLock()