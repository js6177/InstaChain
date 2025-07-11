import time
from typing import List
from sqlalchemy import Column, Integer, BigInteger, String, DateTime, Boolean, Text, ForeignKey
from sqlalchemy.sql import func
from Layer2Ledger.database.database import Base, DatabaseSession, get_db
from Layer2Ledger.core import ErrorMessage
from Layer2Ledger.core import Address as Address
from Layer2Ledger.core import signing_keys
from Layer2Ledger.core import Transaction
from Layer2Ledger.core import KeyVerification
import logging
import random
import string
import datetime
import math
from Layer2Ledger.utils.utils import generate_btc_testnet_address
from Layer2Ledger.core import GlobalLogging
from Layer2Ledger.config import get_config
import json

DEPOSIT_WALLET_MASTER_PUBKEY = get_config('DEPOSIT_WALLET_MASTER_PUBKEY')

class MasterPublicKeyIndex(Base):
    __tablename__ = "master_public_key_indices"

    id = Column(Integer, primary_key=True, index=True)
    mpk_index = Column(BigInteger, nullable=False)

    @staticmethod
    def getIndexAndAtomicallyIncrement() -> int:
        with get_db() as db:
            try:
                row = db.query(MasterPublicKeyIndex).first()
                if not row:
                    _index = 0
                    row = MasterPublicKeyIndex(mpk_index=_index)
                    db.add(row)
                else:
                    row.mpk_index += 1
                    _index = row.mpk_index
                db.commit()
                return _index
            except Exception as e:
                db.rollback()
                raise

class WithdrawalRequests(Base):
    __tablename__ = "withdrawal_requests"

    id = Column(Integer, primary_key=True, index=True)
    layer1_address = Column(String, index=True)  # layer1 address to withdraw to
    layer1_transaction_id = Column(String, nullable=True)  # transaction id of the confirmed layer1 transaction
    status = Column(Integer)  # status of this withdrawal
    amount = Column(Integer)  # amount withdrawing
    layer2_withdrawal_id = Column(String, unique=True, index=True)
    server_signature = Column(String, nullable=True)  # signed with the onboarding key
    layer2_transaction_id = Column(String)  # transaction id that requested this withdrawal
    withdrawal_requested_timestamp = Column(Integer)  # unix time in seconds
    withdrawal_requested_timestamp_str = Column(DateTime(timezone=True), server_default=func.now())

    WITHDRAWAL_STATUS_PENDING = 1  # the Layer2Bridge has not queried this request
    WITHDRAWAL_STATUS_ACKNOWLEDGED = 2  # the Layer2Bridge has queried and ack'ed, but the transaction has not been broadcasted to the layer1 network
    WITHDRAWAL_STATUS_BROADCASTED = 3  # the transaction has been broadcasted to the layer1 network but not confirmed
    WITHDRAWAL_STATUS_CONFIRMED = 4  # the transaction has been confirmed on the layer1 network

    def sign_withdrawal_request(self):
        message = self.layer1_address + ' ' + self.layer2_withdrawal_id + ' ' + self.layer2_transaction_id

    @staticmethod
    def addWithdrawalRequest(db: DatabaseSession, _layer1_address, _layer2_transaction_id, _amount):
        try:
            w = WithdrawalRequests(
                layer1_address=_layer1_address,
                layer2_transaction_id=_layer2_transaction_id,
                status=WithdrawalRequests.WITHDRAWAL_STATUS_PENDING,
                amount=_amount,
                withdrawal_requested_timestamp=int(time.time_ns() / 1e6)
            )
            w.layer2_withdrawal_id = ''.join(random.choice(string.ascii_uppercase + string.ascii_lowercase + string.digits) for _ in range(16))
            w.server_signature = w.sign_withdrawal_request()
            db.add(w)

            result, trx = Transaction.Transaction.get_transaction(db, _layer2_transaction_id)
            if trx:
                trx.layer2_withdrawal_id = w.layer2_withdrawal_id
                Transaction.Transaction.put(db, trx)
            GlobalLogging.log_text("WithdrawalRequest id " + str(w.id))
        except Exception as e:
            raise


    @staticmethod
    def getWithdrawalRequests(db: DatabaseSession, latest_timestamp: int):
        try:
            requests = db.query(WithdrawalRequests).filter(
                WithdrawalRequests.withdrawal_requested_timestamp > latest_timestamp,
                WithdrawalRequests.status == WithdrawalRequests.WITHDRAWAL_STATUS_PENDING
            ).all()
            return requests
        except Exception as e:
            raise

    @staticmethod
    def getWithdrawalRequest(db: DatabaseSession, _layer2_withdrawal_id: str):
        try:
            return db.query(WithdrawalRequests).filter(
                WithdrawalRequests.layer2_withdrawal_id == _layer2_withdrawal_id
            ).first()
        except Exception as e:
            raise

    @staticmethod
    def ackWithdrawalRequests(db: DatabaseSession, layer2_withdrawal_ids):
        try:
            for layer2_withdrawal_id in layer2_withdrawal_ids:
                withdrawal = db.query(WithdrawalRequests).filter(
                    WithdrawalRequests.layer2_withdrawal_id == layer2_withdrawal_id
                ).first()
                if withdrawal:
                    withdrawal.status = WithdrawalRequests.WITHDRAWAL_STATUS_ACKNOWLEDGED
        except Exception as e:
            raise

    @staticmethod
    def put(db: DatabaseSession, instance):
        try:
            db.add(instance)
            return instance.id
        except Exception as e:
            raise


class ConfirmedWithdrawals(Base):
    __tablename__ = "confirmed_withdrawals"

    id = Column(Integer, primary_key=True, index=True)
    layer1_transaction_id = Column(String, index=True)
    layer1_transaction_vout = Column(Integer)
    layer1_address = Column(String, index=True)
    amount = Column(Integer)
    layer2_withdrawal_id = Column(String, unique=True, index=True)
    broadcasted_signature = Column(String)
    confirmed_signature = Column(String)
    confirmed = Column(Boolean, default=False)
    confirmation_timestamp_str = Column(DateTime(timezone=True), server_default=func.now())

    @staticmethod
    def getWithdrawals(db: DatabaseSession, layer1_transaction_id, layer1_transaction_vout):
        try:
            return db.query(ConfirmedWithdrawals).filter(
                ConfirmedWithdrawals.layer1_transaction_id == layer1_transaction_id,
                ConfirmedWithdrawals.layer1_transaction_vout == layer1_transaction_vout
            ).all()
        except Exception as e:
            raise

    @staticmethod
    def put(db: DatabaseSession, instance):
        try:
            db.add(instance)
            return instance.id
        except Exception as e:
            raise

class DepositAddresses(Base):
    __tablename__ = "deposit_addresses"

    id = Column(Integer, primary_key=True, index=True)
    layer2_address = Column(String, index=True)  # public key whose deposits should be credit towards
    nonce = Column(String)
    layer1_address = Column(String, unique=True, index=True)  # btc address they deposit funds into
    signature = Column(String)  # when they get a deposit address, they will sign to verify that it belongs to them
    date_requested = Column(DateTime(timezone=True), server_default=func.now())
    mpk_index = Column(Integer)

    @staticmethod
    def getLayer1DepositAddressFromLayer2AddressPubkey(db: DatabaseSession, _layer2_address):
        try:
            return db.query(DepositAddresses).filter(
                DepositAddresses.layer2_address == _layer2_address
            ).first()
        except Exception as e:
            raise
    
    @staticmethod
    def getLayer2PubkeyFromLayer1Address(db: DatabaseSession, _layer1_address):
        try:
            deposit = db.query(DepositAddresses).filter(
                DepositAddresses.layer1_address == _layer1_address
            ).first()
            return deposit.layer2_address if deposit else None
        except Exception as e:
            raise

    @staticmethod
    def put(db: DatabaseSession, instance):
        try:
            db.add(instance)
            return instance.id
        except Exception as e:
            raise

# Called by user
def getDepositAddress(_layer2_address, nonce, signature):
    status = ErrorMessage.ERROR_SUCCESS
    if (not KeyVerification.verifyGetDepositAddress(_layer2_address, nonce, signature)):
        return ErrorMessage.ERROR_CANNOT_VERIFY_SIGNATURE, None

    #if the address is already created through a previous request
    with get_db() as db:
        try:
            #TODO: add lock to prevent multiple requests getting same index
            deposit_adress = DepositAddresses.getLayer1DepositAddressFromLayer2AddressPubkey(db, _layer2_address)
            if(deposit_adress):
                return status, deposit_adress.layer1_address
        except Exception as e:
            logging.error(f"Error in getDepositAddress: {e}")
            return ErrorMessage.ERROR_FAILED_TO_READ_FROM_DATABASE, None

    index = None
    try:
        index = MasterPublicKeyIndex.getIndexAndAtomicallyIncrement()
    except Exception as e:
        logging.error(f"Error in getDepositAddress: {e}")
        return ErrorMessage.ERROR_FAILED_TO_READ_FROM_DATABASE, None
    GlobalLogging.log_text("getDepositAddress index: " + str(index))

    deposit_layer1_address = generate_btc_testnet_address(DEPOSIT_WALLET_MASTER_PUBKEY, index)

    logging.info('deposit_layer1_address: ' + deposit_layer1_address)
    d = DepositAddresses(layer2_address = _layer2_address, layer1_address = deposit_layer1_address, signature = '', mpk_index = index)
    with get_db() as db:
        try:
            DepositAddresses.put(db, d)
            db.commit()
        except Exception as e:
            db.rollback()
            logging.error(f"Error in getDepositAddress: {e}")
            return ErrorMessage.ERROR_FAILED_TO_WRITE_TO_DATABASE, None
    return status, deposit_layer1_address

# Called by full node
# When a deposit is confirmed, the full node calls this function, to credit the layer2 address with the deposited funds
def depositConfirmed(layer1_transaction_id, layer1_transaction_vout, layer1_address, amount, _nonce, signature):
    #check to see if this deposit comes from our btc full node
    if(not KeyVerification.verifyDeposit(layer1_transaction_id, layer1_transaction_vout, layer1_address, amount, _nonce, signature)):
        return ErrorMessage.ERROR_CANNOT_VERIFY_SIGNATURE
    
    destination_pubkey = None
    with get_db() as db:
        try:
            destination_pubkey = DepositAddresses.getLayer2PubkeyFromLayer1Address(db, layer1_address)
            if (not destination_pubkey):
                return ErrorMessage.ERROR_DEPOSIT_ADDRESS_NOT_FOUND
        except Exception as e:
            logging.error(f"Error in depositConfirmed: {e}")
            return ErrorMessage.ERROR_FAILED_TO_READ_FROM_DATABASE

    source = signing_keys.ONBOARDING_DEPOSIT_SIGNING_KEY_PUBKEY
    destination_address = Address.Address(destination_pubkey)
    fee = 0

    nonce = _nonce
    onboarding_transaction_signing_address = Address.Address.fromPrivateKey(signing_keys.ONBOARDING_DEPOSIT_SIGNING_KEY_PRIVKEY)
    message = str(Transaction.Transaction.TRX_DEPOSIT) + " " + source + " " + destination_pubkey + " " + str(amount) + " " + str(fee) + " " + nonce
    signature = onboarding_transaction_signing_address.sign(message).decode("utf-8")
    status = Transaction.Transaction.process_transaction(Transaction.Transaction.TRX_DEPOSIT, amount, fee, source, destination_pubkey, message, signature, nonce, layer1_transaction_id)

    return status

def withdrawalBroadcasted(_layer1_transaction_id, _layer1_transaction_vout, _layer1_address,  _amount, _layer2_withdrawal_id, _signature):
    if(not KeyVerification.verifyWithdrawalBroadcasted(_layer1_transaction_id, _layer1_transaction_vout, _layer1_address, _amount, _layer2_withdrawal_id, _signature)):
        return ErrorMessage.ERROR_CANNOT_VERIFY_SIGNATURE
     
    withdrawalConfirmation = ConfirmedWithdrawals(confirmed = False, layer1_transaction_id = _layer1_transaction_id, layer1_transaction_vout =_layer1_transaction_vout, layer1_address = _layer1_address, amount = _amount, layer2_withdrawal_id = _layer2_withdrawal_id, broadcasted_signature = _signature)
    with get_db() as db:
        try:
            ConfirmedWithdrawals.put(db, withdrawalConfirmation)
            db.commit()
        except Exception as e:
            db.rollback()
            logging.error(f"Error in withdrawalBroadcasted: {e}")
            return ErrorMessage.ERROR_FAILED_TO_WRITE_TO_DATABASE
    return ErrorMessage.ERROR_SUCCESS

def withdrawalConfirmed(_layer1_transaction_id, _layer1_transaction_vout,  _layer1_address, _amount, _signature):
    status = ErrorMessage.ERROR_SUCCESS
    if(not KeyVerification.verifyWithdrawalConfirmed(_layer1_transaction_id, _layer1_transaction_vout, _layer1_address, _amount, _signature)):
        return ErrorMessage.ERROR_CANNOT_VERIFY_SIGNATURE

    #TODO decide if need to lock addresses
    with get_db() as db:
        try:
            withdrawals = ConfirmedWithdrawals.getWithdrawals(db, _layer1_transaction_id, _layer1_transaction_vout)
            layer2_withdrawal_ids = set()
            for withdrawal in withdrawals:
                if(withdrawal.confirmed != True):
                    withdrawal.confirmed = True
                    withdrawal.confirmed_signature = _signature
                    ConfirmedWithdrawals.put(db, withdrawal)
                    layer2_withdrawal_ids.add(withdrawal.layer2_withdrawal_id)
            for layer2_withdrawal_id in layer2_withdrawal_ids:
                withdrawalRequest = WithdrawalRequests.getWithdrawalRequest(db, layer2_withdrawal_id)
                if(withdrawalRequest):
                    withdrawalRequest.status = WithdrawalRequests.WITHDRAWAL_STATUS_CONFIRMED
                    withdrawalRequest.layer1_transaction_id = _layer1_transaction_id
                    WithdrawalRequests.put(db, withdrawalRequest)
                    result, trx = Transaction.Transaction.get_transaction(db, withdrawalRequest.layer2_transaction_id)
                    if(trx):
                        trx.layer1_transaction_id = _layer1_transaction_id
                        Transaction.Transaction.put(db, trx)
            db.commit()
        except Exception as e:
            logging.error(f"Error in withdrawalConfirmed: {e}")
            db.rollback()
            return ErrorMessage.ERROR_FAILED_TO_WRITE_TO_DATABASE
    return status

def getWithdrawalRequests(latest_timestamp):
    with get_db() as db:
        try:
            return WithdrawalRequests.getWithdrawalRequests(db, latest_timestamp)
        except Exception as e:
            logging.error(f"Error in getWithdrawalRequests: {e}")
            return ErrorMessage.ERROR_FAILED_TO_READ_FROM_DATABASE

def ackWithdrawalRequests(layer2_withdrawal_ids):
    with get_db() as db:
        try:
            WithdrawalRequests.ackWithdrawalRequests(db, layer2_withdrawal_ids)
        except Exception as e:
            logging.error(f"Error in ackWithdrawalRequests: {e}")
            return ErrorMessage.ERROR_FAILED_TO_WRITE_TO_DATABASE

def withdrawalCanceled():
    return  ErrorMessage.ERROR_FEATURE_NOT_SUPPORTED #for now we are not supporting canceling withdrawals