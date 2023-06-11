from google.cloud import ndb
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
from bip_utils import Bip32, Bip32Utils, Bip32Conf, BitcoinConf, Bip44BitcoinTestNet, WifEncoder, P2PKH

import GlobalLogging

DEPOSIT_WALLET_MASTER_PUBKEY = os.environ.get('DEPOSIT_WALLET_MASTER_PUBKEY')

BIP32_MAX_INDEX = 2147483647 # (2^31)-1

class MasterPublicKeyIndex(ndb.Model):
    mpk_index = ndb.IntegerProperty()

    @staticmethod
    @ndb.transactional()
    def getIndexAndAtomicallyIncrement():
        _index = None
        rows = MasterPublicKeyIndex.query().fetch(1) #returns a list of rows
        row = None
        if(not rows):
            _index = 0
            row = MasterPublicKeyIndex(mpk_index = _index)
        else:
            row = rows[0]
            row.mpk_index += 1
            _index = row.mpk_index
        row.put()
        return _index

class WithdrawalRequests(ndb.Model):
    layer1_address = ndb.StringProperty() # layer1 address to withdraw to
    layer1_transaction_id = ndb.StringProperty() # transaction id of the confirmed layer1 transaction
    status = ndb.IntegerProperty() # status of this withdrawal
    amount = ndb.IntegerProperty() # amount withdrawing
    layer2_withdrawal_id = ndb.StringProperty()
    server_signature = ndb.StringProperty() # signed with the onboarding key. Verified by the Onboarding helper
    layer2_transaction_id = ndb.StringProperty() # transaction id that requested this withdrawal
    withdrawal_requested_timestamp = ndb.IntegerProperty() #in unix time in seconds when this withdrawal was requested

    WITHDRAWAL_STATUS_PENDING = 1 # the node has not queries this request
    WITHDRAWAL_STATUS_IN_PROGRESS = 2 # the node has queried, but the transaction has not been broadcasted
    WITHDRAWAL_STATUS_CONFIRMED = 3 # the transaction has been confirmed

    def to_dict(self):
        return super(WithdrawalRequests, self).to_dict()

    def sign_withdrawal_request(self):
        message = self.layer1_address + ' ' + self.layer2_withdrawal_id + ' ' + self.layer2_transaction_id

    @staticmethod
    def addWithdrawalRequest(_layer1_address, _layer2_transaction_id, _amount):
        w = WithdrawalRequests(layer1_address = _layer1_address, layer2_transaction_id = _layer2_transaction_id, status = WithdrawalRequests.WITHDRAWAL_STATUS_PENDING, amount = _amount, withdrawal_requested_timestamp = int(datetime.datetime.now().timestamp()))
        w.layer2_withdrawal_id = ''.join(random.choice(string.ascii_uppercase + string.ascii_lowercase + string.digits) for _ in range(16))
        w.server_signature = w.sign_withdrawal_request()
        id = w.put()
        if(id):
            result, trx = Transaction.Transaction.get_transaction(_layer2_transaction_id)
            if(trx):
                trx.layer2_withdrawal_id = w.layer2_withdrawal_id
                trx.put()
        GlobalLogging.logger.log_text("WithdrawalRequest id " + str(id))
        

    @staticmethod
    def getWithdrawalRequests(latest_timestamp: int):
        requests = []
        GlobalLogging.logger.log_text("WithdrawalRequest latest_timestamp " + str(latest_timestamp))
        requests_query = WithdrawalRequests.query(WithdrawalRequests.withdrawal_requested_timestamp > latest_timestamp, WithdrawalRequests.status == WithdrawalRequests.WITHDRAWAL_STATUS_PENDING)
        for request in requests_query.fetch():
            requests.append(request)
        return requests

    @staticmethod
    def getWithdrawalRequest(_layer2_withdrawal_id: string):
        return WithdrawalRequests.query(WithdrawalRequests.layer2_withdrawal_id == _layer2_withdrawal_id).get()

    @staticmethod
    def ackWithdrawalRequests(layer2_withdrawal_ids):
        for layer2_withdrawal_id in layer2_withdrawal_ids:
            g = WithdrawalRequests.query(WithdrawalRequests.layer2_withdrawal_id == layer2_withdrawal_id).fetch(1)
            if(g):
                g.status = WithdrawalRequests.WITHDRAWAL_STATUS_IN_PROGRESS
                g.put()
            else:
                #log some warning message
                pass

class ConfirmedWithdrawals(ndb.Model):
    layer1_transaction_id = ndb.StringProperty()
    layer1_transaction_vout = ndb.IntegerProperty()
    layer1_address = ndb.StringProperty()
    amount = ndb.IntegerProperty()
    layer2_withdrawal_id = ndb.StringProperty()
    broadcasted_signature = ndb.StringProperty()
    confirmed_signature = ndb.StringProperty()
    confirmed = ndb.BooleanProperty(default=False)


    @staticmethod
    def getWithdrawals(layer1_transaction_id, layer1_transaction_vout):
        return ConfirmedWithdrawals.query(ConfirmedWithdrawals.layer1_transaction_id == layer1_transaction_id, ConfirmedWithdrawals.layer1_transaction_vout == layer1_transaction_vout)

class DepositAddresses(ndb.Model):
    layer2_address = ndb.StringProperty() # public key whose deposits should be credit towards
    nonce = ndb.StringProperty()
    layer1_address = ndb.StringProperty() # btc address they deposit funds into
    signature = ndb.StringProperty() # when they get a deposit address, they will sign to verify that it belongs to them
    date_requested = ndb.DateTimeProperty(default = datetime.datetime.now())
    mpk_index = ndb.IntegerProperty()

    @staticmethod
    def getLayer1DepositAddressFromLayer2AddressPubkey(_layer2_address):
        return DepositAddresses.query(DepositAddresses.layer2_address == _layer2_address).get()

    @staticmethod
    def getLayer2PubkeyFromLayer1Address(_layer1_address):
        deposit = DepositAddresses.query(DepositAddresses.layer1_address == _layer1_address).get()
        if(deposit):
            return deposit.layer2_address
        return None

# Called by user
def getDepositAddress(_layer2_address, nonce, signature):
    status = ErrorMessage.ERROR_SUCCESS
    if (not KeyVerification.verifyGetDepositAddress(_layer2_address, nonce, signature)):
        return ErrorMessage.ERROR_CANNOT_VERIFY_SIGNATURE, None

    #if the address is already created through a previous request
    deposit_adress = DepositAddresses.getLayer1DepositAddressFromLayer2AddressPubkey(_layer2_address)
    if(deposit_adress):
        return status, deposit_adress.layer1_address

    bip32_ctx = Bip32.FromExtendedKey(DEPOSIT_WALLET_MASTER_PUBKEY, Bip32Conf.KEY_NET_VER.Test())
    index = MasterPublicKeyIndex.getIndexAndAtomicallyIncrement()
    GlobalLogging.logger.log_text("getDepositAddress index: " + str(index))
    divisor = math.floor(index/BIP32_MAX_INDEX)
    remainder = index % BIP32_MAX_INDEX
    bip32_ctx = bip32_ctx.ChildKey(44).ChildKey(1).ChildKey(divisor).ChildKey(remainder)
    pubkey_bytes = bip32_ctx.PublicKey().RawCompressed().ToBytes()
    deposit_layer1_address = P2PKH.ToAddress(pubkey_bytes, BitcoinConf.P2PKH_NET_VER.Test())

    logging.info('deposit_layer1_address: ' + deposit_layer1_address)
    d = DepositAddresses(layer2_address = _layer2_address, layer1_address = deposit_layer1_address, signature = '', mpk_index = index)
    d.put()
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
    withdrawalConfirmation.put()
    return ErrorMessage.ERROR_SUCCESS

def withdrawalConfirmed(_layer1_transaction_id, _layer1_transaction_vout,  _layer1_address, _amount, _signature):
    status = ErrorMessage.ERROR_SUCCESS
    if(not KeyVerification.verifyWithdrawalConfirmed(_layer1_transaction_id, _layer1_transaction_vout, _layer1_address, _amount, _signature)):
        return ErrorMessage.ERROR_CANNOT_VERIFY_SIGNATURE

    withdrawals = ConfirmedWithdrawals.getWithdrawals(_layer1_transaction_id, _layer1_transaction_vout)
    layer2_withdrawal_ids = set()
    for withdrawal in withdrawals.fetch():
        withdrawal.confirmed = True
        withdrawal.confirmed_signature = _signature
        withdrawal.put()
        layer2_withdrawal_ids.add(withdrawal.layer2_withdrawal_id)
    for layer2_withdrawal_id in layer2_withdrawal_ids:
        withdrawalRequest = WithdrawalRequests.getWithdrawalRequest(layer2_withdrawal_id)
        if(withdrawalRequest):
            withdrawalRequest.layer1_transaction_id = _layer1_transaction_id
            withdrawalRequest.put()
            result, trx = Transaction.Transaction.get_transaction(withdrawalRequest.layer2_transaction_id)
            if(trx):
                trx.layer1_transaction_id = _layer1_transaction_id
                trx.put()
    return status

def getWithdrawalRequests(latest_timestamp):
    return WithdrawalRequests.getWithdrawalRequests(latest_timestamp)

def ackWithdrawalRequests(layer2_withdrawal_ids):
    return WithdrawalRequests.ackWithdrawalRequests(layer2_withdrawal_ids)

def withdrawalCanceled():
    return  ErrorMessage.ERROR_FEATURE_NOT_SUPPORTED #for now we are not supporting canceling withdrawals