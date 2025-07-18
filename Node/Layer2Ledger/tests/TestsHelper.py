import random
import string
import base58
import ecdsa
from Layer2Ledger.core.Address import Address
from Layer2Ledger.database.database import get_db, DatabaseSession
import Layer2Ledger.core.Onboarding as Onboarding
from Layer2Ledger.core.Transaction import Transaction
from Layer2Ledger.services.messages.Layer2Ledger.Requests.DepositConfirmedRequest import DepositConfirmedRequest
from Layer2Ledger.services.messages.Layer2Ledger.Requests.RequestWithdrawalRequest import RequestWithdrawalRequest
from Layer2Ledger.services.messages.Layer2Ledger.Requests.PushTransactionRequest import PushTransactionRequest
from Layer2Ledger.services.messages.Layer2Ledger.Requests.WithdrawalConfirmedRequest import WithdrawalConfirmedRequest

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
    return response.status_code == 200 and response.json['error_code'] == 0

def verify_get_new_deposit_address_procedure(layer2_address_pubkey: str):
    with get_db() as db:
        # Check if the deposit was added to the database
        deposit_entry: Onboarding.DepositAddresses = db.query(Onboarding.DepositAddresses).filter(
            Onboarding.DepositAddresses.layer2_address == layer2_address_pubkey,
        ).first()
        assert deposit_entry is not None

def verify_deposit_confirmed(deposit_confirmed: DepositConfirmedRequest):
    with get_db() as db:
        for deposit in deposit_confirmed.transactions:
            layer2_transaction = db.query(Transaction).filter(
                Transaction.layer2_transaction_id == deposit.nonce
            ).first()

            assert layer2_transaction is not None

def verify_withdrawal_request_procedure(db: DatabaseSession, withdrawal_request: RequestWithdrawalRequest):
    # Check to see if the withrawal request was processed correctly
    with get_db() as db:
        # Check if the withdrawal request was added to the database
        withdrawal_entry: Onboarding.WithdrawalRequests = db.query(Onboarding.WithdrawalRequests).filter(
            Onboarding.WithdrawalRequests.layer1_address == withdrawal_request.layer1_withdrawal_address,
            Onboarding.WithdrawalRequests.layer2_transaction_id == withdrawal_request.layer2_transaction_id,       
        ).first()
        assert withdrawal_entry is not None

        # Check to see that the Transaction's layer1_transaction_id is null (not yet broadcasted)
        assert withdrawal_entry.layer1_transaction_id is None

        # Check to see if a Transaction's layer2_withdrawal_id is the WithdrawalRequest's layer2_transaction_id
        layer2_transaction: Transaction = db.query(Transaction).filter(
            Transaction.layer2_transaction_id == withdrawal_entry.layer2_transaction_id,
        ).first()

        assert layer2_transaction is not None
        assert layer2_transaction.layer1_transaction_id is None  # Ensure it is not broadcasted yet
        assert layer2_transaction.layer2_withdrawal_id == withdrawal_entry.layer2_withdrawal_id

def verify_withdrawal_confirmed_procedure(withdrawal_confirmed: WithdrawalConfirmedRequest):
    with get_db() as db:
        for withdrawal in withdrawal_confirmed.transactions:
            layer2_withdrawal_ids = set()
            # Check if the withdrawal was added to the database
            withdrawal_entry: Onboarding.ConfirmedWithdrawals = db.query(Onboarding.ConfirmedWithdrawals).filter(
                Onboarding.ConfirmedWithdrawals.layer1_transaction_id == withdrawal.layer1_transaction_id,
                Onboarding.ConfirmedWithdrawals.layer1_transaction_vout == withdrawal.layer1_transaction_vout,
            ).first()
            assert withdrawal_entry is not None
            assert withdrawal_entry.confirmed is True
            layer2_withdrawal_ids.add(withdrawal_entry.layer2_withdrawal_id)

            for layer2_withdrawal_id in layer2_withdrawal_ids:

                withdrawalRequest: Onboarding.WithdrawalRequests = db.query(Onboarding.WithdrawalRequests).filter(
                    Onboarding.WithdrawalRequests.layer2_withdrawal_id == layer2_withdrawal_id
                ).first()
                assert withdrawalRequest is not None
                assert withdrawalRequest.layer1_transaction_id == withdrawal.layer1_transaction_id
                assert withdrawalRequest.status == Onboarding.WithdrawalRequests.WITHDRAWAL_STATUS_CONFIRMED

                # Check if the Transaction's layer1_transaction_id matches the confirmed withdrawal's layer1_transaction_id
                transaction_entry: Transaction = db.query(Transaction).filter(
                    Transaction.layer2_transaction_id == withdrawalRequest.layer2_transaction_id,
                ).first()
                assert transaction_entry is not None
                assert transaction_entry.layer1_transaction_id == withdrawal.layer1_transaction_id

def verify_layer2_transaction_procedure(layer2_transaction: PushTransactionRequest):
    with get_db() as db:
        # Check if the transaction was added to the database
        transaction_entry: Transaction = db.query(Transaction).filter(
            Transaction.layer2_transaction_id == layer2_transaction.transaction_id
        ).first()
        assert transaction_entry is not None

        # Check if the transaction's, source, destination, amount and fee match
        assert transaction_entry.source_address_pubkey == layer2_transaction.source_address_public_key
        assert transaction_entry.destination_address_pubkey == layer2_transaction.destination_address_public_key
        assert transaction_entry.amount == layer2_transaction.amount
        assert transaction_entry.fee == layer2_transaction.fee

        # Check if the transaction's signature matches
        assert transaction_entry.signature == layer2_transaction.signature

def drop_MasterPublicKeyIndex_DepositAddresses_tables():
    with get_db() as db:
        db.query(Onboarding.MasterPublicKeyIndex).delete()
        db.query(Onboarding.DepositAddresses).delete()
        db.commit()
