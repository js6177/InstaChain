from Transaction import Transaction, _dropTable
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
import GlobalLogging
import KeyVerification

class pushTransaction(InstachainRequestHandler):
    def getParameters(self):
        GlobalLogging.logger.log_text("getParameters() called")
        self.amount = int(self.getPostRequestParams('amount') or 0)
        self.fee = int(self.getPostRequestParams('fee') or 0)
        self.source = self.getPostRequestParams('source_pubkey')
        self.destination = self.getPostRequestParams('destination_address')
        self.signature = self.getPostRequestParams('signature')
        self.nonce = self.getPostRequestParams('nonce')
        
    def processRequest(self):
        t = time.time()

        message = KeyVerification.buildTransferMessage(self.source, self.destination, self.amount, self.fee, self.nonce)
        status = Transaction.process_transaction(Transaction.TRX_TRANSFER, self.amount, self.fee, self.source, self.destination, message, self.signature, self.nonce)
        self.result = ErrorMessage.build_error_message(status)

        GlobalLogging.logger.log_text("response: " + json.dumps(self.result))
        elapsed_time = time.time() - t
        logging.info('Time elapsed: ' + str(elapsed_time))

class getTransaction(InstachainRequestHandler):
    def getParameters(self):
        self.transaction_id = self.getRequestParams('transaction_id')
    def processRequest(self):
        rslt, transaction = Transaction.get_transaction(self.transaction_id)
        self.result = ErrorMessage.build_error_message(rslt)
        self.result['transaction'] = transaction.to_dict()

class getAllTransactionsOfPublicKey(InstachainRequestHandler):
    def getParameters(self):
        self.public_keys = self.getRequestParams('public_key').split(',')

    def processRequest(self):
        transactions_list = []
        for public_key in self.public_keys:
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
        for public_key in request.public_keys:
            balance = type('', (), {})()
            balance.public_key = public_key
            balance.balance = Transaction.get_balance(public_key, True, True)
            balances.append(balance)
        self.result['balance'] = [{'public_key': balance.public_key, 'balance': balance.balance} for balance in balances]

#TODO: remove
class dropTable(InstachainRequestHandler):
    def postProcessRequest(self):
        _dropTable()



