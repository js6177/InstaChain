import random
import string
import base58
import ecdsa
from Layer2Ledger.core.Address import Address
from Layer2Ledger.database.database import AsyncSession
import Layer2Ledger.core.Onboarding as Onboarding
from Layer2Ledger.core.Transaction import Transaction
from Layer2Ledger.services.messages.Layer2Ledger.Requests.DepositConfirmedRequest import DepositConfirmedRequest
from Layer2Ledger.services.messages.Layer2Ledger.Requests.RequestWithdrawalRequest import RequestWithdrawalRequest
from Layer2Ledger.services.messages.Layer2Ledger.Requests.PushTransactionRequest import PushTransactionRequest
from Layer2Ledger.services.messages.Layer2Ledger.Requests.WithdrawalConfirmedRequest import WithdrawalConfirmedRequest
from sqlalchemy import select

def generate_new_keypair() -> tuple[str, str]:
    sk = ecdsa.SigningKey.generate(curve=ecdsa.SECP256k1)
    vk = sk.get_verifying_key()

    urlsafe_pubkey = base58.b58encode(vk.to_string())
    urlsafe_privkey = base58.b58encode(sk.to_string())

    return (urlsafe_privkey, urlsafe_pubkey.decode('utf-8'))

def generate_new_address(description: str) -> Address:
    priv_key, pub_key = generate_new_keypair()
    return Address.fromPrivateKey(priv_key, pub_key, description)

def generate_nonce(length=16) -> str:
    return ''.join(random.choices(string.ascii_letters + string.digits, k=length))

def is_successful_response(response) -> bool:
    return response.status_code == 200 and response.json()['error_code'] == 0

async def verify_get_new_deposit_address_procedure(db: AsyncSession, layer2_address_pubkey: str):
    # Check if the deposit was added to the database
    result = await db.execute(select(Onboarding.DepositAddresses).filter(
        Onboarding.DepositAddresses.layer2_address == layer2_address_pubkey,
    ))
    deposit_entry: Onboarding.DepositAddresses = result.scalars().first()
    assert deposit_entry is not None

async def verify_deposit_confirmed(db: AsyncSession, deposit_confirmed: DepositConfirmedRequest):
    for deposit in deposit_confirmed.transactions:
        result = await db.execute(select(Transaction).filter(
            Transaction.layer2_transaction_id == deposit.nonce
        ))
        layer2_transaction = result.scalars().first()

        assert layer2_transaction is not None

async def verify_withdrawal_request_procedure(db: AsyncSession, withdrawal_request: RequestWithdrawalRequest):
    # Check to see if the withrawal request was processed correctly
    # db is already passed in, no need for async with get_db()
    # ... (rest of the function, using the passed 'db' object)
    pass

async def verify_withdrawal_confirmed_procedure(db: AsyncSession, withdrawal_confirmed: WithdrawalConfirmedRequest):
    for withdrawal in withdrawal_confirmed.transactions:
        layer2_withdrawal_ids = set()
        # Check if the withdrawal was added to the database
        result = await db.execute(select(Onboarding.ConfirmedWithdrawals).filter(
            Onboarding.ConfirmedWithdrawals.layer1_transaction_id == withdrawal.layer1_transaction_id,
            Onboarding.ConfirmedWithdrawals.layer1_transaction_vout == withdrawal.layer1_transaction_vout,
        ))
        withdrawal_entry: Onboarding.ConfirmedWithdrawals = result.scalars().first()
        assert withdrawal_entry is not None
        assert withdrawal_entry.confirmed is True
        layer2_withdrawal_ids.add(withdrawal_entry.layer2_withdrawal_id)

        for layer2_withdrawal_id in layer2_withdrawal_ids:

            result = await db.execute(select(Onboarding.WithdrawalRequests).filter(
                Onboarding.WithdrawalRequests.layer2_withdrawal_id == layer2_withdrawal_id
            ))
            withdrawalRequest: Onboarding.WithdrawalRequests = result.scalars().first()
            assert withdrawalRequest is not None
            assert withdrawalRequest.layer1_transaction_id == withdrawal.layer1_transaction_id
            assert withdrawalRequest.status == Onboarding.WithdrawalRequests.WITHDRAWAL_STATUS_CONFIRMED

            # Check if the Transaction's layer1_transaction_id matches the confirmed withdrawal's layer1_transaction_id
            result = await db.execute(select(Transaction).filter(
                Transaction.layer2_transaction_id == withdrawalRequest.layer2_transaction_id,
            ))
            transaction_entry: Transaction = result.scalars().first()
            assert transaction_entry is not None
            assert transaction_entry.layer1_transaction_id == withdrawal.layer1_transaction_id

async def verify_layer2_transaction_procedure(db: AsyncSession, layer2_transaction: PushTransactionRequest):
    # Check if the transaction was added to the database
    result = await db.execute(select(Transaction).filter(
        Transaction.layer2_transaction_id == layer2_transaction.transaction_id
    ))
    transaction_entry: Transaction = result.scalars().first()
    assert transaction_entry is not None

    # Check if the transaction's, source, destination, amount and fee match
    assert transaction_entry.source_address_pubkey == layer2_transaction.source_address_public_key
    assert transaction_entry.destination_address_pubkey == layer2_transaction.destination_address_public_key
    assert transaction_entry.amount == layer2_transaction.amount
    assert transaction_entry.fee == layer2_transaction.fee

    # Check if the transaction's signature matches
    assert transaction_entry.signature == layer2_transaction.signature

async def drop_MasterPublicKeyIndex_DepositAddresses_tables(db: AsyncSession):
    await db.execute(Onboarding.MasterPublicKeyIndex.__table__.delete())
    await db.execute(Onboarding.DepositAddresses.__table__.delete())