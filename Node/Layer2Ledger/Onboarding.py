from sqlalchemy import Column, Integer, BigInteger, String, DateTime, Boolean, Text, ForeignKey
from sqlalchemy.sql import func
from database import Base, get_db
import ErrorMessage
import Address
import signing_keys
import Transaction
import KeyVerification
import logging
import random
import string
import datetime
import math
import os
from utils import generate_btc_testnet_address
import GlobalLogging

DEPOSIT_WALLET_MASTER_PUBKEY = os.environ.get('DEPOSIT_WALLET_MASTER_PUBKEY')


class MasterPublicKeyIndex(Base):
    __tablename__ = "master_public_key_indices"

    id = Column(Integer, primary_key=True, index=True)
    mpk_index = Column(BigInteger, nullable=False)

    @staticmethod
    def getIndexAndAtomicallyIncrement() -> int:
        db = next(get_db())
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
            raise e
        finally:
            db.close()

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

    WITHDRAWAL_STATUS_PENDING = 1  # the node has not queries this request
    WITHDRAWAL_STATUS_IN_PROGRESS = 2  # the node has queried, but the transaction has not been broadcasted
    WITHDRAWAL_STATUS_CONFIRMED = 3  # the transaction has been confirmed

    def to_dict(self):
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}

    def sign_withdrawal_request(self):
        message = self.layer1_address + ' ' + self.layer2_withdrawal_id + ' ' + self.layer2_transaction_id

    @staticmethod
    def addWithdrawalRequest(_layer1_address, _layer2_transaction_id, _amount):
        db = next(get_db())
        try:
            w = WithdrawalRequests(
                layer1_address=_layer1_address,
                layer2_transaction_id=_layer2_transaction_id,
                status=WithdrawalRequests.WITHDRAWAL_STATUS_PENDING,
                amount=_amount,
                withdrawal_requested_timestamp=int(datetime.datetime.now().timestamp())
            )
            w.layer2_withdrawal_id = ''.join(random.choice(string.ascii_uppercase + string.ascii_lowercase + string.digits) for _ in range(16))
            w.server_signature = w.sign_withdrawal_request()
            db.add(w)
            db.commit()

            result, trx = Transaction.Transaction.get_transaction(_layer2_transaction_id)
            if trx:
                trx.layer2_withdrawal_id = w.layer2_withdrawal_id
                Transaction.Transaction.put(trx)
            GlobalLogging.logger.log_text("WithdrawalRequest id " + str(w.id))
        except Exception as e:
            db.rollback()
            raise e
        finally:
            db.close()

    @staticmethod
    def getWithdrawalRequests(latest_timestamp: int):
        db = next(get_db())
        try:
            requests = db.query(WithdrawalRequests).filter(
                WithdrawalRequests.withdrawal_requested_timestamp > latest_timestamp,
                WithdrawalRequests.status == WithdrawalRequests.WITHDRAWAL_STATUS_PENDING
            ).all()
            return requests
        finally:
            db.close()

    @staticmethod
    def getWithdrawalRequest(_layer2_withdrawal_id: str):
        db = next(get_db())
        try:
            return db.query(WithdrawalRequests).filter(
                WithdrawalRequests.layer2_withdrawal_id == _layer2_withdrawal_id
            ).first()
        finally:
            db.close()

    @staticmethod
    def ackWithdrawalRequests(layer2_withdrawal_ids):
        db = next(get_db())
        try:
            for layer2_withdrawal_id in layer2_withdrawal_ids:
                withdrawal = db.query(WithdrawalRequests).filter(
                    WithdrawalRequests.layer2_withdrawal_id == layer2_withdrawal_id
                ).first()
                if withdrawal:
                    withdrawal.status = WithdrawalRequests.WITHDRAWAL_STATUS_IN_PROGRESS
            db.commit()
        except Exception as e:
            db.rollback()
            raise e
        finally:
            db.close()

    @staticmethod
    def put(instance):
        db = next(get_db())
        try:
            db.add(instance)
            db.commit()
            return instance.id
        except Exception as e:
            db.rollback()
            raise e
        finally:
            db.close()

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
    def getWithdrawals(layer1_transaction_id, layer1_transaction_vout):
        db = next(get_db())
        try:
            return db.query(ConfirmedWithdrawals).filter(
                ConfirmedWithdrawals.layer1_transaction_id == layer1_transaction_id,
                ConfirmedWithdrawals.layer1_transaction_vout == layer1_transaction_vout
            ).all()
        finally:
            db.close()

    @staticmethod
    def put(instance):
        db = next(get_db())
        try:
            db.add(instance)
            db.commit()
            return instance.id
        except Exception as e:
            db.rollback()
            raise e
        finally:
            db.close()

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
    def getLayer1DepositAddressFromLayer2AddressPubkey(_layer2_address):
        db = next(get_db())
        try:
            return db.query(DepositAddresses).filter(
                DepositAddresses.layer2_address == _layer2_address
            ).first()
        finally:
            db.close()

    @staticmethod
    def getLayer2PubkeyFromLayer1Address(_layer1_address):
        db = next(get_db())
        try:
            deposit = db.query(DepositAddresses).filter(
                DepositAddresses.layer1_address == _layer1_address
            ).first()
            return deposit.layer2_address if deposit else None
        finally:
            db.close()

    @staticmethod
    def put(instance):
        db = next(get_db())
        try:
            db.add(instance)
            db.commit()
            return instance.id
        except Exception as e:
            db.rollback()
            raise e
        finally:
            db.close()

# Called by user
def getDepositAddress(_layer2_address, nonce, signature):
    status = ErrorMessage.ERROR_SUCCESS
    if (not KeyVerification.verifyGetDepositAddress(_layer2_address, nonce, signature)):
        return ErrorMessage.ERROR_CANNOT_VERIFY_SIGNATURE, None

    #if the address is already created through a previous request
    deposit_adress = DepositAddresses.getLayer1DepositAddressFromLayer2AddressPubkey(_layer2_address)
    if(deposit_adress):
        return status, deposit_adress.layer1_address

    #bip32_ctx = Bip32.FromExtendedKey(DEPOSIT_WALLET_MASTER_PUBKEY, Bip32Conf.KEY_NET_VER.Test())
    index = MasterPublicKeyIndex.getIndexAndAtomicallyIncrement()
    GlobalLogging.logger.log_text("getDepositAddress index: " + str(index))
    #divisor = math.floor(index/BIP32_MAX_INDEX)
    #remainder = index % BIP32_MAX_INDEX
    #bip32_ctx = bip32_ctx.ChildKey(44).ChildKey(1).ChildKey(divisor).ChildKey(remainder)
    #pubkey_bytes = bip32_ctx.PublicKey().RawCompressed().ToBytes()
    #deposit_layer1_address = P2PKH.ToAddress(pubkey_bytes, BitcoinConf.P2PKH_NET_VER.Test())

    deposit_layer1_address = generate_btc_testnet_address(DEPOSIT_WALLET_MASTER_PUBKEY, index)

    logging.info('deposit_layer1_address: ' + deposit_layer1_address)
    d = DepositAddresses(layer2_address = _layer2_address, layer1_address = deposit_layer1_address, signature = '', mpk_index = index)
    DepositAddresses.put(d)
    return status, deposit_layer1_address

# Called by full node
# When a deposit is confirmed, the full node calls this function, to credit the layer2 address with the deposited funds
def depositConfirmed(layer1_transaction_id, layer1_transaction_vout, layer1_address, amount, _nonce, signature):
    destination_pubkey = DepositAddresses.getLayer2PubkeyFromLayer1Address(layer1_address)
    if (not destination_pubkey):
        return ErrorMessage.ERROR_DEPOSIT_ADDRESS_NOT_FOUND

    #check to see if this deposit comes from our btc full node
    if(not KeyVerification.verifyDeposit(layer1_transaction_id, layer1_transaction_vout, layer1_address, amount, _nonce, signature)):
        return ErrorMessage.ERROR_CANNOT_VERIFY_SIGNATURE

    source = signing_keys.ONBOARDING_DEPOSIT_SIGNING_KEY_PUBKEY
    destination_address = Address.Address(destination_pubkey)
    fee = 0

    nonce = _nonce
    onboarding_transaction_signing_address = Address.Address.fromPrivateKey(signing_keys.ONBOARDING_DEPOSIT_SIGNING_KEY_PRIVKEY)
    message = str(Transaction.Transaction.TRX_DEPOSIT) + " " + source + " " + destination_pubkey + " " + str(amount) + " " + str(fee) + " " + nonce
    signature = onboarding_transaction_signing_address.sign(message)
    status = Transaction.Transaction.process_transaction(Transaction.Transaction.TRX_DEPOSIT, amount, fee, source, destination_pubkey, message, signature, nonce, layer1_transaction_id)

    return status

def withdrawalBroadcasted(_layer1_transaction_id, _layer1_transaction_vout, _layer1_address,  _amount, _layer2_withdrawal_id, _signature):
    if(not KeyVerification.verifyWithdrawalBroadcasted(_layer1_transaction_id, _layer1_transaction_vout, _layer1_address, _amount, _layer2_withdrawal_id, _signature)):
        return ErrorMessage.ERROR_CANNOT_VERIFY_SIGNATURE
     
    withdrawalConfirmation = ConfirmedWithdrawals(layer1_transaction_id = _layer1_transaction_id, layer1_transaction_vout =_layer1_transaction_vout, layer1_address = _layer1_address, amount = _amount, layer2_withdrawal_id = _layer2_withdrawal_id, broadcasted_signature = _signature)
    ConfirmedWithdrawals.put(withdrawalConfirmation)
    return ErrorMessage.ERROR_SUCCESS

def withdrawalConfirmed(_layer1_transaction_id, _layer1_transaction_vout,  _layer1_address, _amount, _signature):
    status = ErrorMessage.ERROR_SUCCESS
    if(not KeyVerification.verifyWithdrawalConfirmed(_layer1_transaction_id, _layer1_transaction_vout, _layer1_address, _amount, _signature)):
        return ErrorMessage.ERROR_CANNOT_VERIFY_SIGNATURE

    withdrawals = ConfirmedWithdrawals.getWithdrawals(_layer1_transaction_id, _layer1_transaction_vout)
    layer2_withdrawal_ids = set()
    for withdrawal in withdrawals:
        if(withdrawal.confirmed != True):
            withdrawal.confirmed = True
            withdrawal.confirmed_signature = _signature
            ConfirmedWithdrawals.put(withdrawal)
            layer2_withdrawal_ids.add(withdrawal.layer2_withdrawal_id)
    for layer2_withdrawal_id in layer2_withdrawal_ids:
        withdrawalRequest = WithdrawalRequests.getWithdrawalRequest(layer2_withdrawal_id)
        if(withdrawalRequest):
            withdrawalRequest.status = WithdrawalRequests.WITHDRAWAL_STATUS_CONFIRMED
            withdrawalRequest.layer1_transaction_id = _layer1_transaction_id
            WithdrawalRequests.put(withdrawalRequest)
            result, trx = Transaction.Transaction.get_transaction(withdrawalRequest.layer2_transaction_id)
            if(trx):
                trx.layer1_transaction_id = _layer1_transaction_id
                Transaction.Transaction.put(trx)
    return status

def getWithdrawalRequests(latest_timestamp):
    return WithdrawalRequests.getWithdrawalRequests(latest_timestamp)

def ackWithdrawalRequests(layer2_withdrawal_ids):
    return WithdrawalRequests.ackWithdrawalRequests(layer2_withdrawal_ids)

def withdrawalCanceled():
    return  ErrorMessage.ERROR_FEATURE_NOT_SUPPORTED #for now we are not supporting canceling withdrawals