import random
from threading import Lock

from locust import HttpUser, task, between

from Layer2Ledger.core.Address import Address
from Layer2Ledger.config.config import config
import Layer2Ledger.core.KeyVerification as KeyVerification
from Layer2Ledger.services.messages.Layer2Ledger.Requests.DepositConfirmedRequest import (
    DepositConfirmedRequest,
    DepositsConfirmed,
)
from Layer2Ledger.services.messages.Layer2Ledger.Requests.PushTransactionRequest import (
    PushTransactionRequest,
)
from Layer2Ledger.services.messages.Layer2Ledger.Requests.GetDepositAddressRequest import (
    GetDepositAddressRequest,
)
from Layer2Ledger.services.messages.Layer2Ledger.Responses.GetDepositAddressResponse import (
    GetDepositAddressResponse,
)
from tests.TestsHelper import (
    generate_new_address,
    generate_nonce,
)

# --- Global state for the load test ---
# This setup is not ideal for distributed runs, but works for a single-process test.
# A lock is used to ensure the setup runs only once.
setup_lock = Lock()
source_address: Address = None
destination_addresses: list[Address] = []
setup_done = False
# --- End of global state ---


def is_successful(response) -> bool:
    """Checks for a successful response from the Layer2Ledger API."""
    if response.status_code != 200:
        return False
    try:
        data = response.json()
        return data.get("error_code") == 0
    except Exception:
        return False


class Layer2LedgerTransferUser(HttpUser):
    wait_time = between(0.1, 0.5)
    # The host should be configured when running locust, e.g.,
    # locust -f tests/test_LoadTesting.py --host http://localhost:8080

    async def on_start(self):
        """
        Called when a new user is started.
        The first user will set up the test environment.
        """
        global setup_lock, source_address, destination_addresses, setup_done

        with setup_lock:
            if not setup_done:
                print("--- Setting up test environment for load testing ---")
                await self._setup_test_environment()
                setup_done = True
                print("--- Setup complete ---")

    async def _setup_test_environment(self):
        """
        Deposits funds to a source address and creates destination addresses.
        This should only be run once for all users.
        """
        global source_address, destination_addresses

        num_dest_addresses = 100
        amount_per_transfer = 90
        # Deposit enough to cover all transfers + fees
        deposit_amount = num_dest_addresses * (amount_per_transfer + 10)

        # 1. Create a source address
        source_address = generate_new_address("Load Test Source Address")
        print(f"Source address created: {source_address.pubkey}")

        # 2. Get a deposit address for the source address
        nonce = generate_nonce()
        message = KeyVerification.buildGetDepositAddressMessage(
            source_address.pubkey, nonce
        )
        signature = source_address.sign(message)

        get_deposit_address_request = GetDepositAddressRequest(
            layer2_address_pubkey=source_address.pubkey,
            nonce=nonce,
            signature=signature,
        )

        async with self.client.post(
            "/getNewDepositAddress",
            json=get_deposit_address_request.model_dump(),
            catch_response=True,
            name="/getNewDepositAddress",
        ) as response:
            if not is_successful(response):
                response.failure("Could not get deposit address during setup")
                return
            deposit_address_response = GetDepositAddressResponse(**response.json())
            deposit_address = deposit_address_response.layer1_deposit_address
            print(f"Got deposit address: {deposit_address}")

        # 3. Simulate a deposit to the source address
        deposit_nonce = generate_nonce()
        layer1_tx_id = generate_nonce()
        deposit_message = KeyVerification.buildDepositMessage(
            layer1_tx_id, 0, deposit_address, deposit_amount, deposit_nonce
        )
        onboarding_signer = Address.fromPrivateKey(
            config.Onboarding_Deposit_Address.private_key
        )
        signature = onboarding_signer.sign(deposit_message)

        deposit_data = DepositConfirmedRequest(
            transactions=[
                DepositsConfirmed(
                    layer1_transaction_id=layer1_tx_id,
                    layer1_transaction_vout=0,
                    layer1_address=deposit_address,
                    amount=deposit_amount,
                    nonce=deposit_nonce,
                    signature=signature.decode("utf-8"),
                )
            ]
        )

        async with self.client.post(
            "/depositFunds",
            json=deposit_data.model_dump(),
            catch_response=True,
            name="/depositFunds",
        ) as response:
            if not is_successful(response):
                response.failure("Could not deposit funds during setup")
                return
            print(f"Deposited {deposit_amount} to source address")

        # 4. Generate destination addresses
        destination_addresses = [
            generate_new_address(f"Load Test Destination Address {i}")
            for i in range(num_dest_addresses)
        ]
        print(f"Created {len(destination_addresses)} destination addresses.")

    @task
    async def transfer_to_random_address(self):
        """
        A task that simulates transferring funds from the source address
        to a randomly chosen destination address.
        """
        global source_address, destination_addresses

        if not setup_done:
            return

        if not destination_addresses:
            return

        dest_address = random.choice(destination_addresses)

        amount_per_transfer = 90
        fee_per_transfer = 1

        transfer_nonce = generate_nonce()
        transfer_message = KeyVerification.buildTransferMessage(
            source_address.pubkey,
            dest_address.pubkey,
            amount_per_transfer,
            fee_per_transfer,
            transfer_nonce,
        )
        transfer_signature = source_address.sign(transfer_message).decode("utf-8")

        transfer_request = PushTransactionRequest(
            source_address_public_key=source_address.pubkey,
            destination_address_public_key=dest_address.pubkey,
            amount=amount_per_transfer,
            fee=fee_per_transfer,
            transaction_id=transfer_nonce,
            signature=transfer_signature,
        )

        await self.client.post(
            "/pushTransaction",
            json=transfer_request.model_dump(),
            name="/pushTransaction",
        )
