from Transaction import Transaction, _dropTable
import ErrorMessage
import Address
import time
import logging
import json
import datetime
import types
from BlitzAPI import BlitzRequestHandler
from NodeInfoAPI import NODE_ID
import GlobalLogging

#TODO make this a blitz request handler
class pushTransaction(BlitzRequestHandler):
    def getParameters(self):
        GlobalLogging.logger.log_text("getParameters() called")
        self.amount = int(self.getPostRequestParams('amount') or 0)
        self.fee = int(self.getPostRequestParams('fee') or 0)
        self.source = self.getPostRequestParams('source_pubkey')
        #self.source = "test"
        self.destination = self.getPostRequestParams('destination_address')
        self.signature = self.getPostRequestParams('signature')
        #message = self.getRequestParams('message')
        self.nonce = self.getPostRequestParams('nonce')
        
    def processRequest(self):
        t = time.time()

        message = NODE_ID + " " + "1 " + self.source + " " + self.destination + " " + str(self.amount) + " " + str(self.fee) + " " + self.nonce
        status = Transaction.add_transaction(Transaction.TRX_TRANSFER, self.amount, self.fee, self.source, self.destination, message, self.signature, self.nonce)
        self.result = ErrorMessage.build_error_message(status)

        GlobalLogging.logger.log_text("response: " + json.dumps(self.result))
        elapsed_time = time.time() - t
        logging.info('Time elapsed: ' + str(elapsed_time))

class getTransaction(BlitzRequestHandler):
    def getParameters(self):
        self.transaction_id = self.getRequestParams('transaction_id')
    def processRequest(self):
        rslt, transaction = Transaction.get_transaction(self.transaction_id)
        self.result = ErrorMessage.build_error_message(rslt)
        self.result['transaction'] = transaction.to_dict()

class getAllTransactionsOfPublicKey(BlitzRequestHandler):
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

class getFee(BlitzRequestHandler):
    def getParameters(self):
        return
    def processRequest(self):
        self.result['fee'] = 1

class getBalance(BlitzRequestHandler):
    def getParameters(self):
        self.public_keys = filter(None, self.getRequestParams('public_key').split(','))
    def processRequest(self):
        balances = []
        for public_key in self.public_keys:
            balance = type('', (), {})()
            balance.public_key = public_key
            balance.balance = Transaction.get_balance(public_key)
            balances.append(balance)
        self.result['balance'] = [{'public_key': balance.public_key, 'balance': balance.balance} for balance in balances]

#TODO: remove
class dropTable(BlitzRequestHandler):
    def postProcessRequest(self):
        _dropTable()



