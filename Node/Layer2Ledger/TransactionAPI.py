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
from services.messages.Layer2Ledger.Requests.PushTransactionRequest import PushTransactionRequest
from services.messages.Layer2Ledger.Requests.GetBalanceRequest import GetBalanceRequest
from services.messages.Layer2Ledger.Requests.GetTransactionsRequest import GetTransactionsRequest
from services.messages.Layer2Ledger.Requests.GetTransactionRequest import GetTransactionRequest
from services.messages.Layer2Ledger.Requests.GetFeeRequest import GetFeeRequest

MAX_NUMBER_OF_GETBALANCE_ADDRESSES = 10
MAX_NUMBER_OF_GETTRANSACTIONS_ADDRESSES = 10

class pushTransaction(InstachainRequestHandler):
    def getParameters(self):
        request_dict = self.getPostJsonParams()
        self.request: PushTransactionRequest = PushTransactionRequest(**request_dict)
        
    def processRequest(self):
        if(self.request.source_address_public_key != ONBOARDING_DEPOSIT_SIGNING_KEY_PUBKEY):
            message = KeyVerification.buildTransferMessage(self.request.source_address_public_key, self.request.destination_address_public_key, self.request.amount, self.request.fee, self.request.transaction_id)
            status = Transaction.process_transaction(Transaction.TRX_TRANSFER, self.request.amount, self.request.fee, self.request.source_address_public_key, self.request.destination_address_public_key, message, self.request.signature, self.request.transaction_id)
            self.result = ErrorMessage.build_error_message(status)
        else:
            self.result = ErrorMessage.build_error_message(ErrorMessage.ERROR_CANNOT_TRANSFER_USING_ONBOARDING_KEY)

        GlobalLogging.log_text("response: " + json.dumps(self.result))

class getTransaction(InstachainRequestHandler):
    def getParameters(self):
        request_dict = self.getPostJsonParams()
        self.request: GetTransactionRequest = GetTransactionRequest(**request_dict)

    def processRequest(self):
        rslt, transaction = Transaction.get_transaction(self.request.transaction_id)  # Access field directly
        self.result = ErrorMessage.build_error_message(rslt)
        self.result['transaction_id'] = self.request.transaction_id  # Access field directly
        if transaction is not None:
            self.result['transaction'] = transaction.to_dict()

class getAllTransactionsOfPublicKey(InstachainRequestHandler):
    def getParameters(self):
        request_dict = self.getPostJsonParams()
        self.request: GetTransactionsRequest = GetTransactionsRequest(**request_dict)

    def processRequest(self):
        transactions_list = []
        for public_key in self.request.public_keys[:MAX_NUMBER_OF_GETTRANSACTIONS_ADDRESSES]:
            transactions = Transaction.get_all_transactions(public_key)
            transaction_dict = {}
            transaction_dict['public_key'] = public_key
            transaction_dict['transactions'] = [transaction.to_dict() for transaction in transactions]
            transactions_list.append(transaction_dict)
        self.result['transactions'] = transactions_list

class getFee(InstachainRequestHandler):
    def getParameters(self):
        request_dict = self.getPostJsonParams()
        self.request: GetFeeRequest = GetFeeRequest(**request_dict)
    def processRequest(self):
        self.result['fee'] = 1

class getBalance(InstachainRequestHandler):
    def getParameters(self):
        request_dict = self.getPostJsonParams()
        self.request: GetBalanceRequest = GetBalanceRequest(**request_dict)
    def processRequest(self):
        balances = []
        for public_key in self.request.public_keys[:MAX_NUMBER_OF_GETBALANCE_ADDRESSES]:
            balance = type('', (), {})()
            balance.public_key = public_key
            (balance.balance, balance.address_found) = Transaction.get_balance(public_key, True)
            balances.append(balance)
        self.result['balance'] = [{'public_key': balance.public_key, 'balance': balance.balance, 'address_found': balance.address_found } for balance in balances]


