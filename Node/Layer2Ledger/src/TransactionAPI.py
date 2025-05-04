from Transaction import Transaction
import ErrorMessage
import Address as Address
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
from services.messages.Layer2Ledger.Responses.GetBalanceResponse import GetBalanceResponse, GetBalanceResponseBalance
from services.messages.Layer2Ledger.Responses.GetTransactionResponse import GetTransactionResponse
from services.messages.Layer2Ledger.Responses.GetTransactionsResponse import GetTransactionsResponse, GetTransactionsResponseTransaction, TransactionGroup
from services.messages.Layer2Ledger.Requests.PushTransactionRequest import PushTransactionRequest
from services.messages.Layer2Ledger.Requests.GetBalanceRequest import GetBalanceRequest
from services.messages.Layer2Ledger.Requests.GetTransactionsRequest import GetTransactionsRequest
from services.messages.Layer2Ledger.Requests.GetTransactionRequest import GetTransactionRequest
from services.messages.Layer2Ledger.Requests.GetFeeRequest import GetFeeRequest
from services.messages.Layer2Ledger.Responses.GetFeeResponse import GetFeeResponse


MAX_NUMBER_OF_GETBALANCE_ADDRESSES = 10
MAX_NUMBER_OF_GETTRANSACTIONS_ADDRESSES = 10

class pushTransaction(InstachainRequestHandler):
    def __init__(self):
        super().__init__()
        self.request: PushTransactionRequest = None

    def getParameters(self):
        request_dict = self.getPostJsonParams()
        self.request = PushTransactionRequest(**request_dict)

    def processRequest(self):
        if self.request.source_address_public_key != ONBOARDING_DEPOSIT_SIGNING_KEY_PUBKEY:
            message = KeyVerification.buildTransferMessage(
                self.request.source_address_public_key,
                self.request.destination_address_public_key,
                self.request.amount,
                self.request.fee,
                self.request.transaction_id
            )
            status = Transaction.process_transaction(
                Transaction.TRX_TRANSFER,
                self.request.amount,
                self.request.fee,
                self.request.source_address_public_key,
                self.request.destination_address_public_key,
                message,
                self.request.signature,
                self.request.transaction_id
            )
            self.result = GetTransactionResponse(
                **ErrorMessage.build_error_message(status),
                transaction_id=self.request.transaction_id
            )
        else:
            self.result = GetTransactionResponse(
                **ErrorMessage.build_error_message(ErrorMessage.ERROR_CANNOT_TRANSFER_USING_ONBOARDING_KEY),
                transaction_id=self.request.transaction_id
            )

        GlobalLogging.log_text("response: " + str(self.result))

class getTransaction(InstachainRequestHandler):
    def __init__(self):
        super().__init__()
        self.request: GetTransactionRequest = None

    def getParameters(self):
        request_dict = self.getPostJsonParams()
        self.request = GetTransactionRequest(**request_dict)

    def processRequest(self):
        rslt, transaction = Transaction.get_transaction(self.request.transaction_id)
        self.result = GetTransactionResponse(
            **ErrorMessage.build_error_message(rslt),
            transaction=transaction.to_dict() if transaction else None,
            transaction_id=self.request.transaction_id
        )

class getAllTransactionsOfPublicKey(InstachainRequestHandler):
    def __init__(self):
        super().__init__()
        self.request: GetTransactionsRequest = None

    def getParameters(self):
        request_dict = self.getPostJsonParams()
        self.request = GetTransactionsRequest(**request_dict)

    def processRequest(self):
        transactions_list = []
        for public_key in list(self.request.public_keys)[:MAX_NUMBER_OF_GETTRANSACTIONS_ADDRESSES]:
            transactions = Transaction.get_all_transactions(public_key)
            transaction_group = TransactionGroup(
                public_key=public_key,
                transactions=[
                    GetTransactionsResponseTransaction(
                        amount=transaction.amount,
                        destination_address_pubkey=transaction.destination_address_pubkey,
                        fee=transaction.fee,
                        layer1_transaction_id=transaction.layer1_transaction_id,
                        layer2_withdrawal_id=transaction.layer2_withdrawal_id,
                        signature=transaction.signature,
                        signature_date=transaction.signature_date,
                        source_address_pubkey=transaction.source_address_pubkey,
                        timestamp=transaction.timestamp,
                        transaction_id=transaction.transaction_id,
                        transaction_type=transaction.transaction_type
                    ) for transaction in transactions
                ]
            )
            transactions_list.append(transaction_group)

        self.result = GetTransactionsResponse(
            **ErrorMessage.build_error_message(ErrorMessage.ERROR_SUCCESS),
            transactions=transactions_list
        )

class getFee(InstachainRequestHandler):
    def __init__(self):
        super().__init__()
        self.request: GetFeeRequest = None

    def getParameters(self):
        request_dict = self.getPostJsonParams()
        self.request = GetFeeRequest(**request_dict)

    def processRequest(self):
        self.result = GetFeeResponse(
            **ErrorMessage.build_error_message(ErrorMessage.ERROR_SUCCESS),
            fee=1
        )

class getBalance(InstachainRequestHandler):
    def __init__(self):
        super().__init__()
        self.request: GetBalanceRequest = None

    def getParameters(self):
        request_dict = self.getPostJsonParams()
        self.request = GetBalanceRequest(**request_dict)

    def processRequest(self):
        balances: list[GetBalanceResponseBalance] = []
        for public_key in list(self.request.public_keys)[:MAX_NUMBER_OF_GETBALANCE_ADDRESSES]:
            balance: GetBalanceResponseBalance = GetBalanceResponseBalance()
            balance.public_key = public_key
            (balance.balance, balance.address_found) = Transaction.get_balance(public_key, True)
            balances.append(balance)
        self.result = GetBalanceResponse(
            **ErrorMessage.build_error_message(ErrorMessage.ERROR_SUCCESS),
            balance=balances
        )


