import asyncio
from contextlib import asynccontextmanager

class Layer2AddressLock:
    def __init__(self):
        self.active_addresses = set()
        self.global_lock = asyncio.Lock()

    @asynccontextmanager
    async def acquire(self, layer2_addresses: list[str]):
        acquired_addresses = []
        acquired_successfully = False
        async with self.global_lock:
            if not any(addr in self.active_addresses for addr in layer2_addresses):
                for addr in layer2_addresses:
                    self.active_addresses.add(addr)
                    acquired_addresses.append(addr)
                acquired_successfully = True
        
        try:
            yield acquired_successfully
        finally:
            if acquired_successfully:
                async with self.global_lock:
                    for addr in acquired_addresses:
                        self.active_addresses.discard(addr)

layer2_address_lock = Layer2AddressLock()
