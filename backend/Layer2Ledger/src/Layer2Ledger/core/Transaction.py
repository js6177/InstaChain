from sqlalchemy import Column, Integer, BigInteger, String, DateTime, Boolean, Text, JSON, Enum, select
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
from Layer2Ledger.database.database import Base, get_db, AsyncSession
import logging
from Layer2Ledger.core.Address import Address
from Layer2Ledger.core import ErrorMessage
from typing import List, Self
from enum import Enum as PyEnum, auto
from typing import Tuple
import string
import datetime
import traceback
from Layer2Ledger.core import DebugLogger
from Layer2Ledger.core import signing_keys
from Layer2Ledger.core import GlobalLogging
from Layer2Ledger.core import Onboarding
from Layer2Ledger.API.NodeInfoAPI import MINIMUM_LAYER1_TRANSACTION_AMOUNT
from Layer2Ledger.core.KeyValueStore import KeyValueStore
from Layer2Ledger.managers.Layer2AddressLock import layer2_address_lock

class TransactionMode(PyEnum):
    ADDRESSLOCK = auto() # source and destination addresses are locked, preventing duplicates
    TRANSACTION_PUTTRANSACTION = auto() # the entire transaction is handled in a single database transaction
    NONE = auto() # if in the future, concurrency is handled by an outside program

TRANSACTION_MODE = TransactionMode.ADDRESSLOCK
ADDRESS_BALANCE_CACHE_ENABLED = True

async def add_fee(db: AsyncSession, fee: int):
    """Add fee to the total fees stored in KeyValueStore."""
    return await KeyValueStore.increment_int(db, 'fees', fee, 0)

class Layer2AddressBalance(Base):
    __tablename__ = "address_balance_cache"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    address: Mapped[str] = mapped_column(String, unique=True, index=True)
    balance: Mapped[int] = mapped_column(Integer)
    timestamp: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    @staticmethod
    async def get(db: AsyncSession, _address):
        try:
            result = await db.execute(select(Layer2AddressBalance).filter(Layer2AddressBalance.address == _address))
            return result.scalars().first()
        except Exception as e:
            logging.error(f"Error getting address balance cache for {_address}: {e}")
            raise

    @staticmethod
    async def updateBalance(db: AsyncSession, _address, amount, transactionIdToIgnore=None):
        t1 = datetime.datetime.now()
        try:
            result = await db.execute(select(Layer2AddressBalance).filter(Layer2AddressBalance.address == _address))
            hit = result.scalars().first()
            if not hit:
                final_balance = 0
                (balance, balance_found) = await Transaction.get_balance(db, _address, False, transactionIdToIgnore)
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
    async def put(db: AsyncSession, instance):
        try:
            db.add(instance)
            await db.flush()
            return instance.id
        except Exception as e:
            raise

class Transaction(Base):
    __tablename__ = "transactions"

    timestamp: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    amount: Mapped[int] = mapped_column(Integer)
    fee: Mapped[int] = mapped_column(Integer)
    source_address_pubkey: Mapped[str] = mapped_column(String, index=True)
    destination_address_pubkey: Mapped[str] = mapped_column(String, index=True)
    transaction_type: Mapped[int] = mapped_column(Integer)
    layer2_transaction_id: Mapped[str] = mapped_column(String, primary_key=True, index=True)
    signature: Mapped[str] = mapped_column(String)
    signature_date: Mapped[int] = mapped_column(BigInteger)
    layer1_transaction_id: Mapped[str] = mapped_column(String)
    layer2_withdrawal_id: Mapped[str] = mapped_column(String)

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
    async def put(db: AsyncSession, instance):
        try:
            db.add(instance)
            await db.flush()
            return instance.layer2_transaction_id
        except Exception as e:
            raise

    @staticmethod
    async def process_transaction(db: AsyncSession, _transaction_type, _amount, _fee, _source, _destination, _message, _signature, _layer2_transaction_id, _layer1_transaction_id = None):
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
                async with layer2_address_lock.acquire([source.pubkey, _destination]) as acquired:
                    if not acquired:
                        return ErrorMessage.ERROR_ADDRESS_LOCKED
                    # If the lock was successful, proceed with the transaction
                    # This ensures that the transaction is not processed if the addresses are locked
                    # and prevents duplicate transactions for the same addresses.
                    # The lock will be released automatically when the context manager exits or an exception occurs.
                    try:
                        status = await Transaction.put_transaction(db, _transaction_type, source, _amount, _fee, _destination, _message, _signature, _layer2_transaction_id, _layer1_transaction_id)
                        await db.flush()  # Ensure the Transaction is written to the database
                        if((_transaction_type == Transaction.TRX_WITHDRAWAL_INITIATED) and (status == ErrorMessage.ERROR_SUCCESS)):
                            await Onboarding.WithdrawalRequests.addWithdrawalRequest(db, _destination, _layer2_transaction_id, _amount)
                        await db.commit()
                    except Exception as ex:
                        await db.rollback()
                        status = ErrorMessage.ERROR_FAILED_TO_WRITE_TO_DATABASE
                        GlobalLogging.log_text(traceback.format_exc())                   
            elif(TRANSACTION_MODE == TransactionMode.TRANSACTION_PUTTRANSACTION):
                return ErrorMessage.ERROR_TRANSACTION_LOCK_MODE_NOT_SUPPORTED
                #status = await Transaction.put_transaction(db, _transaction_type, source, _amount, _fee, _destination, _message, _signature, _layer2_transaction_id, _layer1_transaction_id)
        except Exception as ex:
            GlobalLogging.log_text(traceback.format_exc())
            return ErrorMessage.ERROR_DATABASE_TRANSACTIONAL_ERROR

        return status

    @staticmethod
    async def put_transaction(db: AsyncSession, _transaction_type, source, _amount, _fee, _destination, _message, _signature, _layer2_transaction_id, _layer1_transaction_id = None):
        t1 = datetime.datetime.now()
        status = ErrorMessage.ERROR_UNKNOWN
        try:
            result = await db.execute(select(Transaction).filter(Transaction.layer2_transaction_id == _layer2_transaction_id))
            nonce_exists = result.scalars().first()
            if nonce_exists:
                status = ErrorMessage.ERROR_DUPLICATE_TRANSACTION_ID
            else:
                (balance, _) = await Transaction.get_balance(db, source.pubkey, ADDRESS_BALANCE_CACHE_ENABLED)
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
                        await Layer2AddressBalance.updateBalance(db, source.pubkey, -_amount, trx.layer2_transaction_id)
                        await Layer2AddressBalance.updateBalance(db,_destination, _amount-_fee, trx.layer2_transaction_id)
                    await add_fee(db, _fee)
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
    async def get_balance(db: AsyncSession, pubkey, useCache=True, transactionIdToIgnore=None) -> Tuple[int, bool]:
        t1 = datetime.datetime.now()
        trx_count: int = 0
        address_found: bool = False

        address = Address(pubkey)
        balance = 0
        balance_found_from_cache = False

        if useCache:
            hit = await Layer2AddressBalance.get(db, address.pubkey)
            if hit:
                balance = hit.balance
                balance_found_from_cache = True
                address_found = True

        if not balance_found_from_cache:
            output_query = select(Transaction).filter(Transaction.source_address_pubkey == address.pubkey)
            input_query = select(Transaction).filter(Transaction.destination_address_pubkey == address.pubkey)

            if transactionIdToIgnore is not None:
                output_query = output_query.filter(Transaction.layer2_transaction_id != transactionIdToIgnore)
                input_query = input_query.filter(Transaction.layer2_transaction_id != transactionIdToIgnore)

            output_result = await db.execute(output_query)
            for output in output_result.scalars().all():
                balance -= output.amount
                trx_count += 1
                address_found = True

            input_result = await db.execute(input_query)
            for input in input_result.scalars().all():
                if input.transaction_type != Transaction.TRX_WITHDRAWAL_CONFIRMED:
                    balance += input.amount - input.fee
                    trx_count += 1
                    address_found = True

        DebugLogger.TransactionDuration.logDuration(t1, address.pubkey, 'get_balance', trx_count)
        return (balance, address_found)

    @staticmethod
    async def get_transaction(db: AsyncSession, transaction_id):
        t1 = datetime.datetime.now()
        result = ErrorMessage.ERROR_SUCCESS
        try:
            result = await db.execute(select(Transaction).filter(Transaction.layer2_transaction_id == transaction_id))
            transaction = result.scalars().first()
            if not transaction:
                result = ErrorMessage.ERROR_TRANSACTION_ID_NOT_FOUND
        except Exception as e:
            raise
        DebugLogger.TransactionDuration.logDuration(t1, transaction_id, 'get_transaction')
        return result, transaction


    @staticmethod
    async def get_all_transactions(db: AsyncSession, public_key: str) -> List['Transaction']:
        t1 = datetime.datetime.now()
        try:
            transactions = []
            output_result = await db.execute(select(Transaction).filter(Transaction.source_address_pubkey == public_key))
            output_transactions = output_result.scalars().all()
            input_result = await db.execute(select(Transaction).filter(Transaction.destination_address_pubkey == public_key))
            input_transactions = input_result.scalars().all()
            transactions.extend(output_transactions)
            transactions.extend(input_transactions)
            DebugLogger.TransactionDuration.logDuration(t1, public_key, 'get_all_transactions', len(transactions))
            return transactions
        except Exception as e:
            raise


