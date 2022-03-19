from Transaction import Transaction
import ErrorMessage
import Onboarding
import signing_keys
import Address
import time
import logging
import json
from types import SimpleNamespace
from NodeInfoAPI import NODE_ID
from InstaChainAPI import InstachainRequestHandler
import GlobalLogging
import KeyVerification

class withdrawalRequest(InstachainRequestHandler):
    def getParameters(self):
        self.public_key = self.getRequestParams('public_key')
        self.nonce = self.getRequestParams('nonce') #nonce
        self.withdrawal_address = self.getRequestParams('withdrawal_address')
        self.amount = int(self.getRequestParams('amount'))
        self.signature = self.getRequestParams('signature')

    def processRequest(self):
        message = KeyVerification.buildWithdrawalRequestMessage(self.public_key, self.withdrawal_address, self.nonce, self.amount)
        status = Transaction.process_transaction(Transaction.TRX_WITHDRAWAL_INITIATED, self.amount, 0, self.public_key, self.withdrawal_address, message, self.signature, self.nonce)

        self.result = ErrorMessage.build_error_message(status)

class getWithdrawalRequests(InstachainRequestHandler):
    def getParameters(self):
        self.latest_timestamp = int(self.getRequestParams('latest_timestamp') or 0)

    def processRequest(self):
        withdrawalRequests = Onboarding.getWithdrawalRequests(self.latest_timestamp)
        self.result = ErrorMessage.build_error_message(ErrorMessage.ERROR_SUCCESS)
        self.result['withdrawal_requests'] = [withdrawalRequest.to_dict() for withdrawalRequest in withdrawalRequests]

class ackWithdrawalRequests(InstachainRequestHandler):
    def getParameters(self):
        self.layer2_withdrawal_ids = self.getRequestParams('layer2_withdrawal_ids')

    def processRequest(self):
        Onboarding.ackWithdrawalRequests(self.layer2_withdrawal_ids)
        self.result = ErrorMessage.build_error_message(ErrorMessage.ERROR_SUCCESS)
        #self.result['withdrawal_requests'] = requests.dict()

#called from the node
class withdrawalBroadcasted(InstachainRequestHandler):
    def getParameters(self):
        self.jsonParam = self.getPostJsonParams()
        GlobalLogging.logger.log_text("Request: " + json.dumps(self.jsonParam))
    def processRequest(self):
        transactionResults = []
        request = json.loads(json.dumps(self.jsonParam), object_hook=lambda d: SimpleNamespace(**d))
        for trx in request.transactions:
            error =  ErrorMessage.build_error_message(Onboarding.withdrawalBroadcasted(trx.layer1_transaction_id, trx.layer1_transaction_vout, trx.layer1_address, trx.amount, trx.layer2_withdrawal_id, trx.signature))
            error["layer2_withdrawal_id"] = trx.layer2_withdrawal_id
            transactionResults.append(error)
        self.result = ErrorMessage.build_error_message(ErrorMessage.ERROR_SUCCESS)
        self.result["transactions"] = transactionResults

#called from the node
class withdrawalConfirmed(InstachainRequestHandler):
    def getParameters(self):
        self.jsonParam = self.getPostJsonParams()
    def processRequest(self):
        transactionResults = []
        request = json.loads(json.dumps(self.jsonParam), object_hook=lambda d: SimpleNamespace(**d))
        for trx in request.transactions:     
            error = ErrorMessage.build_error_message(Onboarding.withdrawalConfirmed(trx.layer1_transaction_id, trx.layer1_transaction_vout, trx.layer1_address, trx.amount, trx.signature))
            error["layer1_transaction_id"] = trx.layer1_transaction_id
            error["layer1_transaction_vout"] = str(trx.layer1_transaction_vout)
            transactionResults.append(error)
        self.result = ErrorMessage.build_error_message(ErrorMessage.ERROR_SUCCESS)
        self.result["transactions"] = transactionResults

#called from the node
class withdrawalCanceled(InstachainRequestHandler):
    def getParameters(self):
        self.public_key = self.getRequestParams('public_key')
        self.withdrawal_address = self.getRequestParams('transaction_id')
        self.amount = int(self.getRequestParams('amount'))
        self.signature = self.getRequestParams('signature')
    def processRequest(self):
        rslt, transaction_id = Onboarding.withdrawalCanceled(self.public_key, self.withdrawal_address, self.amount, self.signature)
        self.result = ErrorMessage.build_error_message(rslt)
        self.result['transaction_id'] = transaction_id

class getNewDepositAddress(InstachainRequestHandler):
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

class verifyDepositAddress(InstachainRequestHandler):
    def getParameters(self):
        self.transaction_id = self.getRequestParams('public_key')
        self.transaction_id = self.getRequestParams('deposit_address')
    def processRequest(self):
        pass

#called from the btc node
class depositConfirmed(InstachainRequestHandler):
    def getParameters(self):
        self.jsonParam = self.getPostJsonParams()
    def processRequest(self):
        transactionResults = []
        request = json.loads(json.dumps(self.jsonParam), object_hook=lambda d: SimpleNamespace(**d))
        for trx in request.transactions:
            error =  ErrorMessage.build_error_message(Onboarding.depositConfirmed(trx.layer1_transaction_id, trx.layer1_transaction_vout, trx.layer1_address, trx.amount, trx.signature))
            error["layer1_transaction_id"] = trx.layer1_transaction_id
            error["layer1_transaction_vout"] = str(trx.layer1_transaction_vout)
            transactionResults.append(error)
        self.result = ErrorMessage.build_error_message(ErrorMessage.ERROR_SUCCESS)
        self.result["transactions"] = transactionResults