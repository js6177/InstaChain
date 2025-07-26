
import asyncio
import time
import pytest
import httpx
from tests.TestsHelper import generate_new_address, generate_nonce
from Layer2Ledger.core.KeyVerification import buildGetDepositAddressMessage, buildDepositMessage, buildTransferMessage
from Layer2Ledger.services.messages.Layer2Ledger.Requests.GetDepositAddressRequest import GetDepositAddressRequest
from Layer2Ledger.services.messages.Layer2Ledger.Requests.DepositConfirmedRequest import DepositConfirmedRequest, DepositsConfirmed
from Layer2Ledger.services.messages.Layer2Ledger.Requests.PushTransactionRequest import PushTransactionRequest
from Layer2Ledger.services.messages.Layer2Ledger.Requests.GetBalanceRequest import GetBalanceRequest
from Layer2Ledger.core.Address import Address
from Layer2Ledger.config.config import config
from Layer2Ledger.services.messages.Layer2Ledger.Responses.GetDepositAddressResponse import GetDepositAddressResponse
from Layer2Ledger.services.messages.Layer2Ledger.Responses.GetBalanceResponse import GetBalanceResponse
from Layer2Ledger.services.messages.Layer2Ledger.Responses.CommonResponse import CommonResponse

BASE_URL = "http://127.0.0.1:8084"

def is_successful_response(response, response_model) -> bool:
    return response.status_code == 200 and response_model.error_code == 0

@pytest.mark.asyncio
async def test_concurrent_transfers():
    num_receivers = 100
    amount_per_receiver = 100
    fee_per_transfer = 1
    total_transfer_amount = num_receivers * amount_per_receiver
    deposit_amount = total_transfer_amount-1  # Sender will not have enough for fees

    sender = generate_new_address("Concurrent Sender")
    receivers = [generate_new_address(f"Receiver {i}") for i in range(num_receivers)]

    async with httpx.AsyncClient() as client:
        # 1. Get deposit address for sender
        nonce = generate_nonce()
        message = buildGetDepositAddressMessage(sender.pubkey, nonce)
        signature = sender.sign(message)
        get_deposit_address_request = GetDepositAddressRequest(
            layer2_address_pubkey=sender.pubkey,
            nonce=nonce,
            signature=signature
        )
        response = await client.post(f"{BASE_URL}/getNewDepositAddress", json=get_deposit_address_request.model_dump())
        deposit_address_response = GetDepositAddressResponse(**response.json())
        assert is_successful_response(response, deposit_address_response)
        deposit_address = deposit_address_response.layer1_deposit_address

        # 2. Deposit funds to sender
        deposit_nonce = generate_nonce()
        layer1_tx_id = generate_nonce()
        onboarding_signer = Address.fromPrivateKey(config.Onboarding_Deposit_Address.private_key)
        deposit_message = buildDepositMessage(layer1_tx_id, 0, deposit_address, deposit_amount, deposit_nonce)
        signature = onboarding_signer.sign(deposit_message)
        deposit_data = DepositConfirmedRequest(
            transactions=[
                DepositsConfirmed(
                    layer1_transaction_id=layer1_tx_id,
                    layer1_transaction_vout=0,
                    layer1_address=deposit_address,
                    amount=deposit_amount,
                    nonce=deposit_nonce,
                    signature=signature.decode('utf-8')
                )
            ]
        )
        response = await client.post(f"{BASE_URL}/depositFunds", json=deposit_data.model_dump())
        deposit_response = CommonResponse(**response.json())
        assert is_successful_response(response, deposit_response)

        # 3. Concurrently send funds to all receivers
        start_time = time.time()

        tasks = []
        for receiver in receivers:
            transfer_nonce = generate_nonce()
            transfer_message = buildTransferMessage(
                sender.pubkey, receiver.pubkey, amount_per_receiver, fee_per_transfer, transfer_nonce
            )
            transfer_signature = sender.sign(transfer_message).decode('utf-8')
            transfer_request = PushTransactionRequest(
                source_address_public_key=sender.pubkey,
                destination_address_public_key=receiver.pubkey,
                amount=amount_per_receiver,
                fee=fee_per_transfer,
                transaction_id=transfer_nonce,
                signature=transfer_signature
            )
            tasks.append(client.post(f"{BASE_URL}/pushTransaction", json=transfer_request.model_dump()))

        responses = await asyncio.gather(*tasks)

        end_time = time.time()
        duration = end_time - start_time
        print(f"Concurrent transfers completed in {duration:.2f} seconds.")

        # 4. Verify at least one transaction failed
        parsed_responses = [CommonResponse(**res.json()) for res in responses]
        assert any(res.error_code != 0 for res in parsed_responses)

        # 5. Verify sender's final balance is not negative
        balance_request = GetBalanceRequest(public_keys=[sender.pubkey])
        response = await client.post(f"{BASE_URL}/getBalance", json=balance_request.model_dump())
        balance_response = GetBalanceResponse(**response.json())
        assert is_successful_response(response, balance_response)
        sender_balance = balance_response.balance[0].balance
        assert sender_balance >= 0
        print(f"Sender's final balance: {sender_balance}")
