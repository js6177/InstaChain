from google.cloud import ndb
import logging

from Address import Address
import ErrorMessage
from typing import List
from enum import Enum, auto
import string
import datetime
import traceback
import DebugLogger
import signing_keys
import GlobalLogging
import Onboarding
import RedisInterface

class TransactionMode(Enum):
    ADDRESSLOCK = auto() # source and destination addresses are locked, preventing duplicates
    TRANSACTION_PUTTRANSACTION = auto() # the entire put_transaction is made @ndb.transactional
    NONE = auto() # if in the future, concurrency is handled by an outside program

TRANSACTION_MODE = TransactionMode.ADDRESSLOCK
ADDRESS_BALANCE_CACHE_ENABLED = True
REDIS_ADDRESS_BALANCE_CACHE_ENABLED = True

class TotalFees(ndb.Model):
    amount = ndb.IntegerProperty(default = 0, indexed=False)

    @staticmethod
    @ndb.transactional(retries=100)
    def add_fee(fee: int):
        row = TotalFees.query().get()
        if(not row):
            row = TotalFees()
        row.amount += fee
        row.put()



class AddressLock(ndb.Model):
    address = ndb.StringProperty()
    locked = ndb.BooleanProperty(indexed=False)

    @staticmethod
    @ndb.transactional(retries=100)
    def lock(address1: str, address2: str):
        t1 = datetime.datetime.now()
        lockAcquired = False
        address1Hit = AddressLock.query(AddressLock.address == address1).get()
        address2Hit = AddressLock.query(AddressLock.address == address2).get()

        address1Free = False
        address2Free = False

        if(not address1Hit or address1Hit.locked==False):
            address1Free = True
        if(not address2Hit or address2Hit.locked==False):
            address2Free = True

        if(address1Free and address2Free):
            if(not address1Hit):
                address1Hit = AddressLock(address = address1)
            if(not address2Hit):
                address2Hit = AddressLock(address = address2)
            address1Hit.locked = True
            address2Hit.locked = True

            address1Hit.put()
            address2Hit.put()
            lockAcquired = True

        DebugLogger.TransactionDuration.logDuration(t1, address1 + '-' + address2, 'AddressLock.lock()')
        return lockAcquired

    # This does not need to be transactional, because it will be the only instance accessing the addresses untill row.put()
    @staticmethod
    def unlock(address1: str, address2: str):
        address1Hit = AddressLock.query(AddressLock.address == address1).get()
        if(address1Hit):
            address1Hit.locked = False
            address1Hit.put()
        address2Hit = AddressLock.query(AddressLock.address == address2).get()
        if(address2Hit):
            address2Hit.locked = False
            address2Hit.put()

class AddressBalanceCache(ndb.Model):
    address = ndb.StringProperty()
    balance = ndb.IntegerProperty(indexed = False)
    timestamp = ndb.DateTimeProperty(indexed = False, auto_now_add=True)

    @staticmethod
    def get(_address):
        return AddressBalanceCache.query(AddressBalanceCache.address == _address).get()

    @staticmethod
    def updateBalance(_address, _balance, updateRedisAddressBalanceCache=REDIS_ADDRESS_BALANCE_CACHE_ENABLED, transactionIdToIgnore = None):
        t1 = datetime.datetime.now()
        hit = AddressBalanceCache.get(_address)
        if(not hit):
            hit = AddressBalanceCache(address = _address, balance = Transaction.get_balance(_address, False, False, transactionIdToIgnore))
        hit.balance += _balance
        try:
            hit.put()
        except:
            hit.key.delete()
        if(updateRedisAddressBalanceCache):
            RedisInterface.set(_address, hit.balance)
        DebugLogger.TransactionDuration.logDuration(t1, _address, 'updateBalance')
        #add or updates balance

class Transaction(ndb.Model):
    timestamp = ndb.DateTimeProperty(auto_now_add=True) # date when the transaction was inserted. This does not need to be indexed, so that the db does not update/insert the index at run time and slow a transaction down . If the admin needs to view transactions in chronological order, the can index the model on the fly. 
    amount = ndb.IntegerProperty(indexed = False)
    fee = ndb.IntegerProperty(indexed=False)
    source_address_pubkey = ndb.StringProperty() # pubkey of the source address, whose corresponding private key signed the message
    destination_address_pubkey = ndb.StringProperty() # pubkey of the destination address encoded in base58
    transaction_type = ndb.IntegerProperty(indexed = False)  # can be transfer, withdrawal, or deposit
    transaction_id = ndb.StringProperty() # nonce, generated by the user
    signature = ndb.TextProperty(indexed = False)  # the signature of the message (that was signed using the private key that corresponds to the source_address)
    signature_date = ndb.IntegerProperty(indexed = False)  # date that the transaction was signed by the sender's private key, unix time
    layer1_transaction_id = ndb.StringProperty() #transaction id of layer 1 transactions, for onboarding purposes
    layer2_withdrawal_id = ndb.StringProperty()

    TRX_TRANSFER = 1  # regular 2nd layer transfer
    TRX_DEPOSIT = 2  # when a user deposits btc to a deposit address, then funds get credited to his pubkey
    TRX_WITHDRAWAL_INITIATED = 3  # when the user wants to withdraw to a btc address (locks that amount)
    TRX_WITHDRAWAL_BROADCASTED = 4 # when the transaction is broadcasted and in the mempool
    TRX_WITHDRAWAL_CANCELED = 5  # when the transaction gets removed from the layer1 mempool for any reason
    TRX_WITHDRAWAL_CONFIRMED = 6  # when the withdrawal gets confirmed in the layer1 chain
    INSTRUCTION_GET_DEPOSIT_ADDRESS = 7 # instruction to get a deposit address

    def to_dict(self):
        result = super(Transaction, self).to_dict(exclude={'timestamp'})
        result['timestamp'] = int(self.timestamp.timestamp())
        return result

    @staticmethod
    def process_transaction(_transaction_type, _amount, _fee, _source, _destination, _message, _signature, _nonce, _layer1_transaction_id = None):
        status = ErrorMessage.ERROR_UNKNOWN

        if(_amount < 0 or _fee < 0):
            return ErrorMessage.ERROR_NEGATIVE_AMOUNT

        if(_amount <= _fee):
            return ErrorMessage.ERROR_AMOUNT_LESS_THAN_FEE

        if(not _nonce.isalnum()):
            return ErrorMessage.ERROR_NOT_ALPHANUMERIC

        source = Address(_source)

        #do not check for Transaction.TRX_WITHDRAWAL_INITIATED as they are signed by server and user respectively
        if(_transaction_type in [ Transaction.TRX_WITHDRAWAL_CANCELED, Transaction.TRX_WITHDRAWAL_CONFIRMED]):
            if(_source != signing_keys.FULLNODE_SIGNING_KEY_PUBKEY):
                return ErrorMessage.ERROR_ONBOARDING_PUBKEY_MISMATCH

        #verify signature
        signature_verified = source.verify_signature(_message, _signature) # verify signature
        if(not signature_verified):
            return ErrorMessage.ERROR_CANNOT_VERIFY_SIGNATURE

        #onboarding checking
        if(_layer1_transaction_id):
            trx_exists = Transaction.query(Transaction.layer1_transaction_id == _layer1_transaction_id).get()
            if(trx_exists and (_transaction_type not in [Transaction.TRX_WITHDRAWAL_CONFIRMED, Transaction.TRX_WITHDRAWAL_CANCELED])):
                return ErrorMessage.ERROR_CANNOT_DUPLICATE_TRANSACTION #make sure DEPOSIT doesn't get saved twice

            if(trx_exists and _transaction_type == Transaction.TRX_WITHDRAWAL_CANCELED):
                return ErrorMessage.ERROR_FEATURE_NOT_SUPPORTED
                original_withdrawal_request = Transaction.query(Transaction.layer1_transaction_id == _layer1_transaction_id, Transaction.transaction_type == Transaction.TRX_WITHDRAWAL_INITIATED).get()
                if(not original_withdrawal_request):
                    return ErrorMessage.ERROR_COULD_NOT_FIND_WITHDRAWAL_REQUEST #make sure we don't cancel withdraw if the withdrawal request isn't there
                for trx in trx_exists:
                    if(trx.transaction_type == Transaction.TRX_WITHDRAWAL_CANCELED):
                        return ErrorMessage.ERROR_CANNOT_CANCEL_WITHDRAWAL_MULTIPLE_TIMES #make sure TRX_WITHDRAWAL_CANCELED doesn't get saved twice

        if(TRANSACTION_MODE == TransactionMode.ADDRESSLOCK):
            try:
                if(AddressLock.lock(_source, _destination)):
                    try:
                        status = Transaction.put_transaction(_transaction_type, source, _amount, _fee, _destination, _message, _signature, _nonce, _layer1_transaction_id)
                    except Exception as ex:
                        GlobalLogging.logger.log_text(traceback.format_exc())
                    finally:
                        AddressLock.unlock(_source, _destination) # always unlock addresses, success or exception
                else:
                    return ErrorMessage.ERROR_ADDRESS_LOCKED
            except Exception as ex:
                return ErrorMessage.ERROR_DATABASE_TRANSACTIONAL_ERROR
        elif(TRANSACTION_MODE == TransactionMode.TRANSACTION_PUTTRANSACTION):
            try:
                status = Transaction.transactional_put_transaction(_transaction_type, source, _amount, _fee, _destination, _message, _signature, _nonce, _layer1_transaction_id)
            except Exception as ex:
                GlobalLogging.logger.log_text(traceback.format_exc())
                return ErrorMessage.ERROR_DATABASE_TRANSACTIONAL_ERROR

        if((_transaction_type == Transaction.TRX_WITHDRAWAL_INITIATED) and (status == ErrorMessage.ERROR_SUCCESS)):
            Onboarding.WithdrawalRequests.addWithdrawalRequest(_destination, _nonce, _amount)
        return status

    
    @staticmethod
    @ndb.transactional(retries=100)
    def transactional_put_transaction(_transaction_type, source, _amount, _fee, _destination, _message, _signature, _transaction_id, _layer1_transaction_id = None):
        return Transaction.put_transaction(_transaction_type, source, _amount, _fee, _destination, _message, _signature, _transaction_id, _layer1_transaction_id)

    #once a trx's signature and nonce have been verified, time to get the balanace and write to it the database
    @staticmethod
    def put_transaction(_transaction_type, source, _amount, _fee, _destination, _message, _signature, _transaction_id, _layer1_transaction_id = None):
        t1 = datetime.datetime.now()
        status = ErrorMessage.ERROR_UNKNOWN
        nonce_exists = Transaction.query(Transaction.transaction_id == _transaction_id).get()
        if(nonce_exists):
            status = ErrorMessage.ERROR_DUPLICATE_TRANSACTION_ID
        else:
            balance = Transaction.get_balance(source.pubkey, ADDRESS_BALANCE_CACHE_ENABLED)
            if (balance >= _amount or (_transaction_type == Transaction.TRX_DEPOSIT)):                                 
                trx = Transaction(amount=_amount, fee=_fee, source_address_pubkey=source.pubkey,
                                  destination_address_pubkey=_destination, transaction_type=_transaction_type,
                                  signature=_signature, transaction_id=_transaction_id, layer1_transaction_id = _layer1_transaction_id)
                try:
                    trx.put()  # save it to the DB
                except:
                    GlobalLogging.logger.log_text("put_transaction: Failed to insert transaction")
                    return ErrorMessage.ERROR_FAILED_TO_WRITE_TO_DATABASE
                #in the balance cache, update the cache
                updateAdressBalanceCache = (ADDRESS_BALANCE_CACHE_ENABLED and _transaction_type != Transaction.TRX_WITHDRAWAL_CONFIRMED)
                if (updateAdressBalanceCache):
                    #GlobalLogging.logger.log_text("updating AddressBalanceCache")
                    AddressBalanceCache.updateBalance(source.pubkey, -_amount, REDIS_ADDRESS_BALANCE_CACHE_ENABLED, trx.key)
                    AddressBalanceCache.updateBalance(_destination, _amount-_fee, REDIS_ADDRESS_BALANCE_CACHE_ENABLED, trx.key)
                TotalFees.add_fee(_fee)
                status = ErrorMessage.ERROR_SUCCESS
            else:
                status = ErrorMessage.ERROR_INSUFFICIENT_FUNDS
        DebugLogger.TransactionDuration.logDuration(t1, _transaction_id, 'put_transaction')
        return status

    @staticmethod
    def get_balance(pubkey, useCache = True, useRedisAddressBalanceCache = False, transactionIdToIgnore = None):
        
        t1 = datetime.datetime.now()
        trx_count = 0 #for logging, use to hold the count of transactions. Do lot use Query.count() method, as it will recalculate

        if(useRedisAddressBalanceCache):
            balance = RedisInterface.get(pubkey)
            if(balance != None):
                DebugLogger.TransactionDuration.logDuration(t1, pubkey, 'get_balance (from RedisAddressBalanceCache)', trx_count)
                return int(balance)

        address = Address(pubkey)
        balance = 0
        balance_found_from_cache = False
        if(useCache):
            hit = AddressBalanceCache.get(address.pubkey)
            if(hit):
                balance = hit.balance
                balance_found_from_cache = True

        if(not balance_found_from_cache):
            output_transactions = Transaction.query(Transaction.source_address_pubkey == address.pubkey)
            input_transactions = Transaction.query(Transaction.destination_address_pubkey == address.pubkey)

            for output in output_transactions.fetch():
                if(output.key != transactionIdToIgnore):
                #ignore TRX_WITHDRAWAL_CONFIRMED for now, we don't want to subtract twice
                    balance -= output.amount
                    trx_count += 1

            for input in input_transactions.fetch():
                if(input.transaction_type != Transaction.TRX_WITHDRAWAL_CONFIRMED):
                    if(input.key != transactionIdToIgnore):
                        balance += input.amount - input.fee
                        trx_count += 1

        DebugLogger.TransactionDuration.logDuration(t1, address.pubkey, 'get_balance', trx_count)
        return balance

    @staticmethod
    def get_transaction(transaction_id):
        t1 = datetime.datetime.now()

        result = ErrorMessage.ERROR_SUCCESS
        transaction = Transaction.query(Transaction.transaction_id == transaction_id).get()
        if(not transaction):
            result = ErrorMessage.ERROR_TRANSACTION_ID_NOT_FOUND

        DebugLogger.TransactionDuration.logDuration(t1, transaction_id, 'get_transaction')
        return result, transaction

    @staticmethod
    def get_all_transactions(public_key):
        t1 = datetime.datetime.now()
        address = Address(public_key)
        transactions = []
        output_transactions = Transaction.query(Transaction.source_address_pubkey == public_key)
        for trx in output_transactions.fetch():
            transactions.append(trx)
        input_transactions = Transaction.query(Transaction.destination_address_pubkey == address.pubkey)
        for trx in input_transactions.fetch():
            transactions.append(trx)
        DebugLogger.TransactionDuration.logDuration(t1, public_key, 'get_all_transactions', len(transactions))
        return transactions


