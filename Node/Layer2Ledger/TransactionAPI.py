from Transaction import Transaction
import ErrorMessage
import Address
import time
import logging
import json
import datetime
import types
from types import SimpleNamespace
from InstaChainAPI import InstachainRequestHandler
from NodeInfoAPI import NODE_ID
from signing_keys import ONBOARDING_DEPOSIT_SIGNING_KEY_PUBKEY
import GlobalLogging
import KeyVerification

MAX_NUMBER_OF_GETBALANCE_ADDRESSES = 10
MAX_NUMBER_OF_GETTRANSACTIONS_ADDRESSES = 10

class pushTransaction(InstachainRequestHandler):
    def getParameters(self):
        GlobalLogging.logger.log_text("getParameters() called")
        self.amount = int(self.getPostRequestParams('amount') or 0)
        self.fee = int(self.getPostRequestParams('fee') or 0)
        self.source_address_public_key = self.getPostRequestParams('source_address_public_key')
        self.destination_address_public_key = self.getPostRequestParams('destination_address_public_key')
        self.signature = self.getPostRequestParams('signature')
        self.transaction_id = self.getPostRequestParams('transaction_id')
        
    def processRequest(self):
        if(self.source_address_public_key != ONBOARDING_DEPOSIT_SIGNING_KEY_PUBKEY):
            message = KeyVerification.buildTransferMessage(self.source_address_public_key, self.destination_address_public_key, self.amount, self.fee, self.transaction_id)
            status = Transaction.process_transaction(Transaction.TRX_TRANSFER, self.amount, self.fee, self.source_address_public_key, self.destination_address_public_key, message, self.signature, self.transaction_id)
            self.result = ErrorMessage.build_error_message(status)
        else:
            self.result = ErrorMessage.build_error_message(ErrorMessage.ERROR_CANNOT_TRANSFER_USING_ONBOARDING_KEY)

        GlobalLogging.logger.log_text("response: " + json.dumps(self.result))

class getTransaction(InstachainRequestHandler):
    def getParameters(self):
        self.transaction_id = self.getRequestParams('transaction_id')
    def processRequest(self):
        rslt, transaction = Transaction.get_transaction(self.transaction_id)
        self.result = ErrorMessage.build_error_message(rslt)
        self.result['transaction_id'] = self.transaction_id #So that the client can identify the transaction_id they searched for in the response
        if(transaction is not None):
            self.result['transaction'] = transaction.to_dict()

class getAllTransactionsOfPublicKey(InstachainRequestHandler):
    def getParameters(self):
        self.jsonParam = self.getPostJsonParams()
        #self.public_keys = self.getRequestParams('public_key').split(',')

    def processRequest(self):
        request = json.loads(json.dumps(self.jsonParam), object_hook=lambda d: SimpleNamespace(**d))
        transactions_list = []
        for public_key in request.public_keys[:MAX_NUMBER_OF_GETTRANSACTIONS_ADDRESSES]:
            transactions = Transaction.get_all_transactions(public_key)
            transaction_dict = {}
            transaction_dict['public_key'] = public_key
            transaction_dict['transactions'] = [transaction.to_dict() for transaction in transactions]
            transactions_list.append(transaction_dict)
        self.result['transactions'] = transactions_list

class getFee(InstachainRequestHandler):
    def getParameters(self):
        return
    def processRequest(self):
        self.result['fee'] = 1

class getBalance(InstachainRequestHandler):
    def getParameters(self):
        self.jsonParam = self.getPostJsonParams()
    def processRequest(self):
        request = json.loads(json.dumps(self.jsonParam), object_hook=lambda d: SimpleNamespace(**d))
        balances = []
        for public_key in request.public_keys[:MAX_NUMBER_OF_GETBALANCE_ADDRESSES]:
            balance = type('', (), {})()
            balance.public_key = public_key
            (balance.balance, balance.address_found) = Transaction.get_balance(public_key, True, True)
            balances.append(balance)
        self.result['balance'] = [{'public_key': balance.public_key, 'balance': balance.balance, 'address_found': balance.address_found } for balance in balances]


