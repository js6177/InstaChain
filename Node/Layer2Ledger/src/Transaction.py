from sqlalchemy import Column, Integer, BigInteger, String, DateTime, Boolean, Text, JSON, Enum
from sqlalchemy.sql import func
from database import Base, DatabaseSession, get_db
import logging
from Address import Address
import ErrorMessage
from typing import List, Self
from enum import Enum as PyEnum, auto
from typing import Tuple
import string
import datetime
import traceback
import DebugLogger
import signing_keys
import GlobalLogging
import Onboarding
from NodeInfoAPI import MINIMUM_LAYER1_TRANSACTION_AMOUNT
from KeyValueStore import KeyValueStore
from managers.Layer2AddressLock import layer2_address_lock

class TransactionMode(PyEnum):
    ADDRESSLOCK = auto() # source and destination addresses are locked, preventing duplicates
    TRANSACTION_PUTTRANSACTION = auto() # the entire transaction is handled in a single database transaction
    NONE = auto() # if in the future, concurrency is handled by an outside program

TRANSACTION_MODE = TransactionMode.ADDRESSLOCK
ADDRESS_BALANCE_CACHE_ENABLED = True

def add_fee(db: DatabaseSession, fee: int):
    """Add fee to the total fees stored in KeyValueStore."""
    return KeyValueStore.increment_int(db, 'fees', fee, 0)

class Layer2AddressBalance(Base):
    __tablename__ = "address_balance_cache"

    id = Column(Integer, primary_key=True, index=True)
    address = Column(String, unique=True, index=True)
    balance = Column(Integer)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())

    @staticmethod
    def get(db: DatabaseSession, _address):
        try:
            return db.query(Layer2AddressBalance).filter(Layer2AddressBalance.address == _address).first()
        except Exception as e:
            logging.error(f"Error getting address balance cache for {_address}: {e}")
            raise

    @staticmethod
    def updateBalance(db: DatabaseSession, _address, amount, transactionIdToIgnore=None):
        t1 = datetime.datetime.now()
        try:
            hit = db.query(Layer2AddressBalance).filter(Layer2AddressBalance.address == _address).first()
            if not hit:
                final_balance = 0
                (balance, balance_found) = Transaction.get_balance(db, _address, False, transactionIdToIgnore)
                if(balance_found):
                    final_balance = balance + amount
                else:
                    final_balance = amount
                hit = Layer2AddressBalance(address=_address, balance=final_balance)
                db.add(hit)
            else:
                hit.balance += amount
            DebugLogger.TransactionDuration.logDuration(t1, _address, 'updateBalance')
        except Exception as e:
            raise


    @staticmethod
    def put(db: DatabaseSession, instance):
        try:
            db.add(instance)
            return instance.id
        except Exception as e:
            raise

class Transaction(Base):
    __tablename__ = "transactions"

    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    amount = Column(Integer)
    fee = Column(Integer)
    source_address_pubkey = Column(String, index=True)
    destination_address_pubkey = Column(String, index=True)
    transaction_type = Column(Integer)
    layer2_transaction_id = Column(String, primary_key=True, index=True) # unique identifier for the transaction in layer 2
    signature = Column(String)
    signature_date = Column(Integer)
    layer1_transaction_id = Column(String)
    layer2_withdrawal_id = Column(String)

    TRX_TRANSFER = 1  # regular 2nd layer transfer
    TRX_DEPOSIT = 2  # when a user deposits btc to a deposit address, then funds get credited to his pubkey
    TRX_WITHDRAWAL_INITIATED = 3  # when the user wants to withdraw to a btc address (locks that amount)
    TRX_WITHDRAWAL_BROADCASTED = 4 # when the transaction is broadcasted and in the mempool
    TRX_WITHDRAWAL_CANCELED = 5  # when the transaction gets removed from the layer1 mempool for any reason
    TRX_WITHDRAWAL_CONFIRMED = 6  # when the withdrawal gets confirmed in the layer1 chain
    INSTRUCTION_GET_DEPOSIT_ADDRESS = 7 # instruction to get a deposit address
    INSTRUCTION_LAYER1_AUDIT = 8

    def timestamp_as_unix_milliseconds(self):
        return int(self.timestamp.timestamp() * 1000) #TODO: make actually accurate instead of rounding to 1000 milliseconds

    @staticmethod
    def put(db: DatabaseSession, instance):
        try:
            db.add(instance)
            return instance.layer2_transaction_id
        except Exception as e:
            raise

    @staticmethod
    def process_transaction(_transaction_type, _amount, _fee, _source, _destination, _message, _signature, _layer2_transaction_id, _layer1_transaction_id = None):
        status = ErrorMessage.ERROR_UNKNOWN

        if(_amount < 0 or _fee < 0):
            return ErrorMessage.ERROR_NEGATIVE_AMOUNT

        if(_amount <= _fee):
            return ErrorMessage.ERROR_AMOUNT_LESS_THAN_FEE

        if(not _layer2_transaction_id.isalnum()):
            return ErrorMessage.ERROR_NOT_ALPHANUMERIC
        
        if(_transaction_type == Transaction.TRX_WITHDRAWAL_INITIATED and (_amount < MINIMUM_LAYER1_TRANSACTION_AMOUNT)):
            return ErrorMessage.ERROR_AMOUNT_LESS_THAN_MINIMUM_WITHDRAWAL_AMOUNT

        source = Address(_source)

        if(_transaction_type in [Transaction.TRX_WITHDRAWAL_CANCELED, Transaction.TRX_WITHDRAWAL_CONFIRMED]):
            if(_source != signing_keys.FULLNODE_SIGNING_KEY_PUBKEY):
                return ErrorMessage.ERROR_ONBOARDING_PUBKEY_MISMATCH

        signature_verified = source.verify_signature(_message, _signature)
        if(not signature_verified):
            return ErrorMessage.ERROR_CANNOT_VERIFY_SIGNATURE

        try:
            if(TRANSACTION_MODE == TransactionMode.ADDRESSLOCK):
                with layer2_address_lock.acquire([source.pubkey, _destination]) as acquired:
                    if not acquired:
                        return ErrorMessage.ERROR_ADDRESS_LOCKED
                    # If the lock was successful, proceed with the transaction
                    # This ensures that the transaction is not processed if the addresses are locked
                    # and prevents duplicate transactions for the same addresses.
                    # The lock will be released automatically when the context manager exits or an exception occurs.
                    with get_db() as db:
                        try:
                            status = Transaction.put_transaction(db, _transaction_type, source, _amount, _fee, _destination, _message, _signature, _layer2_transaction_id, _layer1_transaction_id)
                            db.flush()  # Ensure the Transaction is written to the database
                            if((_transaction_type == Transaction.TRX_WITHDRAWAL_INITIATED) and (status == ErrorMessage.ERROR_SUCCESS)):
                                Onboarding.WithdrawalRequests.addWithdrawalRequest(db, _destination, _layer2_transaction_id, _amount)
                            db.commit()
                        except Exception as ex:
                            db.rollback()
                            status = ErrorMessage.ERROR_FAILED_TO_WRITE_TO_DATABASE
                            GlobalLogging.log_text(traceback.format_exc())                   
            elif(TRANSACTION_MODE == TransactionMode.TRANSACTION_PUTTRANSACTION):
                return ErrorMessage.ERROR_TRANSACTION_LOCK_MODE_NOT_SUPPORTED
                #status = Transaction.put_transaction(db, _transaction_type, source, _amount, _fee, _destination, _message, _signature, _layer2_transaction_id, _layer1_transaction_id)
        except Exception as ex:
            GlobalLogging.log_text(traceback.format_exc())
            return ErrorMessage.ERROR_DATABASE_TRANSACTIONAL_ERROR

        return status

    @staticmethod
    def put_transaction(db: DatabaseSession, _transaction_type, source, _amount, _fee, _destination, _message, _signature, _layer2_transaction_id, _layer1_transaction_id = None):
        t1 = datetime.datetime.now()
        status = ErrorMessage.ERROR_UNKNOWN
        try:
            nonce_exists = db.query(Transaction).filter(Transaction.layer2_transaction_id == _layer2_transaction_id).first()
            if nonce_exists:
                status = ErrorMessage.ERROR_DUPLICATE_TRANSACTION_ID
            else:
                (balance, _) = Transaction.get_balance(db, source.pubkey, ADDRESS_BALANCE_CACHE_ENABLED)
                if balance >= _amount or _transaction_type == Transaction.TRX_DEPOSIT:
                    trx = Transaction(
                        amount=_amount,
                        fee=_fee,
                        source_address_pubkey=source.pubkey,
                        destination_address_pubkey=_destination,
                        transaction_type=_transaction_type,
                        signature=_signature,
                        layer2_transaction_id=_layer2_transaction_id,
                        layer1_transaction_id=_layer1_transaction_id
                    )
                    db.add(trx)

                    updateAdressBalanceCache = (ADDRESS_BALANCE_CACHE_ENABLED and _transaction_type != Transaction.TRX_WITHDRAWAL_CONFIRMED)
                    if updateAdressBalanceCache:
                        Layer2AddressBalance.updateBalance(db, source.pubkey, -_amount, trx.layer2_transaction_id)
                        Layer2AddressBalance.updateBalance(db,_destination, _amount-_fee, trx.layer2_transaction_id)
                    add_fee(db, _fee)
                    status = ErrorMessage.ERROR_SUCCESS
                else:
                    status = ErrorMessage.ERROR_INSUFFICIENT_FUNDS
        except Exception as e:
            GlobalLogging.log_text("put_transaction: Failed to insert transaction")
            status = ErrorMessage.ERROR_FAILED_TO_WRITE_TO_DATABASE
            raise

        DebugLogger.TransactionDuration.logDuration(t1, _layer2_transaction_id, 'put_transaction')
        return status

    @staticmethod
    def get_balance(db: DatabaseSession, pubkey, useCache=True, transactionIdToIgnore=None) -> Tuple[int, bool]:
        t1 = datetime.datetime.now()
        trx_count: int = 0
        address_found: bool = False

        address = Address(pubkey)
        balance = 0
        balance_found_from_cache = False

        if useCache:
            hit = Layer2AddressBalance.get(db, address.pubkey)
            if hit:
                balance = hit.balance
                balance_found_from_cache = True
                address_found = True

        if not balance_found_from_cache:
            output_query = db.query(Transaction).filter(Transaction.source_address_pubkey == address.pubkey)
            input_query = db.query(Transaction).filter(Transaction.destination_address_pubkey == address.pubkey)

            if transactionIdToIgnore is not None:
                output_query = output_query.filter(Transaction.layer2_transaction_id != transactionIdToIgnore)
                input_query = input_query.filter(Transaction.layer2_transaction_id != transactionIdToIgnore)

            for output in output_query.all():
                balance -= output.amount
                trx_count += 1
                address_found = True

            for input in input_query.all():
                if input.transaction_type != Transaction.TRX_WITHDRAWAL_CONFIRMED:
                    balance += input.amount - input.fee
                    trx_count += 1
                    address_found = True

        DebugLogger.TransactionDuration.logDuration(t1, address.pubkey, 'get_balance', trx_count)
        return (balance, address_found)

    @staticmethod
    def get_transaction(db: DatabaseSession, transaction_id):
        t1 = datetime.datetime.now()
        result = ErrorMessage.ERROR_SUCCESS
        try:
            transaction = db.query(Transaction).filter(Transaction.layer2_transaction_id == transaction_id).first()
            if not transaction:
                result = ErrorMessage.ERROR_TRANSACTION_ID_NOT_FOUND
        except Exception as e:
            raise
        DebugLogger.TransactionDuration.logDuration(t1, transaction_id, 'get_transaction')
        return result, transaction


    @staticmethod
    def get_all_transactions(db: DatabaseSession, public_key: str) -> List['Transaction']:
        t1 = datetime.datetime.now()
        try:
            transactions = []
            output_transactions = db.query(Transaction).filter(Transaction.source_address_pubkey == public_key).all()
            input_transactions = db.query(Transaction).filter(Transaction.destination_address_pubkey == public_key).all()
            transactions.extend(output_transactions)
            transactions.extend(input_transactions)
            DebugLogger.TransactionDuration.logDuration(t1, public_key, 'get_all_transactions', len(transactions))
            return transactions
        except Exception as e:
            raise


