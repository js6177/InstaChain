from Transaction import Transaction
import ErrorMessage
import Onboarding
import signing_keys
import Address
import time
import logging
import json
from NodeInfoAPI import NODE_ID
from BlitzAPI import BlitzRequestHandler

class withdrawalRequest(BlitzRequestHandler):
    def getParameters(self):
        self.public_key = self.getRequestParams('public_key')
        self.nonce = self.getRequestParams('nonce') #nonce
        self.withdrawal_address = self.getRequestParams('withdrawal_address')
        self.amount = int(self.getRequestParams('amount'))
        self.signature = self.getRequestParams('signature')

    def processRequest(self):
        message = NODE_ID + " " + str(Transaction.TRX_WITHDRAWAL_INITIATED) + " " + self.public_key + " " + self.withdrawal_address + ' ' + self.nonce + ' ' + str(self.amount)
        status = Transaction.process_transaction(Transaction.TRX_WITHDRAWAL_INITIATED, self.amount, 0, self.public_key, self.withdrawal_address, message, self.signature, self.nonce)

        self.result = ErrorMessage.build_error_message(status)

class getWithdrawalRequests(BlitzRequestHandler):
    def getParameters(self):
        self.latest_timestamp = int(self.getRequestParams('latest_timestamp') or 0)

    def processRequest(self):
        withdrawalRequests = Onboarding.getWithdrawalRequests(self.latest_timestamp)
        self.result = ErrorMessage.build_error_message(ErrorMessage.ERROR_SUCCESS)
        self.result['withdrawal_requests'] = [withdrawalRequest.to_dict() for withdrawalRequest in withdrawalRequests]

class ackWithdrawalRequests(BlitzRequestHandler):
    def getParameters(self):
        self.guids = self.getRequestParams('guids')

    def processRequest(self):
        Onboarding.ackWithdrawalRequests(self.guids)
        self.result = ErrorMessage.build_error_message(ErrorMessage.ERROR_SUCCESS)
        #self.result['withdrawal_requests'] = requests.dict()

#called from the node
class withdrawalConfirmed(BlitzRequestHandler):
    def getParameters(self):
        self.public_key = self.getRequestParams('public_key')
        self.withdrawal_address = self.getRequestParams('transaction_id')
        self.layer1_transaction_id = self.getRequestParams('layer1_transaction_id')
        self.amount = int(self.getRequestParams('amount'))
        self.signature = self.getRequestParams('signature')
    def processRequest(self):
        rslt, transaction_id = Onboarding.withdrawalConfirmed(self.public_key, self.withdrawal_address, self.amount, self.signature)
        self.result = ErrorMessage.build_error_message(rslt)
        self.result['transaction_id'] = transaction_id

#called from the node
class withdrawalCanceled(BlitzRequestHandler):
    def getParameters(self):
        self.public_key = self.getRequestParams('public_key')
        self.withdrawal_address = self.getRequestParams('transaction_id')
        self.amount = int(self.getRequestParams('amount'))
        self.signature = self.getRequestParams('signature')
    def processRequest(self):
        rslt, transaction_id = Onboarding.withdrawalCanceled(self.public_key, self.withdrawal_address, self.amount, self.signature)
        self.result = ErrorMessage.build_error_message(rslt)
        self.result['transaction_id'] = transaction_id

class getNewDepositAddress(BlitzRequestHandler):
    def getParameters(self):
        self.public_key = self.getRequestParams('public_key')
        self.nonce = self.getRequestParams('nonce')
        self.signature = self.getRequestParams('signature')
    def processRequest(self):
        rslt, address = Onboarding.getDepositAddress(self.public_key, self.nonce, self.signature)
        self.result = ErrorMessage.build_error_message(rslt)
        if(rslt == ErrorMessage.ERROR_SUCCESS):
            self.result['deposit_address'] = address
        else:
            self.result['deposit_address'] = ''
        #rslt, transaction = Transaction.get_transaction(self.transaction_id)
        #self.result = ErrorMessage.build_error_message(rslt)
        #self.result['transaction'] = transaction.to_dict()

class verifyDepositAddress(BlitzRequestHandler):
    def getParameters(self):
        self.transaction_id = self.getRequestParams('public_key')
        self.transaction_id = self.getRequestParams('deposit_address')
    def processRequest(self):
        pass
        #rslt, transaction = Transaction.get_transaction(self.transaction_id)
        #self.result = ErrorMessage.build_error_message(rslt)
        #self.result['transaction'] = transaction.to_dict()

#called from the btc node
class depositConfirmed(BlitzRequestHandler):
    def getParameters(self):
        self.nonce = self.getRequestParams('nonce')
        self.layer1_transaction_id = self.getRequestParams('layer1_transaction_id')
        self.amount = int(self.getRequestParams('amount'))
        self.layer1_address = self.getRequestParams('layer1_address')
        self.signature = self.getRequestParams('signature')
    def processRequest(self):

        #verify that is it is signed correctly
        #message = Transaction.TRX_DEPOSIT  + " " + signing_keys.deposit_signing_key_pubkey + " " + destination + " " + str(amount) + " " + str(fee) + " " + nonce
        rslt = Onboarding.depositConfirmed(self.layer1_transaction_id, self.amount, self.layer1_address, self.nonce, self.signature)
        self.result = ErrorMessage.build_error_message(rslt)

